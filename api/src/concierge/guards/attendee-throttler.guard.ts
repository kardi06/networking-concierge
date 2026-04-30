import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { Request } from 'express';

interface BodyWithAttendee {
  attendee_id?: unknown;
}

/**
 * Throttle the concierge endpoint per attendee, not per IP. Default IP-based
 * tracking is wrong here — multiple attendees behind the same NAT (or behind
 * a single load balancer) would share a quota.
 */
@Injectable()
export class AttendeeThrottlerGuard extends ThrottlerGuard {
  protected getTracker(req: Request): Promise<string> {
    const body = (req.body ?? {}) as BodyWithAttendee;
    if (typeof body.attendee_id === 'string' && body.attendee_id.length > 0) {
      return Promise.resolve(`attendee:${body.attendee_id}`);
    }
    return Promise.resolve(`ip:${req.ip ?? 'unknown'}`);
  }
}
