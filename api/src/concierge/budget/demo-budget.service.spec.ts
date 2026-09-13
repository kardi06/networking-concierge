import type { ConfigService } from '@nestjs/config';
import type { PrismaService } from '../../prisma/prisma.service';
import {
  DemoBudgetService,
  nextUtcMidnight,
  startOfUtcDay,
} from './demo-budget.service';

const ATTENDEE = '7a958c2e-61d6-42cb-b74f-6b92d0d8eb52';
// Deliberately late in the UTC day, so a local-timezone bug would shift the
// window onto the wrong date and fail these assertions.
const NOW = new Date('2026-09-13T23:30:00.000Z');

describe('DemoBudgetService', () => {
  let count: jest.Mock;

  function makeService(limits: {
    global?: number;
    attendee?: number;
  }): DemoBudgetService {
    count = jest.fn().mockResolvedValue(0);
    const prisma = { message: { count } } as unknown as PrismaService;
    const config = {
      get: (key: string) =>
        key === 'DEMO_DAILY_TURN_LIMIT' ? limits.global : limits.attendee,
    } as unknown as ConfigService;
    return new DemoBudgetService(prisma, config);
  }

  describe('day boundaries', () => {
    it('anchors the window to UTC midnight, not local midnight', () => {
      expect(startOfUtcDay(NOW).toISOString()).toBe('2026-09-13T00:00:00.000Z');
      expect(nextUtcMidnight(NOW).toISOString()).toBe(
        '2026-09-14T00:00:00.000Z',
      );
    });

    it('rolls the month over correctly', () => {
      const lastDay = new Date('2026-09-30T12:00:00.000Z');
      expect(nextUtcMidnight(lastDay).toISOString()).toBe(
        '2026-10-01T00:00:00.000Z',
      );
    });
  });

  describe('enabled', () => {
    it('is off when neither ceiling is configured', () => {
      expect(makeService({ global: 0, attendee: 0 }).enabled).toBe(false);
    });

    it('is on when either ceiling is configured', () => {
      expect(makeService({ global: 200, attendee: 0 }).enabled).toBe(true);
      expect(makeService({ global: 0, attendee: 5 }).enabled).toBe(true);
    });

    it('treats a missing config value as uncapped', () => {
      const config = { get: () => undefined } as unknown as ConfigService;
      const prisma = {
        message: { count: jest.fn() },
      } as unknown as PrismaService;
      expect(new DemoBudgetService(prisma, config).enabled).toBe(false);
    });
  });

  describe('counting', () => {
    it('counts only user-role messages inside the current UTC day', async () => {
      const service = makeService({ global: 200, attendee: 0 });

      await service.snapshot(ATTENDEE, NOW);

      expect(count).toHaveBeenCalledTimes(1);
      expect(count).toHaveBeenCalledWith({
        where: {
          createdAt: { gte: new Date('2026-09-13T00:00:00.000Z') },
          role: 'user',
        },
      });
    });

    it('scopes the per-attendee count through the conversation relation', async () => {
      const service = makeService({ global: 0, attendee: 5 });

      await service.snapshot(ATTENDEE, NOW);

      expect(count).toHaveBeenCalledTimes(1);
      expect(count).toHaveBeenCalledWith({
        where: {
          createdAt: { gte: new Date('2026-09-13T00:00:00.000Z') },
          conversation: { attendeeId: ATTENDEE },
          role: 'user',
        },
      });
    });

    it('issues no query at all when a ceiling is uncapped', async () => {
      const service = makeService({ global: 0, attendee: 0 });

      const snapshot = await service.snapshot(ATTENDEE, NOW);

      expect(count).not.toHaveBeenCalled();
      expect(snapshot.exceeded).toBeNull();
    });
  });

  describe('exceeded', () => {
    it('is null while under both ceilings', async () => {
      const service = makeService({ global: 200, attendee: 5 });
      count.mockResolvedValue(1);

      expect((await service.snapshot(ATTENDEE, NOW)).exceeded).toBeNull();
    });

    it('trips as soon as usage reaches the ceiling, not after', async () => {
      const service = makeService({ global: 200, attendee: 0 });
      count.mockResolvedValue(200);

      expect((await service.snapshot(ATTENDEE, NOW)).exceeded).toBe('global');
    });

    it('reports the attendee ceiling when only that one is reached', async () => {
      const service = makeService({ global: 200, attendee: 5 });
      count.mockImplementation((args: { where: Record<string, unknown> }) =>
        Promise.resolve(args.where.conversation ? 5 : 3),
      );

      expect((await service.snapshot(ATTENDEE, NOW)).exceeded).toBe('attendee');
    });

    it('reports the global ceiling first when both are reached', async () => {
      const service = makeService({ global: 200, attendee: 5 });
      count.mockResolvedValue(999);

      expect((await service.snapshot(ATTENDEE, NOW)).exceeded).toBe('global');
    });
  });

  it('reports the next UTC midnight as the reset point', async () => {
    const service = makeService({ global: 200, attendee: 0 });

    const snapshot = await service.snapshot(ATTENDEE, NOW);

    expect(snapshot.resetsAt.toISOString()).toBe('2026-09-14T00:00:00.000Z');
  });
});
