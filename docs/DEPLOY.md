# Deploying the public demo to Railway

Three services in one Railway project. Only the API is reachable from the internet.

| Service | Source | Public |
|---|---|---|
| `pgvector` | Railway's [pgvector template](https://railway.com/deploy/pgvector) — the official `pgvector/pgvector` image, as in `docker-compose.yml` | No |
| `score-service` | This repo, root directory `/score-service` | No — private network only |
| `api` | This repo, root directory `/api` | **Yes** — the only public domain |

On every boot the API container applies pending migrations, seeds the demo data **only if the database has no events yet**, then starts. A redeploy therefore never wipes live conversations or the demo's daily budget count. The same sequence runs under `docker compose up`, so what you test locally is what Railway runs. See the `CMD` in [`api/Dockerfile`](../api/Dockerfile).

---

## Before you start: cap the spend at the provider

The API caps itself at a daily number of concierge turns (`DEMO_DAILY_TURN_LIMIT`), but an application-level cap can be misconfigured or bypassed through a bug. Put a hard ceiling where the money actually is:

- **Anthropic** — create a dedicated workspace for the demo, set a monthly spend limit on it, and create the API key inside that workspace.
- **OpenAI** — create a dedicated project, set its monthly budget, and create the key inside that project. Embeddings are cheap (`text-embedding-3-small`, US$0.02 per million tokens): seeding costs ~US$0.00002 and each concierge turn embeds one short query.

With both caps in place, the worst case is bounded by the smaller of the two limits, whatever the application does.

---

## 1. Database

1. Create a new Railway project.
2. **Deploy the [pgvector template](https://railway.com/deploy/pgvector)** into it. Do **not** use Railway's plain PostgreSQL database: the init migration runs `CREATE EXTENSION IF NOT EXISTS "vector"`, which needs the extension to be installed in the image.
3. Note the service's name (shown on its card). The variables below assume `pgvector`; substitute yours.

## 2. score-service

1. **New → GitHub Repo** → this repository. Rename the service to `score-service` (the private hostname is derived from it).
2. **Settings → Source → Root Directory:** `/score-service`
3. **Settings → Config-as-code → Railway Config File:** `/score-service/railway.json`
   The config file path does **not** follow the root directory. It must be absolute from the repo root ([Railway monorepo guide](https://docs.railway.com/guides/monorepo)).
4. **Variables:**

   | Variable | Value |
   |---|---|
   | `ANTHROPIC_API_KEY` | the key from the capped workspace |
   | `PORT` | `8000` |
   | `HOST` | `::` |

5. Do **not** generate a public domain. The API reaches this service over the private network.

## 3. api

1. **New → GitHub Repo** → this repository again. Rename the service to `api`.
2. **Root Directory:** `/api`
3. **Railway Config File:** `/api/railway.json`
4. **Variables** (`${{…}}` are Railway reference variables, resolved at deploy time):

   | Variable | Value | Why |
   |---|---|---|
   | `DATABASE_URL` | `${{pgvector.DATABASE_URL}}` | Private URL; traffic stays on Railway's network |
   | `ANTHROPIC_API_KEY` | the key from the capped workspace | |
   | `OPENAI_API_KEY` | the key from the capped project | Needed at boot: the seed embeds the demo profiles |
   | `SCORE_SERVICE_URL` | `http://${{score-service.RAILWAY_PRIVATE_DOMAIN}}:8000` | The port is required on private URLs |
   | `NODE_ENV` | `production` | |
   | `PUBLIC_BASE_URL` | `https://${{RAILWAY_PUBLIC_DOMAIN}}` | Listed as the first server in `/docs`, so "Test Request" hits the live API |
   | `RATE_LIMIT_PER_MIN` | `3` | Burst limit per attendee |
   | `DEMO_DAILY_TURN_LIMIT` | `50` | Turns per UTC day across everyone: worst case ~US$4.50/day |
   | `DEMO_ATTENDEE_DAILY_TURN_LIMIT` | `5` | Stops one visitor from spending the whole day's allowance |

5. **Settings → Networking → Generate Domain.**

## 4. Deploy and verify

Railway deploys each service on push to `main`. The API's first boot takes longer than later ones: it migrates an empty database and makes one embedding call to seed it. The health check (`/health`, 300 s timeout) waits for that.

```bash
API=https://<your-domain>.up.railway.app

curl -s $API/health                 # {"status":"ok",...}
curl -sI $API/ | grep -i location   # location: /demo
curl -s "$API/events" | head -c 300 # the seeded "Southeast Asia AI Summit 2026"
```

Then open `$API/` in a browser. Pick **Andika Setiawan**, send **Full tool chain**, and check the top-right corner: it should read *"49 of 50 demo turns left today"*.

---

## Troubleshooting

**Migration fails with `extension "vector" is not available`.** The database is plain PostgreSQL. Replace it with the pgvector template (step 1) and point `DATABASE_URL` at the new service.

**The API deploy never turns healthy, and its log shows `RateLimitError: 429 … insufficient_quota`.** The seed could not embed the demo profiles because the OpenAI project has no credit. This is deliberate: the seed refuses to create a demo whose semantic search would silently return arbitrary results. Top up, then redeploy. The previous deployment, if any, keeps serving in the meantime.

**Concierge turns fail with timeouts or `ECONNREFUSED` calling the score-service.** Check, in order:
1. `SCORE_SERVICE_URL` includes `:8000` and the service is really named `score-service`.
2. The score-service is listening on `::`. Railway environments created before 16 Oct 2025 resolve private hostnames to IPv6 only ([how private networking works](https://docs.railway.com/networking/private-networking/how-it-works.md)).
3. If, instead, the score-service's own health check fails with `HOST=::`, remove `HOST`. Environments created after that date also resolve to IPv4, and the `0.0.0.0` default then works.

**You want to reset the demo data.** Boot never reseeds a database that already has an event. To start over, open a shell on the `api` service (`railway ssh`) and run the seed without the guard. This deletes every event, attendee and conversation:

```bash
node_modules/.bin/ts-node --transpile-only prisma/seed.ts
```
