import { ExecutionContext, HttpException } from '@nestjs/common';
import type { PinoLogger } from 'nestjs-pino';
import type { MetricsService } from '../../common/metrics/metrics.service';
import { DemoBudgetGuard } from './demo-budget.guard';
import type { BudgetSnapshot, DemoBudgetService } from './demo-budget.service';

const ATTENDEE = '7a958c2e-61d6-42cb-b74f-6b92d0d8eb52';
const RESETS_AT = new Date('2026-09-14T00:00:00.000Z');

function snapshot(overrides: Partial<BudgetSnapshot> = {}): BudgetSnapshot {
  return {
    globalUsed: 10,
    globalLimit: 200,
    attendeeUsed: 1,
    attendeeLimit: 5,
    resetsAt: RESETS_AT,
    exceeded: null,
    ...overrides,
  };
}

describe('DemoBudgetGuard', () => {
  let setHeader: jest.Mock;
  let emit: jest.Mock;
  let snapshotFn: jest.Mock;

  function makeGuard(enabled: boolean): DemoBudgetGuard {
    setHeader = jest.fn();
    emit = jest.fn();
    snapshotFn = jest.fn().mockResolvedValue(snapshot());

    const budget = {
      enabled,
      snapshot: snapshotFn,
    } as unknown as DemoBudgetService;
    const metrics = { emit } as unknown as MetricsService;
    const logger = {
      warn: jest.fn(),
      setContext: jest.fn(),
    } as unknown as PinoLogger;

    return new DemoBudgetGuard(budget, metrics, logger);
  }

  function context(body: unknown): ExecutionContext {
    return {
      switchToHttp: () => ({
        getRequest: () => ({ body }),
        getResponse: () => ({ setHeader }),
      }),
    } as unknown as ExecutionContext;
  }

  it('short-circuits without touching the database when uncapped', async () => {
    const guard = makeGuard(false);

    await expect(
      guard.canActivate(context({ attendee_id: ATTENDEE })),
    ).resolves.toBe(true);
    expect(snapshotFn).not.toHaveBeenCalled();
    expect(setHeader).not.toHaveBeenCalled();
  });

  it('advertises the remaining allowance on a permitted request', async () => {
    const guard = makeGuard(true);

    await expect(
      guard.canActivate(context({ attendee_id: ATTENDEE })),
    ).resolves.toBe(true);

    const headers = Object.fromEntries(
      setHeader.mock.calls as Array<[string, string]>,
    );
    expect(headers['X-Demo-Budget-Limit']).toBe('200');
    expect(headers['X-Demo-Budget-Remaining']).toBe('190');
    expect(headers['X-Demo-Budget-Reset']).toBe(RESETS_AT.toISOString());
    expect(headers['X-Demo-Attendee-Budget-Remaining']).toBe('4');
  });

  it('omits headers for a ceiling that is not configured', async () => {
    const guard = makeGuard(true);
    snapshotFn.mockResolvedValue(snapshot({ attendeeLimit: 0 }));

    await guard.canActivate(context({ attendee_id: ATTENDEE }));

    const names = (setHeader.mock.calls as Array<[string, string]>).map(
      ([name]) => name,
    );
    expect(names).not.toContain('X-Demo-Attendee-Budget-Limit');
  });

  it('never reports a negative remaining allowance', async () => {
    const guard = makeGuard(true);
    snapshotFn.mockResolvedValue(
      snapshot({ globalUsed: 260, attendeeUsed: 9 }),
    );

    await guard.canActivate(context({ attendee_id: ATTENDEE }));

    const headers = Object.fromEntries(
      setHeader.mock.calls as Array<[string, string]>,
    );
    expect(headers['X-Demo-Budget-Remaining']).toBe('0');
    expect(headers['X-Demo-Attendee-Budget-Remaining']).toBe('0');
  });

  it('rejects with 429 and a distinguishable error code once exhausted', async () => {
    const guard = makeGuard(true);
    snapshotFn.mockResolvedValue(
      snapshot({ globalUsed: 200, exceeded: 'global' }),
    );

    await expect(
      guard.canActivate(context({ attendee_id: ATTENDEE })),
    ).rejects.toBeInstanceOf(HttpException);

    try {
      await guard.canActivate(context({ attendee_id: ATTENDEE }));
    } catch (err) {
      const exception = err as HttpException;
      expect(exception.getStatus()).toBe(429);
      const body = exception.getResponse() as {
        error: string;
        message: string;
      };
      // The filter surfaces `error`, which is what lets a client tell a spent
      // budget apart from a burst throttle — both are 429.
      expect(body.error).toBe('DemoBudgetExhausted');
      expect(body.message).toContain(RESETS_AT.toISOString());
    }
  });

  it('sets Retry-After and emits a metric when refusing', async () => {
    const guard = makeGuard(true);
    snapshotFn.mockResolvedValue(snapshot({ exceeded: 'attendee' }));

    await expect(
      guard.canActivate(context({ attendee_id: ATTENDEE })),
    ).rejects.toBeInstanceOf(HttpException);

    const headers = Object.fromEntries(
      setHeader.mock.calls as Array<[string, string]>,
    );
    expect(Number(headers['Retry-After'])).toBeGreaterThan(0);
    expect(emit).toHaveBeenCalledWith({
      name: 'DemoBudgetRejection',
      value: 1,
      dimensions: { scope: 'attendee' },
    });
  });

  // Guards run before pipes, so the body is still unvalidated here.
  it.each([
    ['missing', {}],
    ['not a string', { attendee_id: 42 }],
    ['not a uuid', { attendee_id: 'or-1=1' }],
  ])('does not scope the count by a %s attendee_id', async (_label, body) => {
    const guard = makeGuard(true);

    await guard.canActivate(context(body));

    expect(snapshotFn).toHaveBeenCalledWith('');
  });
});
