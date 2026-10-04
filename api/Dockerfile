# syntax=docker/dockerfile:1.7

# ----------------------------------------------------------------------------
# Stage 1 — build: install all deps, generate Prisma client, compile TS
# ----------------------------------------------------------------------------
FROM node:22-alpine AS build

RUN corepack enable && corepack prepare pnpm@10.22.0 --activate
WORKDIR /app

# Cache layer: install deps first (rebuilds only when manifests change).
# .npmrc is required at install time so the public-hoist-pattern (for Prisma)
# is honoured.
COPY package.json pnpm-lock.yaml .npmrc ./
RUN pnpm install --frozen-lockfile

# Copy source and build.
COPY . .
# Use `pnpm exec` so prisma uses the locally installed @prisma/client,
# not a fresh isolated `pnpm dlx` copy that can't see workspace deps.
RUN pnpm exec prisma generate
RUN pnpm build

# ----------------------------------------------------------------------------
# Stage 2 — production: minimal runtime image
# ----------------------------------------------------------------------------
FROM node:22-alpine AS production

RUN corepack enable && corepack prepare pnpm@10.22.0 --activate
WORKDIR /app

ENV NODE_ENV=production \
    NODE_OPTIONS=--enable-source-maps

# Copy resolved deps (incl. Prisma generated client) + compiled output.
# We keep dev deps to avoid the pnpm + Prisma re-generation fragility documented
# in TD-006; image stays ~500MB. Add `RUN pnpm prune --prod` here if you need
# to shave that, but verify the Prisma client isn't pruned away.
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/package.json ./
COPY --from=build /app/prisma.config.ts ./

# The seed runs under ts-node at boot and imports two small modules from src/:
# the embedding recipe and model constants. They are the same code the API uses,
# which is what keeps seeded and registered vectors comparable. tsconfig.json
# tells ts-node how to compile them.
COPY --from=build /app/src ./src
COPY --from=build /app/tsconfig.json ./

# Run as the non-root `node` user that ships with the official image.
USER node

EXPOSE 3000

# start-period covers migrations and, on a fresh database, the seed's one
# embedding call before the server starts listening.
HEALTHCHECK --interval=10s --timeout=3s --start-period=60s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health',(r)=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))" || exit 1

# Boot sequence, identical under `docker compose up` and on Railway:
#   1. Apply pending migrations. A no-op when the schema is current, and Prisma
#      holds an advisory lock while migrating.
#   2. Seed the demo data, but only if the database has no events yet, so a
#      redeploy never wipes live conversations or the daily budget count. (Two
#      replicas booting against an empty database at once could both seed; the
#      demo runs one.)
#   3. Hand PID 1 to the API.
# Any step failing stops the chain, so a deployment that cannot migrate or
# seed never reports healthy, and on Railway the previous one keeps serving.
# Binaries are called from node_modules/.bin rather than through pnpm, which
# would try to fetch itself via corepack as the non-root user.
CMD ["sh", "-c", "node_modules/.bin/prisma migrate deploy && node_modules/.bin/ts-node --transpile-only prisma/seed-if-empty.ts && exec node dist/main.js"]
