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

# Run as the non-root `node` user that ships with the official image.
USER node

EXPOSE 3000

HEALTHCHECK --interval=10s --timeout=3s --start-period=15s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health',(r)=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))" || exit 1

CMD ["node", "dist/main.js"]
