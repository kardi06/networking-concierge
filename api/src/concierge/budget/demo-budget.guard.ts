import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import type { Request, Response } from 'express';
import { MetricsService } from '../../common/metrics/metrics.service';
import { BudgetSnapshot, DemoBudgetService } from './demo-budget.service';

interface BodyWithAttendee {
  attendee_id?: unknown;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Refuses a concierge turn once the day's spend ceiling is reached.
 *
 * Runs after `AttendeeThrottlerGuard` — the throttler is an in-memory check and
 * should reject a burst before we spend a database round-trip on it.
 *
 * Guards execute before pipes, so `attendee_id` has not been validated yet.
 * A malformed value is simply not counted at the per-attendee level; the
 * ValidationPipe rejects the request with a 400 moments later anyway.
 */
@Injectable()
export class DemoBudgetGuard implements CanActivate {
  constructor(
    private readonly budget: DemoBudgetService,
    private readonly metrics: MetricsService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(DemoBudgetGuard.name);
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (!this.budget.enabled) return true;

    const http = context.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();

    const body = (request.body ?? {}) as BodyWithAttendee;
    const attendeeId =
      typeof body.attendee_id === 'string' && UUID_RE.test(body.attendee_id)
        ? body.attendee_id
        : '';

    const snapshot = await this.budget.snapshot(attendeeId);
    this.setHeaders(response, snapshot);

    if (snapshot.exceeded === null) return true;

    this.metrics.emit({
      name: 'DemoBudgetRejection',
      value: 1,
      dimensions: { scope: snapshot.exceeded },
    });
    this.logger.warn(
      {
        scope: snapshot.exceeded,
        global_used: snapshot.globalUsed,
        global_limit: snapshot.globalLimit,
        attendee_used: snapshot.attendeeUsed,
        attendee_limit: snapshot.attendeeLimit,
      },
      'demo budget exhausted',
    );

    const retryAfterSec = Math.max(
      1,
      Math.ceil((snapshot.resetsAt.getTime() - Date.now()) / 1000),
    );
    response.setHeader('Retry-After', String(retryAfterSec));

    throw new HttpException(
      {
        error: 'DemoBudgetExhausted',
        message: this.explain(snapshot),
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }

  private setHeaders(response: Response, snapshot: BudgetSnapshot): void {
    if (snapshot.globalLimit > 0) {
      response.setHeader('X-Demo-Budget-Limit', String(snapshot.globalLimit));
      response.setHeader(
        'X-Demo-Budget-Remaining',
        String(Math.max(0, snapshot.globalLimit - snapshot.globalUsed)),
      );
      response.setHeader(
        'X-Demo-Budget-Reset',
        snapshot.resetsAt.toISOString(),
      );
    }
    if (snapshot.attendeeLimit > 0) {
      response.setHeader(
        'X-Demo-Attendee-Budget-Limit',
        String(snapshot.attendeeLimit),
      );
      response.setHeader(
        'X-Demo-Attendee-Budget-Remaining',
        String(Math.max(0, snapshot.attendeeLimit - snapshot.attendeeUsed)),
      );
    }
  }

  private explain(snapshot: BudgetSnapshot): string {
    const resetsAt = snapshot.resetsAt.toISOString();
    if (snapshot.exceeded === 'attendee') {
      return `You have used all ${snapshot.attendeeLimit} concierge turns allotted to a single attendee today on this public demo. The allowance resets at ${resetsAt}. Pick a different attendee_id, or run the project locally with your own ANTHROPIC_API_KEY for an uncapped instance.`;
    }
    return `This public demo has spent its daily budget of ${snapshot.globalLimit} concierge turns. Each turn is roughly six LLM round-trips, so the cap is what keeps the demo affordable to leave online. It resets at ${resetsAt}. Every other endpoint still works, and running the project locally with your own ANTHROPIC_API_KEY has no cap.`;
  }
}
