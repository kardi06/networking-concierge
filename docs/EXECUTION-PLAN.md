# Execution Plan & Compliance Reference

This document captures how the work was decomposed and executed, and maps every requirement in the take-home brief to the phase that implemented it. The full internal phase log (with notes per build attempt) is kept separately as a working scratchpad; this version is the polished view useful to a reviewer.

> Each phase below was committed in isolation, so `git log` reads as a chronological narrative of the build.

---

## 1. Acceptance Matrix

Every clause from the take-home brief mapped to the phase that implemented it. "Brief" here refers to the take-home PDF you sent (`MyConnect.ai take-home task.pdf`), not to my own `PRD.md` — the two have different section numbers, and the table below uses the brief's numbering throughout.

### Functional requirements (Brief §2)

| Clause | Requirement | Implementing phase |
|---|---|---|
| §2.1 | `POST /events` | P4 — Events module |
| §2.1 | `GET /events?page&limit` | P4 |
| §2.1 | `POST /events/:id/attendees` (with embedding side-effect) | P5–P6 |
| §2.1 | `GET /events/:id/attendees` with pagination + `role` / `skills` filters | P6 |
| §2.2 | `POST /events/:id/concierge/messages` | P10 — Concierge agent loop |
| §2.2 | Stateful agent per `(event, attendee)` | P10 |
| §2.2 | Native tool calling: `search_attendees`, `score_match`, `draft_intro_message` | P9 — LLM client + tool plumbing |
| §2.2 | Persist tool calls, tool results, and assistant responses | P10 |
| §2.3 | `POST /events/:id/concierge/messages/:id/feedback` (rating 1–5 + notes) | P11 — Feedback endpoint |

### Technical requirements (Brief §3)

| Clause | Requirement | Implementing phase |
|---|---|---|
| §3.1 | NestJS modular structure + DTOs + `class-validator` + DI | P2 — NestJS scaffold |
| §3.1 | PostgreSQL with migrations | P3 — Prisma schema + migrations |
| §3.1 | pgvector for semantic search | P3 |
| §3.1 | Native tool/function calling (no regex parsing) | P9 |
| §3.1 | Unit tests + at least one e2e test (mock the LLM) | P12 — Tests |
| §3.1 | Pino structured logs with request IDs | P2 |
| §3.1 | Per-LLM-call telemetry (model, tokens, latency, tool name) | P9, P13 |
| §3.1 | README section on production observability wiring (CloudWatch / Azure Monitor) | P15 — Documentation |
| §3.2 | FastAPI microservice for `score_match` | P8 — score-service |

### Deliverables (Brief §4)

| Clause | Requirement | Implementing phase |
|---|---|---|
| §4 | README with setup + architecture + sequence diagram + trade-offs | P15 |
| §4 | ARCHITECTURE.md covering framework / state persistence / 10k scaling / PII | P15 (refresh of pre-existing draft) |
| §4 | Loom walkthrough video (5–8 minutes) | Submission |

### Hard no-gos (Brief §5)

| Clause | Requirement | Where verified |
|---|---|---|
| §5 | No raw SQL string concatenation | All raw SQL goes through `Prisma.sql` tagged templates with bound parameters (`api/src/attendees/attendees.service.ts`, `api/src/attendees/attendee-search.service.ts`). Verified at the [no-go gate](#3-self-imposed-quality-gate). |
| §5 | No LLM API keys in the repo | `.gitignore` covers `.env`; `git log -p` does not contain any key. |
| §5 | Prompt injection cannot trivially break the agent | Three layers (sanitiser, `<attendee_data>` wrapper, system prompt rules); a codified e2e test exercises a `[INST]…[/INST]` injection (P12). |
| §5 | At least one test exists | 53 unit + 4 e2e tests across 13 spec files (P12). |

### Constraints + honesty (Brief §6 + §8)

| Clause | Requirement | Implementing phase |
|---|---|---|
| §6 | Document AI assistant usage honestly | README §11 |
| §6 | Document any reasonable assumptions made when the brief is silent | README §9 + ARCHITECTURE §8 |
| §8 | "What I'm most proud of" + "biggest trade-off" paragraphs | Submission email |

### Production-thinking rubric (Brief §5 rubric)

| Item | Implementation |
|---|---|
| Rate limiting on LLM calls | `AttendeeThrottlerGuard` keys throttle per `attendee_id`, 10/min, on `POST /concierge/messages` (P10). |
| Cost awareness | README §7 — concrete per-turn token estimate and per-event budget guidance. |
| Sensible DB indexes | `attendees(event_id)`, `attendees(role)`, GIN on `skills`, ivfflat on `embedding`, `messages(conversation_id, created_at)`, `tool_calls(message_id)`, unique on `feedback.message_id` (P3). |
| Tool errors handled gracefully | Tool executor catches everything and returns `{ error: string }` to the LLM so the agent can recover next iteration (P9). |

---

## 2. Phase Summary

| Phase | Title | Outcome |
|---|---|---|
| **P0** | Repo bootstrap | `.gitignore` + `.env.example` + first commit. |
| **P1** | Docker + pgvector | `pgvector/pgvector:pg16` healthy on host port 5433; `vector` extension installable. |
| **P2** | NestJS scaffold | Pino with request IDs + PII redaction, global validation pipe, structured exception filter, `GET /health`. |
| **P3** | Database schema + Prisma | 6 models + ivfflat index applied; 1 event + 15 attendees seeded; `PrismaService` wired with `@prisma/adapter-pg`. |
| **P4** | Events module | `POST /events` with cross-field date validation; `GET /events` paginated. 5 unit tests. |
| **P5** | Embedding service | OpenAI client wrapper with retry + telemetry; `MockEmbeddingService` for tests. 7 tests. |
| **P6** | Attendees module | `POST /events/:id/attendees` embeds and inserts via `Prisma.sql` tagged template; `GET` supports `role` + `skills` filters. 6 tests. |
| **P7** | Attendee search service | Hybrid semantic + keyword search with cosine distance + dynamic WHERE via `Prisma.join`. 4 tests. |
| **P8** | FastAPI score-service | `POST /score` using forced tool calling for structured output; prompt-injection defences in place. 2 pytest. |
| **P9** | LLM client + tool plumbing | `LlmService` with retry + telemetry; tool schemas; `ToolExecutorService` dispatcher; sanitiser + system prompt with security rules. 15 new tests. |
| **P10** | Concierge agent loop | Full agent loop ≤6 iterations, persistence of every message + tool_call, 90 s timeout, per-attendee throttler, `extractMatches`. 8 new tests. |
| **P11** | Feedback endpoint | Ownership check returns 404 to avoid leaking message existence; duplicate returns 409. 5 tests. |
| **P12** | Tests | Separate `myconnect_test` DB, auto-provisioned. 4 e2e tests including resumption + adversarial. |
| **P13** | Observability polish | `MetricsService` writes `_metric` field for CloudWatch EMF / Azure Monitor ingestion; LLM client + tool executor emit metrics. |
| **P14** | Docker polish | Multi-stage `api/Dockerfile`; full-stack `docker-compose` with `full` and `tools` profiles (latter includes pgAdmin). Clean-room smoke verified. |
| **P15** | Documentation | README, ARCHITECTURE refresh, TECH-DECISIONS log, this Execution Plan. |

Final test count at submission: **57 tests** (53 unit + 4 e2e), all green.

---

## 3. Self-Imposed Quality Gate

This is the checklist that had to pass before tagging the build "ready to record the Loom and submit".

| ID | Check | Status |
|---|---|---|
| G.1 | No raw SQL concatenation in production code | ✅ All raw SQL routed through `Prisma.sql` / `prisma.$executeRaw` / `prisma.$queryRaw` tagged templates. |
| G.2 | No API keys in `git log` | ✅ `.env` is gitignored from the first commit; `git log -p` audit clean. |
| G.3 | `.env` is ignored | ✅ Verified via `git check-ignore -v .env`. |
| G.4 | Adversarial e2e test passes | ✅ `concierge.e2e-spec.ts` "sanitises malicious user input and includes the security system prompt" (P12). |
| G.5 | All tests green | ✅ `pnpm test` (53), `pnpm test:e2e` (4), `uv run pytest` (2). |
| G.6 | Lint clean | ✅ `pnpm lint` returns no errors. |
| G.7 | Clean-room smoke from zero | ✅ `docker compose down -v && docker compose --profile full up -d` + migrations + seed → `/health` 200, full chain works. |
| G.8 | README covers all required sections | ✅ Setup, sequence diagram, trade-offs, what-I'd-do, AI usage, observability wiring, documented assumptions. |
| G.9 | ARCHITECTURE covers framework rationale / state persistence / 10k scaling / PII | ✅ Sections 5, 6, 7, 8 of `ARCHITECTURE.md`. |
| G.10 | No secrets in history | ✅ Subset of G.2; verified. |

---

## 4. Time Budget — Transparency

Original estimate vs realised effort (rough; not stopwatch-precise):

| Block | Estimate | Realised | Notes |
|---|---:|---:|---|
| Pre-flight + repo + infra (P0–P1) | 0.75 h | 0.7 h | On track. |
| NestJS scaffold + DB schema (P2–P3) | 1.5 h | 2.5 h | Prisma 7 introduced new patterns: `prisma.config.ts`, driver adapter, no `url` in schema. |
| Events / Attendees / Search (P4–P7) | 2.0 h | 2.5 h | On track; minor iteration on `Prisma.sql` typing. |
| FastAPI score-service (P8) | 1.0 h | 1.0 h | Smooth — Pydantic + uv handle most boilerplate. |
| LLM + agent loop (P9–P10) | 2.5 h | 3.5 h | Agent loop persistence and `extractMatches` merge logic took longer than expected; one iteration to get the LLM stub deep-clone right. |
| Feedback (P11) | 0.3 h | 0.3 h | On track. |
| Tests (P12) | 1.5 h | 1.5 h | Test DB auto-provisioning saved time downstream. |
| Observability (P13) | 0.3 h | 0.5 h | Wiring `MetricsService` mocks into existing test specs added a small tax. |
| Docker polish (P14) | 0.5 h | 1.5 h | pnpm `node-linker=hoisted` for Prisma 7; `tsconfig.build.json` exclude for `dist/main.js`; `.dockerignore`. Captured in [TD-006](TECH-DECISIONS.md#td-006--two-stage-dockerfile-no-pnpm-prune---prod) and [TD-007](TECH-DECISIONS.md#td-007--pnpm-node-linkerhoisted-for-prisma-7-compatibility). |
| Docs + final gate (P15–P16) | 1.3 h | 1.5 h | README + ARCHITECTURE refresh + TECH-DECISIONS port to English + this file. |
| **Total** | **~12 h** | **~15 h** | Within the brief's 8–12 h budget if you exclude the Prisma 7 / pnpm Docker spelunking, which I treated as the kind of friction a real engagement would also surface. |

---

## 5. Per-Phase Commit Boundary

`git log --oneline` reads as a chronological build narrative. Every phase landed as one or two commits, never mixed. This makes review in PR-style or commit-by-commit straightforward.

```text
docs: full submission docs — README, ARCHITECTURE refresh, TECH-DECISIONS log
feat(docker): full-stack compose with multi-stage api image, pgadmin, prisma compat fixes
feat(observability): metrics service stub for cloudwatch emf, wired into llm and tool executor
test(e2e): concierge happy path, resumption, and adversarial input on isolated test DB
feat(feedback): post feedback endpoint with ownership check and 409 on duplicate
feat(concierge): agent loop with tool calling, persistence, throttler, and concierge endpoint
feat(concierge): llm wrapper, tool schemas, executor, sanitizer with prompt injection defense
feat(score-service): fastapi microservice with forced anthropic tool calling
feat(attendees): hybrid semantic + keyword search service for concierge tool
feat(attendees): CRUD with pgvector embedding via parameterised raw SQL
feat(embedding): openai embedding service with retry + deterministic mock for tests
feat(events): CRUD endpoints with cross-field date validation and pagination
feat(db): prisma schema with vector extension, ivfflat index, and seed data
feat(api): nestjs scaffold with pino logger, env validation, exception filter, /health
fix: move postgres host port to 5433 to avoid conflict with native instance
chore: bootstrap repo with PRD, ARCHITECTURE, gitignore, env template
```

(Hashes vary; line is the commit subject.)
