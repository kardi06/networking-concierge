import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export interface BudgetSnapshot {
  /** Turns spent across every attendee since 00:00 UTC. */
  globalUsed: number;
  /** Global ceiling. `0` means uncapped. */
  globalLimit: number;
  /** Turns spent by this attendee since 00:00 UTC. */
  attendeeUsed: number;
  /** Per-attendee ceiling. `0` means uncapped. */
  attendeeLimit: number;
  /** Next 00:00 UTC — when both counters roll over. */
  resetsAt: Date;
  /** Which ceiling is already reached, if any. */
  exceeded: 'global' | 'attendee' | null;
}

export function startOfUtcDay(now: Date): Date {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
}

export function nextUtcMidnight(now: Date): Date {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1),
  );
}

/**
 * Daily spend ceiling for the public demo deployment.
 *
 * A concierge turn costs roughly six LLM round-trips (~US$0.09), so an
 * unprotected public endpoint is an open tap on someone's Anthropic key. The
 * per-attendee throttle alone does not help — it is keyed on a value the caller
 * chooses, so anyone can mint a fresh attendee and start a new bucket.
 *
 * Counting is derived from data the agent loop already persists rather than
 * from a new counter table: `messages` holds exactly one `role: 'user'` row per
 * turn (tool results are stored as `role: 'tool'`). That keeps the budget
 * honest across restarts and redeploys with no schema change and no Redis. The
 * cost is one COUNT per request, which is immaterial next to a 30–60 s turn.
 *
 * Both limits default to 0 (uncapped) so local development and the test suite
 * are unaffected; the deployment opts in through env.
 */
@Injectable()
export class DemoBudgetService {
  private readonly globalLimit: number;
  private readonly attendeeLimit: number;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    this.globalLimit = config.get<number>('DEMO_DAILY_TURN_LIMIT') ?? 0;
    this.attendeeLimit =
      config.get<number>('DEMO_ATTENDEE_DAILY_TURN_LIMIT') ?? 0;
  }

  /** False when neither ceiling is configured — the guard then does no work. */
  get enabled(): boolean {
    return this.globalLimit > 0 || this.attendeeLimit > 0;
  }

  async snapshot(
    attendeeId: string,
    now: Date = new Date(),
  ): Promise<BudgetSnapshot> {
    const since = startOfUtcDay(now);

    // Only count what a configured ceiling actually needs.
    const [globalUsed, attendeeUsed] = await Promise.all([
      this.globalLimit > 0 ? this.countTurns({ createdAt: { gte: since } }) : 0,
      this.attendeeLimit > 0
        ? this.countTurns({
            createdAt: { gte: since },
            conversation: { attendeeId },
          })
        : 0,
    ]);

    let exceeded: BudgetSnapshot['exceeded'] = null;
    if (this.globalLimit > 0 && globalUsed >= this.globalLimit) {
      exceeded = 'global';
    } else if (this.attendeeLimit > 0 && attendeeUsed >= this.attendeeLimit) {
      exceeded = 'attendee';
    }

    return {
      globalUsed,
      globalLimit: this.globalLimit,
      attendeeUsed,
      attendeeLimit: this.attendeeLimit,
      resetsAt: nextUtcMidnight(now),
      exceeded,
    };
  }

  private countTurns(where: Prisma.MessageWhereInput): Promise<number> {
    return this.prisma.message.count({ where: { ...where, role: 'user' } });
  }
}
