# Architecture Document
## MyConnect AI Networking Concierge

**Version:** 1.0
**Author:** Kardi Ibrahim
**Date:** 28 April 2026

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
Chose Claude Sonnet 4.5 because: (1) tool calling is stable and supports parallel tool use, (2) instruction following is strong for long system prompts containing security rules, (3) pricing is competitive for a model at this reasoning quality. OpenAI GPT-4o-mini is a valid fallback. The raw SDK is used (not LangChain) to keep the tool-call lifecycle explicit and avoid an extra abstraction layer.

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
A conversation has a unique constraint on (event_id, attendee_id). To avoid race conditions when two concurrent requests target the same attendee, we use a per-conversation_id advisory lock or optimistic locking with the latest message version.

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
- **Logging:** redact `bio`, `looking_for`, and `name` at info level. Log them only at debug level behind an explicit flag.
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
Every LLM call records:
- `model`, `input_tokens`, `output_tokens`, `total_cost_usd_estimate`.
- `tool_name` if a tool call.
- `latency_ms`.
- `iteration_index` within the agent loop.

### 9.3 Production Wiring
- Pino → stdout → CloudWatch Logs (via Fluent Bit) or Azure Monitor.
- Custom metric namespace: `MyConnect/Concierge` with `event_id` and `tool_name` dimensions.
- OpenTelemetry trace exporter to X-Ray or Application Insights; one span per LLM call and per tool execution.
- Alerts: p95 concierge latency > 12 seconds, error rate > 5%, daily LLM cost > threshold.

---

## 10. Testing Strategy

### 10.1 Unit Tests
- `AttendeeSearchService`: hybrid search logic, parameter binding.
- `ConciergeService`: prompt builder, message reconstruction.
- DTO validation on controllers.
- Sanitization helper.

### 10.2 End-to-End Test
Core scenario:
1. Create an event.
2. Register 5 attendees with diverse profiles.
3. Send a concierge message as one of the attendees.
4. Mock the LLM: scenario responds with `tool_use` → `tool_result` → final reply.
5. Assert: the response contains matches, the `messages` and `tool_calls` tables are populated as expected.

### 10.3 Adversarial Tests
- Bio containing "ignore previous instructions" → the system prompt does not leak.
- User message attempting to extract the system prompt → the agent refuses.
- Bio asking for a score of 100 → score is not structurally affected.

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
|----------|-------------|--------|
| pgvector | Pinecone / Weaviate | Simple, sufficient for early scale |
| Prisma | TypeORM / Drizzle | Fastest path on a two-day timeline |
| Raw Anthropic SDK | LangChain | Explicit control of the tool lifecycle, no extra abstraction |
| Sync agent loop | Streaming + queue | Simpler for the take-home; queue is in "what I'd do with more time" |
| FastAPI score service | Inline in NestJS | Meets the polyglot requirement and provides a home for ML experiments |
| OpenAI embeddings | BGE / E5 (local) | Fast to set up, no GPU required. Local embeddings are noted as an upgrade path |

---

## 13. What I Would Do With More Time

1. **Streaming responses** with Server-Sent Events for a real-time UX.
2. **Conversation summarization** for long histories (compress old turns into a summary to save tokens).
3. **Eval framework** with a golden dataset to measure match quality automatically on every deploy.
4. **Anthropic prompt caching** for the system prompt and tool definitions.
5. **Terraform module** for RDS, ECS Fargate, ElastiCache, and the ALB.
6. **GitHub Actions pipeline** for lint, test, build, push to ECR, deploy.
7. **k6 load test** for `POST /concierge/messages` at 10/50/100 concurrent users.
8. **Multi-language** support for Indonesian and Mandarin (relevant for SEA events).
9. **Re-ranking model** in the FastAPI service trained on feedback ratings.
10. **Admin dashboard** for aggregated feedback and per-event match quality.
