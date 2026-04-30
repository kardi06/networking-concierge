import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';

interface CreatedEvent {
  id: string;
  title: string;
}
interface CreatedAttendee {
  id: string;
  name: string;
  role: string;
}

export async function createEvent(
  app: INestApplication,
  overrides: Partial<{
    title: string;
    startsAt: string;
    endsAt: string;
    location: string;
  }> = {},
): Promise<CreatedEvent> {
  const res = await request(app.getHttpServer() as App)
    .post('/events')
    .send({
      title: overrides.title ?? `E2E Test Event ${Date.now()}`,
      startsAt: overrides.startsAt ?? '2026-06-01T09:00:00Z',
      endsAt: overrides.endsAt ?? '2026-06-03T18:00:00Z',
      location: overrides.location ?? 'Jakarta',
    })
    .expect(201);
  return res.body as CreatedEvent;
}

export async function createAttendee(
  app: INestApplication,
  eventId: string,
  overrides: Partial<{
    name: string;
    headline: string;
    bio: string;
    company: string;
    role: string;
    skills: string[];
    lookingFor: string;
    openToChat: boolean;
  }> = {},
): Promise<CreatedAttendee> {
  const res = await request(app.getHttpServer() as App)
    .post(`/events/${eventId}/attendees`)
    .send({
      name: overrides.name ?? 'Test User',
      headline: overrides.headline ?? 'Engineer',
      bio: overrides.bio ?? 'A short bio.',
      company: overrides.company ?? 'TestCo',
      role: overrides.role ?? 'engineer',
      skills: overrides.skills ?? ['typescript'],
      lookingFor: overrides.lookingFor ?? 'co-founder',
      openToChat: overrides.openToChat ?? true,
    })
    .expect(201);
  return res.body as CreatedAttendee;
}

// ---- Anthropic Message stub builders -----------------------------------------

interface StubLlmResponse {
  content: Array<
    | { type: 'text'; text: string }
    | {
        type: 'tool_use';
        id: string;
        name: string;
        input: Record<string, unknown>;
      }
  >;
  stop_reason: 'tool_use' | 'end_turn' | 'stop_sequence' | 'max_tokens';
  usage: { input_tokens: number; output_tokens: number };
  model: string;
}

export function llmTextResponse(text: string): StubLlmResponse {
  return {
    content: [{ type: 'text', text }],
    stop_reason: 'end_turn',
    usage: { input_tokens: 1, output_tokens: 1 },
    model: 'claude-test',
  };
}

export function llmToolUse(
  id: string,
  name: string,
  input: Record<string, unknown>,
): StubLlmResponse {
  return {
    content: [{ type: 'tool_use', id, name, input }],
    stop_reason: 'tool_use',
    usage: { input_tokens: 1, output_tokens: 1 },
    model: 'claude-test',
  };
}
