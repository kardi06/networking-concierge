# Tech Decisions Log

Running log of non-trivial technical decisions made while building the MyConnect networking concierge. Each entry follows the same template: problem → choice → rejected alternatives → trade-off. The goal is twofold: explain "why this code looks like this" to reviewers, and let future-me reconstruct the reasoning months from now.

> Strategic stack decisions (NestJS, Prisma, pgvector, Anthropic, OpenAI embeddings, FastAPI score-service) are explained in [`ARCHITECTURE.md`](ARCHITECTURE.md). This file captures the smaller execution-time calls that surfaced as the implementation progressed.

---

## TD-001 — Drop the `uuid` package, use Node's `crypto.randomUUID()` for request IDs

**Date:** 2026-04-29 · **Phase:** 2 · **Files:** `api/src/common/logger/logger.config.ts`

### Problem
The pino HTTP logger needs to mint a request ID per inbound request when the client does not supply `X-Request-ID`. The first implementation imported `v4` from `uuid@14`. The runtime worked (`pnpm start:dev` returned a valid request ID) but `pnpm test:e2e` failed at module load:

```
SyntaxError: Unexpected token 'export'
  at node_modules/.pnpm/uuid@14.0.0/node_modules/uuid/dist-node/index.js
  > export { default as MAX } from './max.js';
```

### Root cause
- `uuid@14` ships **ESM-only**. Earlier versions (≤9) shipped dual CommonJS + ESM.
- Jest's default transform pipeline treats `node_modules` as CommonJS and skips transformation, so a `require()` of an ESM-only file with `export {…}` throws.
- The runtime path uses `ts-node` which handles ESM correctly — that is why dev mode worked but Jest did not.

### Decision
Replace the import with Node's built-in `crypto.randomUUID()` and drop both `uuid` and `@types/uuid`.

```diff
- import { v4 as uuidv4 } from 'uuid';
+ import { randomUUID } from 'crypto';
```

### Rejected alternatives

| Option | Why not |
|---|---|
| Downgrade to `uuid@9` | Steps backward on a dependency we don't need. The only feature gain over `crypto.randomUUID()` is UUID v1/v3/v5/v6/v7 support, none of which we use. |
| Configure Jest `transformIgnorePatterns` to also transform `uuid` | Adds Jest config and slows tests. Treats the symptom; recurs for any future ESM-only dependency. |
| Migrate to Vitest | Native ESM and faster, but diverges from the NestJS default Jest stack. Out of scope for the take-home. |
| Convert the project to ESM | Large change touching `tsconfig`, `ts-jest`, eslint, decorators. Disproportionate to the problem. |

### Trade-off
- ✅ One fewer external dependency.
- ✅ Output is functionally identical for our use case (a v4 UUID string from a cryptographically secure RNG).
- ✅ No Jest configuration overhead.
- ⚠️ If we later need UUID v7 (timestamp-ordered, useful for primary keys with insertion locality), we will need to add a small UUID library back.

`crypto.randomUUID()` has been stable in Node since v19; we run Node 22.

---

## TD-002 — Keep the ivfflat vector index inside the init migration (accept the Prisma drift warning)

**Date:** 2026-04-29 · **Phase:** 3 · **Files:** `api/prisma/migrations/<timestamp>_init/migration.sql`

### Problem
Prisma's schema DSL cannot express `CREATE INDEX … USING ivfflat (embedding vector_cosine_ops)`. The index is mandatory for semantic search to meet PRD §4.1 (<500 ms search on 10k attendees). Without a workaround, Prisma's drift detector complains because the actual database has an index that `schema.prisma` does not declare.

### Decision
Append the `CREATE INDEX … USING ivfflat …` statement to the end of the generated `migration.sql` after running `prisma migrate dev --create-only --name init`. The index is applied as part of the migration when `prisma migrate dev` runs.

### Rejected alternatives

| Option | Why not |
|---|---|
| Move the index to `prisma db execute --file=vector-indexes.sql` after migrate | Still triggers a drift warning in dev (the actual DB has an index Prisma's expected state doesn't list). The index is no longer versioned in the migration history. |
| `prisma db push` instead of migrations | The brief explicitly requires migrations — auto-reject. |
| Skip ivfflat and rely on a sequential scan | Search across 10k attendees with a full scan won't meet PRD §4.1's <500 ms target. |

### Trade-off
- ✅ Single migration history, reviewer setup remains one command (`prisma migrate deploy`).
- ✅ The index is versioned in the migration file — traceable.
- ⚠️ Every subsequent `prisma migrate dev` in a developer workflow will prompt to drop the ivfflat (because the schema declares no such index). Workaround: always use `--create-only` and manually keep the line if it appears.
- ⚠️ The drift prompt does **not** appear under `prisma migrate deploy` (production mode), so reviewers running the documented quick-start are unaffected.

---

## TD-003 — Use the `@prisma/adapter-pg` driver adapter for Prisma 7 client connections

**Date:** 2026-04-29 · **Phase:** 3 · **Files:** `api/src/prisma/prisma.service.ts`, `api/prisma/seed.ts`

### Problem
Prisma 7's client engine **requires** either a driver adapter or an `accelerateUrl` in the constructor. The Prisma-6 pattern of `new PrismaClient()` reading `DATABASE_URL` from the environment now throws:

```
Using engine type "client" requires either "adapter" or "accelerateUrl"
```

### Decision
Install `@prisma/adapter-pg` + `pg`. Instantiate `new PrismaPg({ connectionString })` and pass it as `adapter` to `new PrismaClient({ adapter })`. Applied in both `PrismaService` (runtime) and `prisma/seed.ts` (developer tooling).

### Rejected alternatives

| Option | Why not |
|---|---|
| Downgrade to Prisma 6 | We are already on 7.8 with stable behaviour; no benefit to moving backward. |
| Prisma Accelerate (`accelerateUrl`) | Paid managed service, requires a cloud account, overkill for a local Postgres demo. |
| `@prisma/adapter-pg-worker` | Cloudflare Workers only; we run Node. |
| `@prisma/adapter-neon`, `adapter-d1`, etc. | Provider-specific adapters for serverless DBs. We use self-hosted Postgres. |

### Trade-off
- ✅ Aligned with Prisma 7's GA pattern. The new client engine is smaller and friendlier to serverless/edge runtimes for future deployments.
- ✅ `pg` (node-postgres) is the battle-tested Postgres driver for Node.
- ⚠️ Two extra runtime dependencies (`@prisma/adapter-pg`, `pg`) plus one dev (`@types/pg`).
- ⚠️ Connection pooling is now handled by `pg` (default 10 connections per pool). Tune via the adapter constructor if throughput becomes a concern.
- ⚠️ Adapter API may shift in future Prisma versions — pin the major.

---

## TD-004 — Defer Idempotency-Key + advisory lock; bump handler timeout to 90 s

**Date:** 2026-04-30 · **Phase:** 10 · **Files:** `api/src/concierge/concierge.service.ts`

### Problem
PRD §4.2 and the master plan listed three production safety controls for the concierge endpoint:

1. **Idempotency-Key** header — duplicate retries should not produce duplicate tool calls.
2. **`pg_advisory_xact_lock`** per-conversation — prevents race conditions when two concurrent requests target the same attendee.
3. **30 s handler timeout** per turn.

Live demo runs showed the 30 s timeout was too tight: a real agent loop with 6 tool calls completes in ~38 s.

### Decision
- **Idempotency-Key**: skip for the take-home. The 10/min per-attendee throttle prevents most retry-driven dupes; full idempotency requires a Redis-backed key store and is documented as future work.
- **Advisory lock**: skip. Concurrent requests from the same attendee are unlikely in a demo, and the unique constraint on `conversations(event_id, attendee_id)` already prevents duplicate conversations.
- **Timeout**: raise to **90 s**. Implemented as `Promise.race` with a `clearTimeout` in `finally` so the timer never leaks past a successful turn.

### Rejected alternatives

| Option | Why not |
|---|---|
| Implement Idempotency-Key with a Redis store | Adds a Redis dependency to the demo for a defence against an unlikely failure mode. |
| Streaming response (SSE) | The brief allows non-streaming. Streaming would require non-trivial refactor and is captured under "what I'd do with more time". |
| Keep timeout at 30 s | Unrealistic for a real agent loop; would fail every demo. |

### Trade-off
- ✅ End-to-end demo lands in a realistic 30–60 s window per turn.
- ✅ Submission unblocked on concerns that rarely surface in a demo.
- ⚠️ A production system **must** add idempotency and advisory locking. Documented in the README "What I'd do with more time" section.
- ⚠️ A 90 s synchronous request blocks an HTTP worker for that duration. Production should move agent execution to BullMQ and stream results via SSE.

---

## TD-005 — Separate `myconnect_test` database for e2e tests, auto-provisioned

**Date:** 2026-04-30 · **Phase:** 12 · **Files:** `api/test/setup-test-db.ts`, `api/test/jest-setup.ts`

### Problem
End-to-end tests need real database access (Prisma + pgvector). Two options:
- Reuse the dev database (`myconnect`). Easy setup, but test data accumulates after every run.
- Provision a separate test database. Clean isolation, more setup.

### Decision
Use **`myconnect_test`** as a dedicated database on the same Postgres instance, auto-provisioned:

1. `test/setup-test-db.ts` — checks for the database, runs `CREATE DATABASE myconnect_test` if missing, then applies all migrations from `prisma/migrations/` directly via the `pg` client.
2. `test/jest-setup.ts` — overrides `process.env.DATABASE_URL` to point at the test DB before `AppModule` boots. Because `@nestjs/config` + dotenv default to `override: false`, env vars set in `process.env` win over the `.env` file.
3. The e2e spec `TRUNCATE`s all tables before each test for clean state.
4. `pnpm db:test:setup` is a one-time command for the reviewer.

### Rejected alternatives

| Option | Why not |
|---|---|
| Same dev DB with UUID-based isolation | Test data accumulates indefinitely; messy for demo and `psql` exploration. |
| Same dev DB with `TRUNCATE` before tests | Destroys the seed data; would require re-seeding after every test run. |
| `testcontainers` to spawn a temporary Postgres per test run | Overkill, slow boot, extra package dependency. |

### Trade-off
- ✅ Full test isolation; never touches dev data.
- ✅ Reviewer experience: one command to set up, then any number of `pnpm test:e2e` runs.
- ✅ Migration history stays consistent (same SQL applied to two databases).
- ⚠️ One additional npm script and two helper files.
- ⚠️ Schema changes require re-running `db:test:setup`. The setup script is idempotent (`DROP SCHEMA … CASCADE; CREATE SCHEMA …` then re-apply migrations), so re-runs are safe.

---

## TD-006 — Two-stage Dockerfile, no `pnpm prune --prod`

**Date:** 2026-04-30 · **Phase:** 14 · **Files:** `api/Dockerfile`

### Problem
The production Docker image for NestJS + pnpm + Prisma 7 has two competing wishes:

- A small image (best practice, faster pulls, smaller attack surface).
- A reliable build — particularly the Prisma generated client which lives at a hashed pnpm path: `node_modules/.pnpm/@prisma+client@VERSION_HASH/node_modules/.prisma/client`.

### Decision
Two-stage Dockerfile. Stage `build` installs all dependencies, runs `prisma generate`, and runs `nest build`. Stage `production` copies `node_modules`, `dist`, and the manifests over from `build`. **No `pnpm prune --prod`** in production.

### Rejected alternatives

| Option | Why not |
|---|---|
| Single-stage Dockerfile | No build/run separation; the same image carries all source and build tooling. |
| Three-stage with a separate prod-only deps stage | The pnpm hash-suffixed directory names (`.pnpm/...VERSION_HASH...`) make cross-stage copies fragile. Risk of breakage every time the lockfile changes. |
| Two-stage + `pnpm prune --prod` in production | Non-trivial risk: pnpm prune may treat the Prisma generated artifacts as orphan and remove them. Would require a verification step in CI we haven't built. |
| `pnpm deploy --prod` to a standalone bundle | Newer pnpm pattern, but still rough around the edges with Prisma in v7. |

### Trade-off
- ✅ Reliable build with no Prisma surprises.
- ✅ Clear separation between build and runtime stages.
- ⚠️ Image size lands at ~500 MB with dev deps still resident. Production typically targets ~200 MB.
- ⚠️ A future iteration could add `pnpm prune --prod` after verifying that the Prisma client survives the prune.

---

## TD-007 — pnpm `node-linker=hoisted` for Prisma 7 compatibility

**Date:** 2026-04-30 · **Phase:** 14 · **Files:** `api/.npmrc`

### Problem
Prisma 7's CLI fails to find `@prisma/engines` under pnpm's strict default (`isolated`) layout. The engine package is buried at `.pnpm/<hash>/node_modules/@prisma/engines`, but the Prisma CLI hard-codes a top-level `node_modules/` lookup. Symptoms during `docker build`:

- `Cannot find module '@prisma/engines'`
- Or `Cannot find module '/app/node_modules/prisma/build/index.js'` after partial fixes.

### Decision
Set `node-linker=hoisted` in `api/.npmrc`. Pnpm now installs into a flat `node_modules/` layout (like npm or Yarn classic) — every package and transitive dependency lives at the top level. The Prisma CLI is happy.

A complementary `.dockerignore` skips `node_modules` from the Docker build context so the host's `.pnpm` symlinked layout (if it exists from earlier installs) does not collide with the container's flat layout.

### Rejected alternatives

| Option | Why not |
|---|---|
| `public-hoist-pattern[]=*prisma*` | Tested and still fails — pattern matching does not reach all of Prisma 7's transitive deps. |
| Switch to `npm` or `yarn` | Major change, conflicts with the team's pnpm baseline. |
| Skip `prisma generate` at build time and run it at container startup | Adds startup latency, requires the Prisma CLI in the production image, and hits the same module-resolution wall. |
| `shamefully-hoist=true` | Equivalent net behaviour but keeps the `.pnpm/` directory alongside the hoisted symlinks — more confusing than `node-linker=hoisted`. |

### Trade-off
- ✅ Reliable Prisma CLI behaviour in Docker and on the host.
- ✅ `.npmrc` is committed, so reviewers get the same layout on a fresh clone.
- ⚠️ Loss of pnpm's strict isolation: code can `require()` an undeclared transitive dep without failing. Phantom dependency risk. The unit + e2e tests cover most paths, so the residual risk is acceptable.
- ⚠️ Slightly larger disk footprint (no symlink-based deduplication). Negligible at this project size.

### README addition
> "If `pnpm install` fails on a fresh clone (typical when an existing pnpm cache from a different project conflicts), run `rm -rf node_modules && pnpm install`. The repo uses `node-linker=hoisted` (see `api/.npmrc`) for Prisma 7 compatibility."
