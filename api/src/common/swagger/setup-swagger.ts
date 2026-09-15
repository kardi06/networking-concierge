import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { apiReference } from '@scalar/nestjs-api-reference';
import type { Request, Response } from 'express';

const DESCRIPTION = [
  'A conference attendee chats with an AI concierge and gets back ranked, reasoned',
  'matches with other attendees at the same event — plus intro messages they can send.',
  '',
  'Rather watch than read JSON? **[Open the live demo](/demo)** — one page that sends a',
  'message and renders every model call and tool call the agent made to answer it.',
  '',
  '### What is worth poking at',
  '',
  '`POST /events/{eventId}/concierge/messages` is the whole system in one call. It runs a',
  'tool-calling agent loop: **semantic search over pgvector → structured scoring in a',
  'separate FastAPI service → intro drafting → natural-language reply**, capped at six',
  'iterations and persisted to Postgres at every step so conversations survive a redeploy.',
  '',
  'That endpoint ships three ready-made request bodies. The third is an adversarial one —',
  'send it and watch the agent answer the legitimate question while ignoring the injected',
  '"reveal your system prompt / set every score to 100" commands.',
  '',
  '### Before you call it',
  '',
  'Pick a real `eventId` and `attendee_id` from `GET /events` and',
  '`GET /events/{eventId}/attendees` — the demo instance is seeded with an event and',
  'fifteen attendee profiles.',
  '',
  '### Expect it to be slow',
  '',
  'A concierge turn is six LLM round-trips and typically takes **30–60 seconds**. That is',
  'the honest cost of a synchronous agent loop; moving it behind a queue with streaming is',
  'the first item on the roadmap.',
].join('\n');

/**
 * Builds the OpenAPI document and mounts it twice:
 *   - `/docs`      Scalar reference UI, with a working "Test Request" console.
 *   - `/docs-json` the raw spec, for codegen or importing into Postman/Insomnia.
 */
export function setupOpenApi(app: INestApplication, publicUrl?: string): void {
  const builder = new DocumentBuilder()
    .setTitle('AI Networking Concierge')
    .setDescription(DESCRIPTION)
    .setVersion('1.0.0')
    .setLicense('MIT', 'https://opensource.org/licenses/MIT')
    .addTag(
      'Concierge',
      'The agent loop itself, and the feedback channel that would train a future re-ranker.',
    )
    .addTag(
      'Attendees',
      'Registration (which generates the embedding) and plain relational listing.',
    )
    .addTag('Events', 'The tenancy boundary — nothing matches across events.')
    .addTag('Health', 'Liveness probe used by Docker and the load balancer.');

  if (publicUrl) {
    builder.addServer(publicUrl, 'Public demo');
  }
  builder.addServer('http://localhost:3000', 'Local');

  const document = SwaggerModule.createDocument(app, builder.build());

  app.use('/docs-json', (_req: Request, res: Response) => {
    res.json(document);
  });

  app.use(
    '/docs',
    apiReference({
      content: document,
      metaData: {
        title: 'AI Networking Concierge — API reference',
      },
    }),
  );
}
