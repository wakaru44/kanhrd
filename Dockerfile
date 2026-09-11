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

# In a container, the bridge must listen on 0.0.0.0 so the published port is
# reachable from the host; container-side loopback is invisible to the port
# mapping. The safety flag is warranted here because host-side `-p
# 127.0.0.1:5173:5173` enforces the loopback-only bind at the Docker layer.
#
# A wildcard bind derives no browser origin, so the `/ws` allowlist has to be
# stated: with the loopback port mapping above, the origin the operator's
# browser actually uses is host-side loopback. Change the published port and
# these two origins have to change with it.
ENTRYPOINT ["node", "/app/apps/bridge/dist/main.js"]
CMD ["--bind", "0.0.0.0", "--i-know-what-im-doing", \
     "--allowed-origin", "http://127.0.0.1:5173", \
     "--allowed-origin", "http://localhost:5173"]
