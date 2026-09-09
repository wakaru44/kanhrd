# syntax=docker/dockerfile:1

# --- builder ---------------------------------------------------------------
FROM node:22-alpine AS builder
RUN corepack enable && corepack prepare pnpm@11.25.0 --activate
WORKDIR /app

# Install deps first so this layer is cached across source-only changes.
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml tsconfig.base.json ./
COPY packages/schema/package.json packages/schema/package.json
COPY apps/bridge/package.json apps/bridge/package.json
COPY apps/web/package.json apps/web/package.json
RUN pnpm install --frozen-lockfile

COPY packages/schema packages/schema
COPY apps/bridge apps/bridge
COPY apps/web apps/web

RUN pnpm --filter @kanhrd/schema build \
 && pnpm --filter @kanhrd/bridge build \
 && pnpm --filter @kanhrd/web build

# Produces a self-contained, production-only copy of the bridge: workspace
# deps (e.g. @kanhrd/schema) get inlined as real files instead of symlinks,
# so the runtime stage doesn't need the pnpm workspace or a lockfile.
RUN pnpm --filter @kanhrd/bridge deploy --prod --legacy /app/deploy/bridge

# --- runtime -----------------------------------------------------------
FROM node:22-alpine AS runtime
RUN apk add --no-cache curl \
 && addgroup -S kanhrd && adduser -S kanhrd -G kanhrd

WORKDIR /app
COPY --from=builder --chown=kanhrd:kanhrd /app/deploy/bridge /app/apps/bridge
COPY --from=builder --chown=kanhrd:kanhrd /app/apps/web/dist/web/browser /app/apps/web/dist/web/browser

USER kanhrd
EXPOSE 5173
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -sSf http://127.0.0.1:5173/api/hosts || exit 1

ENTRYPOINT ["node", "/app/apps/bridge/dist/main.js"]
