# Architecture Document
## MyConnect AI Networking Concierge

**Version:** 1.1
**Author:** Kardi Ibrahim
**Last updated:** 30 April 2026
**Companion docs:** [`PRD.md`](PRD.md) · [`TECH-DECISIONS.md`](TECH-DECISIONS.md)

> **Quick reference for the four architecture questions in the take-home brief (§4 Deliverables):**
> - **Why this agent framework / vector store / LLM?** → [§5 Stack Decisions & Rationale](#5-stack-decisions--rationale)
> - **How is agent state persisted and resumed?** → [§6 Agent State Persistence & Resumption](#6-agent-state-persistence--resumption)
> - **How would you scale to 10k concurrent attendees at a single event?** → [§7 Scaling to 10,000 Concurrent Attendees](#7-scaling-to-10000-concurrent-attendees)
> - **How would you handle PII / data protection?** → [§8 PII & Data Protection](#8-pii--data-protection)

---

## 1. High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Client (Frontend)                        │
└────────────────────────────┬────────────────────────────────────┘
                             │ HTTPS / JSON
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                    NestJS API (Primary Backend)                  │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────────────────┐   │
│  │  Events     │  │  Attendees   │  │  Concierge           │   │
│  │  Module     │  │  Module      │  │  Module              │   │
│  └─────────────┘  └──────────────┘  └──────────┬───────────┘   │
│                                                 │                │
│  ┌──────────────────────────────────────────────▼────────────┐  │
│  │            Agent Orchestrator (ConciergeService)          │  │
│  │  - Load history       - Tool execution    - Persist state │  │
│  └────┬─────────────────────────┬──────────────────┬─────────┘  │
│       │                         │                  │            │
│       ▼                         ▼                  ▼            │
│  ┌─────────┐         ┌──────────────────┐    ┌─────────────┐   │
│  │  LLM    │         │  Embedding       │    │  Tool       │   │
│  │  Client │         │  Service         │    │  Executor   │   │
│  │(Anthropic)        │ (OpenAI emb.)    │    │             │   │
│  └─────────┘         └──────────────────┘    └─────┬───────┘   │
└──────────────────────────────────────────────────────┼──────────┘
                                                       │
              ┌────────────────────────────────────────┤
              │                                        │
              ▼                                        ▼
   ┌──────────────────────┐              ┌────────────────────────┐
   │  PostgreSQL          │              │  FastAPI Microservice  │
   │  + pgvector          │              │  (score_match)         │
   │                      │              │                        │
   │  - events            │              │  Python + Pydantic     │
   │  - attendees         │              │  Calls Anthropic API   │
   │  - conversations     │              │  for structured score  │
   │  - messages          │              └────────────────────────┘
   │  - tool_calls        │
   │  - feedback          │
   └──────────────────────┘
```

---

## 2. Component Breakdown

### 2.1 NestJS Primary API
Owns the entire HTTP surface, DTO validation, authentication, and business-logic orchestration. Uses standard NestJS modular architecture: each domain (Events, Attendees, Concierge) has its own module, controller, service, and DTOs.

### 2.2 Agent Orchestrator
The core of the concierge service. Responsibilities:
- Load the conversation history from the database.
- Build the messages array for the LLM API call.
- Run the tool-calling loop until the LLM returns `stop_reason: 'end_turn'` or the iteration cap is hit.
- Persist every message, tool call, and tool result.

### 2.3 LLM Client
A thin wrapper around the Anthropic SDK. Exposes a `createMessage()` method that takes messages, tools, and a system prompt. Adds retry logic, timeout, and token-usage logging.

### 2.4 Embedding Service
A wrapper around the OpenAI Embeddings API (`text-embedding-3-small`, dimension 1536). Used when an attendee is created to populate the vector column.

### 2.5 Tool Executor
Dispatches tool calls from the LLM to the matching backend implementation:
- `search_attendees` → `AttendeeSearchService`.
- `score_match` → HTTP call to the FastAPI microservice.
- `draft_intro_message` → another LLM call with a dedicated prompt.

### 2.6 PostgreSQL + pgvector
A single database for both operational data and vectors. Simplifies infrastructure (no separate vector store such as Pinecone or Weaviate). Sufficient for early scale.

### 2.7 FastAPI Score Service (Polyglot)
A small Python microservice that isolates scoring logic. Two benefits:
- Demonstrates the polyglot architecture called out in the job description.
- Provides a natural home for ML-heavy work later (re-ranking, custom embedding models).

---

## 3. Data Model

### 3.1 ER Diagram

```
Event (1) ──────────< Attendee (M)
  │                     │
  │                     │
  └─< Conversation >────┘
            │
            │ (1)
            ▼
        Message (M)
            │
            ├──< ToolCall (M)
            │
            └──< Feedback (0..1)
```

### 3.2 Core Tables

**events**
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| title | text | |
| starts_at, ends_at | timestamptz | |
| location | text | |
| created_at | timestamptz | |

**attendees**
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| event_id | uuid FK | indexed |
| name, headline, company, role | text | |
| bio, looking_for | text | |
| skills | text[] | |
| open_to_chat | boolean | |
| embedding | vector(1536) | ivfflat index |

**conversations**
One conversation per (event_id, attendee_id) pair, enforced by a unique constraint.

**messages**
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| conversation_id | uuid FK | indexed with created_at |
| role | text | 'user' \| 'assistant' \| 'tool' |
| content | text | may be JSON-stringified for assistant content blocks |
| metadata | jsonb | token usage, latency, model |

**tool_calls**
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| message_id | uuid FK | |
| tool_name | text | |
| input, output | jsonb | |
| error_text | text | nullable |
| latency_ms | int | |

**feedback**
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| message_id | uuid FK unique | one feedback per message |
| rating | int | 1-5 |
| notes | text | |

### 3.3 Indexing Strategy
- `attendees(event_id)` for per-event filtering.
- `attendees` ivfflat index on the embedding column (cosine similarity).
- `messages(conversation_id, created_at)` for ordered history loads.
- `tool_calls(message_id)` for joins during replay.

---

## 4. Concierge Turn Sequence

```
┌─────────┐        ┌──────────┐       ┌──────┐      ┌────────┐    ┌──────┐    ┌─────┐
│ Client  │        │Concierge │       │ DB   │      │  LLM   │    │ Tool │    │Score│
│         │        │ Service  │       │      │      │(Claude)│    │ Exec │    │ API │
└────┬────┘        └─────┬────┘       └──┬───┘      └────┬───┘    └──┬───┘    └──┬──┘
     │ POST message      │               │               │           │           │
     │──────────────────>│               │               │           │           │
     │                   │ load history  │               │           │           │
     │                   │──────────────>│               │           │           │
     │                   │<──────────────│               │           │           │
     │                   │ persist user msg              │           │           │
     │                   │──────────────>│               │           │           │
     │                   │ create message + tools call   │           │           │
     │                   │──────────────────────────────>│           │           │
     │                   │ tool_use: search_attendees    │           │           │
     │                   │<──────────────────────────────│           │           │
     │                   │ persist tool_call             │           │           │
     │                   │──────────────>│               │           │           │
     │                   │ execute search                │           │           │
     │                   │──────────────────────────────────────────>│           │
     │                   │ pgvector + keyword query                  │           │
     │                   │<──────────────────────────────────────────│           │
     │                   │ persist tool_result           │           │           │
     │                   │──────────────>│               │           │           │
     │                   │ continue loop, send results to LLM        │           │
     │                   │──────────────────────────────>│           │           │
     │                   │ tool_use: score_match (multiple)          │           │
     │                   │<──────────────────────────────│           │           │
     │                   │ execute score_match                       │           │
     │                   │──────────────────────────────────────────────────────>│
     │                   │<──────────────────────────────────────────────────────│
     │                   │ tool_use: draft_intro_message │           │           │
     │                   │ ... (similar loop)            │           │           │
     │                   │ stop_reason: end_turn         │           │           │
     │                   │<──────────────────────────────│           │           │
     │                   │ persist final assistant msg   │           │           │
     │                   │──────────────>│               │           │           │
     │ {reply, matches}  │               │               │           │           │
     │<──────────────────│               │               │           │           │
```

---

## 5. Stack Decisions & Rationale

### 5.1 NestJS
Required by the brief. It also fits this service well: dependency injection makes mocking the LLM straightforward in tests, the modular architecture prevents god-services, and the decorator ecosystem (class-validator, throttler) cuts boilerplate.

### 5.2 Prisma as the ORM
Primary reason: fastest developer experience among the options (TypeORM, Drizzle). Declarative schema, auto-generated migrations, type-safe client. On a two-day timeline, iteration speed beats the granular control Drizzle offers.

### 5.3 PostgreSQL + pgvector
Reason for not picking a dedicated vector store (Pinecone, Weaviate, Qdrant): one fewer service and one source of truth for the data. For early volume (tens of thousands of attendees), pgvector with an ivfflat index is performant enough. Migrating to a dedicated vector store is a future option if needed.

### 5.4 Anthropic Claude for the Agent
Chose **Claude Sonnet 4.6** for three concrete reasons:

1. **Tool calling is reliable and supports parallel tool use** — important because our agent often needs to score multiple candidates in one turn.
2. **Instruction following holds up** against long system prompts that mix workflow guidance with strict security rules (the prompt-injection defence layer leans on this).
3. **Pricing is competitive** at this reasoning quality. GPT-4o or Gemini are valid fallbacks if pricing or availability changes.

The raw Anthropic SDK is used, not LangChain. The agent loop's tool lifecycle (which iteration we are in, which tool just returned what, when to stop) is explicit and easy to step through with a debugger. LangChain would add an abstraction layer without a corresponding payoff at this scope.

### 5.5 OpenAI Embeddings
`text-embedding-3-small` was chosen for the best quality/cost ratio for semantic search at this scale. It can be swapped for an open-source model (BGE, E5) inside the FastAPI service later without changing the public API.

### 5.6 FastAPI for score_match
Isolating scoring logic provides a natural home for ML experimentation (re-ranking, custom prompts, structured output) without redeploying the whole NestJS API. This polyglot setup also matches the job description.

---

## 6. Agent State Persistence & Resumption

Each turn produces one or more rows in the following tables:

1. **messages** — one row for the user message, one for each assistant response (including those containing `tool_use` blocks), and one for each tool result.
2. **tool_calls** — one row per tool call with input, output, latency, and error if any.

When a new turn arrives, `ConciergeService` runs:
```sql
SELECT * FROM messages
WHERE conversation_id = $1
ORDER BY created_at ASC;
```
Then it reconstructs the messages array in the format Anthropic's API expects:
- User message → `{ role: 'user', content: '...' }`.
- Assistant message → `{ role: 'assistant', content: [<text and tool_use blocks>] }`.
- Tool message → merged into the next user message as a `content` array of `tool_result` blocks (per the Anthropic convention).

This makes conversations **fully resumable**: if the service restarts mid-turn, the next request resumes from the last persisted state.

### 6.1 Concurrency
A conversation has a unique constraint on `(event_id, attendee_id)`, so the database guarantees we can never end up with two parallel conversations for the same attendee at the same event.

For the take-home **per-conversation advisory locking is deferred** ([TD-004](TECH-DECISIONS.md#td-004--defer-idempotency-key--advisory-lock-bump-handler-timeout-to-90-s)). The 10-requests-per-minute throttle on the concierge endpoint is the practical defence against a single attendee accidentally firing two turns in parallel. A production deployment should add `pg_advisory_xact_lock(hashtext(conversation_id))` inside the turn handler — or, better, move turns to a queue (BullMQ + Redis) where ordering per `conversation_id` is naturally serialised by binding one worker per partition.

---

## 7. Scaling to 10,000 Concurrent Attendees

### 7.1 Load Profile
Assumption: 10,000 attendees, 30% active in chat, average 5 turns per attendee over an 8-hour event. That gives roughly 15,000 concierge turns / 8 hours = ~30 turns / second at peak.

### 7.2 Bottlenecks and Mitigations

**LLM API calls are the dominant bottleneck (3-7 seconds per turn).**
- Move execution to an async queue (BullMQ + Redis). The POST endpoint returns a `message_id` immediately; the client subscribes via server-sent events or polls.
- Concurrent worker count is tuned to fit Anthropic's rate limit (TPM/RPM).
- Cache embeddings (Redis) for frequent queries: "AI co-founder", "climate investor".

**Database read load.**
- Read replica for the GET attendees endpoint.
- Tune the connection pool (PgBouncer) to absorb spikes.
- Consider partial indexes on attendees for the most common filters.

**Vector search.**
- For volumes above 100k rows, replace ivfflat with HNSW (faster query, slower insert).
- Pre-compute "top 50 candidates per intent cluster" as a materialized view if query patterns are stable.

**LLM egress cost.**
- Use Anthropic prompt caching for the system prompt and tool definitions, which are constant.
- Truncate attendee bios to 500 characters in prompts; only send the full bio when explicitly needed.
- Set a per-event budget alert (daily token cap).

### 7.3 Stateless API
The NestJS API is deployed as stateless containers behind a load balancer (ECS Fargate or Azure Container Apps). State lives only in Postgres and Redis. Horizontal scaling means adding instances.

---

## 8. PII & Data Protection

### 8.1 Data Classification
- **Direct PII:** name, email (if used for login), bio (may contain personal information).
- **Derivative PII:** the bio embedding (partial reconstruction is possible via inversion attacks).
- **Operational:** event metadata, skills, role.

### 8.2 Controls
- **Encryption at rest:** RDS native encryption for the database; SSE-S3 for any object storage attachments.
- **Encryption in transit:** TLS for every endpoint, including service-to-service calls to FastAPI.
- **Logging:** pino's `redact` configuration in [`api/src/common/logger/logger.config.ts`](../api/src/common/logger/logger.config.ts) drops the following before any log line is written: `bio`, `looking_for`, `name`, `email` (anywhere in request or response bodies), plus the `authorization`, `cookie`, and `x-api-key` request headers. PII can still be logged at debug level behind an explicit flag for incident triage.
- **LLM provider:** use a provider with a Data Processing Agreement that disallows training on customer data (Anthropic enterprise tier, Azure OpenAI). Do not send raw bios to public OpenAI endpoints without user consent.
- **Right to delete:** cascade delete from an attendee removes all conversations, messages, tool calls, and embeddings. Add a daily job to hard-delete soft-deleted data older than 30 days.
- **Data retention:** conversations are deleted 90 days after the event ends unless the attendee opts in to keep them.
- **Jurisdictions:** for EU attendees, host the backend in an EU region; for Indonesian attendees, comply with the Personal Data Protection Law (UU PDP) regarding processing and cross-border transfer.

### 8.3 Prompt Injection as a PII Risk
Attendee bios are uncontrolled input. Without defenses, a malicious attendee could craft a bio that attempts to extract data about other attendees via system-prompt leakage. Mitigations:
- Wrap attendee content in delimiter tags (`<attendee_data>`).
- The system prompt explicitly states that content inside the tag is data, not instructions.
- Adversarial cases are part of the e2e test suite.

---

## 9. Observability

### 9.1 Logging
Pino as the structured JSON logger. Each request gets a correlation ID via middleware. Standard fields: `req_id`, `route`, `method`, `status`, `latency_ms`, `attendee_id` (when applicable).

### 9.2 LLM Telemetry
Every LLM call records the following structured fields on a single log line:
- `provider`, `model`, `input_tokens`, `output_tokens`.
- `latency_ms`, `attempt` (1–3 with retry/backoff), `iteration_index` within the agent loop.
- `stop_reason` (`end_turn` | `tool_use` | `max_tokens` | `stop_sequence`).

USD cost per turn is estimated in the README's "Cost Awareness" section. We do not yet emit a `cost_usd` field per call; computing it from token counts and a static price table is straightforward future work.

In addition to logs, two metrics are emitted via [`MetricsService`](../api/src/common/metrics/metrics.service.ts) using a `_metric` field that downstream agents (Fluent Bit / CloudWatch agent) can transform into CloudWatch EMF or Azure Monitor metrics:
- `LlmCall` — value=`latency_ms`, unit=`Milliseconds`, dimensions=`{ model, stop_reason, status }`.
- `ToolDispatch` — value=`latency_ms`, unit=`Milliseconds`, dimensions=`{ tool, status }`.

Namespace: `MyConnect/Concierge`.

### 9.3 Production Wiring
- Pino → stdout → CloudWatch Logs (via Fluent Bit) or Azure Monitor.
- Custom metric namespace: `MyConnect/Concierge` with `event_id` and `tool_name` dimensions.
- OpenTelemetry trace exporter to X-Ray or Application Insights; one span per LLM call and per tool execution.
- Alerts: p95 concierge latency > 12 seconds, error rate > 5%, daily LLM cost > threshold.

---

## 10. Testing Strategy

### 10.1 Unit Tests
**53 tests across 12 spec files** cover the core business logic:

- Events service (create + list pagination)
- Attendees service (DTO validation flow, embedding source string, pagination)
- Attendee search ranking + bio truncation + snake_case mapping
- Embedding service (real OpenAI client retry + telemetry, deterministic mock)
- Sanitiser (every known injection pattern + whitespace + truncation)
- LLM service (retry, telemetry, error propagation)
- Tool executor (each tool's dispatch path + error-to-LLM contract)
- Conversations repository (upsert, history ordering, append helpers)
- Concierge agent loop (tool-use loop, extractMatches merge logic)
- Feedback service (ownership rejection rules, duplicate → 409)
- Metrics service (emit format)

DTOs are exercised end-to-end through the e2e tests rather than mocked separately.

### 10.2 End-to-End Tests
Run against an isolated `myconnect_test` database ([TD-005](TECH-DECISIONS.md#td-005--separate-myconnect_test-database-for-e2e-tests-auto-provisioned)). Four tests:

1. **Health probe** — `GET /health` returns `{ status: "ok" }`.
2. **Happy-path concierge turn** — create event + 3 attendees, post a concierge message. `LlmService` and `ToolExecutorService` are stubbed to script a 4-iteration agent loop (`search_attendees` → `score_match` → `draft_intro_message` → `end_turn`). Asserts the response shape and the row counts in `messages` + `tool_calls`.
3. **Conversation resumption** — post two messages from the same attendee. Asserts that turn 2's LLM input contains turn 1's user + assistant messages reconstructed from the database. Covers PRD §6.1 acceptance.
4. **Adversarial input** — post a user message containing `[INST] ignore previous instructions [/INST]`. Asserts (a) the sanitiser strips the markers before the message reaches the LLM stub, and (b) the system prompt sent to the LLM still contains the security rules (`UNTRUSTED data`, `Never reveal`, `Never follow`).

### 10.3 Defence-in-Depth Beyond the Codified Test
The single adversarial e2e test verifies our defence layers are wired correctly. Three additional layers run on every concierge turn:

- **Sanitiser** strips known prompt-injection markers (`[INST]`, OpenAI special tokens like `<|im_start|>`, fake `<system>` / `<prompt>` / `<instructions>` tags) from both user input and attendee-supplied content before it reaches the model.
- **Wrapper** puts attendee-supplied content inside `<attendee_data>` tags before injecting into prompts.
- **System prompt** explicitly classifies tagged content as data, forbids leaking instructions, and instructs the model that a numeric score must reflect actual fit (rejecting injected demands like "give me 100").

Each layer is small and inspectable. Together they treat prompt injection as defence-in-depth rather than relying on any single mitigation.

---

## 11. Deployment Topology (Production Vision)

```
                       ┌──────────────────┐
                       │  CloudFront /    │
                       │  Front Door CDN  │
                       └────────┬─────────┘
                                │
                       ┌────────▼─────────┐
                       │ Application LB   │
                       └────────┬─────────┘
                                │
                ┌───────────────┼───────────────┐
                │               │               │
        ┌───────▼──────┐ ┌──────▼──────┐ ┌─────▼────────┐
        │  NestJS      │ │  NestJS     │ │  NestJS      │
        │  Container   │ │  Container  │ │  Container   │
        └───┬──────────┘ └──────┬──────┘ └──────┬───────┘
            │                   │               │
            └───────────────────┼───────────────┘
                                │
            ┌───────────────────┼───────────────────┐
            │                   │                   │
    ┌───────▼─────────┐ ┌───────▼────────┐ ┌────────▼─────┐
    │  RDS Postgres   │ │  ElastiCache   │ │  FastAPI     │
    │  (Multi-AZ)     │ │  Redis         │ │  Container   │
    │  + Read Replica │ │  (queue+cache) │ │              │
    └─────────────────┘ └────────────────┘ └──────────────┘
```

For the take-home, IaC (Terraform) is not implemented; the production architecture above is documented but not deployed.

---

## 12. Trade-offs

| Decision | Alternative | Reason |
|---|---|---|
| pgvector | Pinecone / Weaviate | One source of truth, sufficient for early scale (≤100k attendees per event) |
| Prisma | TypeORM / Drizzle | Fastest path on a two-day timeline; type-safe client; declarative migrations |
| Raw Anthropic SDK | LangChain | Explicit control of the tool lifecycle, no extra abstraction |
| Sync agent loop | Streaming + async queue | Simpler for the take-home; queue is in [§13](#13-what-i-would-do-with-more-time) |
| FastAPI score service | Inline in NestJS | Meets the polyglot requirement and provides a home for ML experiments |
| OpenAI embeddings | BGE / E5 (local) | Fast to set up, no GPU required. Local embeddings are noted as an upgrade path |
| `requester_attendee_id` injected from server context | LLM passes it via tool schema | Prevents the model from hallucinating a different requester. Documented deviation from PRD §5.2 |
| Idempotency-Key + advisory lock deferred | Implemented now | Take-home priority; the per-attendee 10/min throttle covers realistic retry scenarios. See [TD-004](TECH-DECISIONS.md#td-004--defer-idempotency-key--advisory-lock-bump-handler-timeout-to-90-s) |
| 90-second handler timeout | Async queue + SSE | Real agent loops with 6 tool calls land at ~38 s in measured runs. The original 30 s was unrealistic |
| Separate `myconnect_test` database | Same dev DB with TRUNCATE | Test isolation without risking the dev seed data. See [TD-005](TECH-DECISIONS.md#td-005--separate-myconnect_test-database-for-e2e-tests-auto-provisioned) |
| pnpm `node-linker=hoisted` | pnpm strict isolation | Required for Prisma 7 CLI to find `@prisma/engines` reliably. See [TD-007](TECH-DECISIONS.md#td-007--pnpm-node-linkerhoisted-for-prisma-7-compatibility) |

---

## 13. What I Would Do With More Time

Roughly in priority order, weighted by user impact and how much they would harden the system for real production:

1. **Streaming responses** with Server-Sent Events. The current 30–60 s synchronous wait is acceptable for a demo, not for end users.
2. **BullMQ + Redis queue** for the agent loop. Decouples HTTP latency from agent latency, lets us scale concierge workers independently of API instances, and gives a natural place to bind one worker per `conversation_id` for ordered processing.
3. **Idempotency-Key handling** with a Redis-backed dedupe window — currently deferred per [TD-004](TECH-DECISIONS.md#td-004--defer-idempotency-key--advisory-lock-bump-handler-timeout-to-90-s).
4. **Anthropic prompt caching** on the system prompt + tool definitions. They are constant across turns; caching cuts ~60 % of input tokens.
5. **Conversation summarisation** for long histories (compress old turns into a summary so the prompt budget stays manageable on multi-turn conversations).
6. **Eval framework** with a small golden dataset of `(attendee, query, expected_top_match)` triples. Run on every PR; fail if match quality regresses.
7. **OpenTelemetry tracing** end-to-end (NestJS → score-service → Anthropic). Gives a flame graph of where latency is actually spent.
8. **Terraform module** for RDS Multi-AZ, ECS Fargate, ElastiCache Redis, ALB. `terraform plan` only — keeps the demo local.
9. **GitHub Actions pipeline** for lint, unit + e2e test, image build, push to ECR.
10. **k6 load test** for `POST /concierge/messages` at 10/50/100 concurrent virtual users; report p50/p95/p99 with a writeup of the bottleneck (likely the Anthropic rate limit before our API).
11. **Re-ranking model** in the FastAPI service trained on the feedback ratings the system already collects.
12. **PII data-protection job**: cron-driven retention (delete conversations 90 days post-event) plus the cascade-delete-attendee path that already exists.
13. **Multi-language support** for Indonesian and Mandarin (relevant for SEA events).
14. **Admin dashboard** for aggregated feedback and per-event match quality.
