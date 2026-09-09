## 1. Dockerfile

- [x] 1.1 Multi-stage `builder` stage: install workspace deps, build `@kanhrd/schema`/`@kanhrd/bridge`/`@kanhrd/web` — `Dockerfile`
- [x] 1.2 `pnpm --filter @kanhrd/bridge deploy --prod --legacy` produces a self-contained production bridge copy — `Dockerfile`
- [x] 1.3 `runtime` stage: `node:22-alpine` + `curl`, non-root `kanhrd` user, copies deployed bridge + built SPA — `Dockerfile`
- [x] 1.4 `HEALTHCHECK` against `GET /api/hosts` — `Dockerfile`
- [x] 1.5 Entrypoint binds `0.0.0.0` with `--i-know-what-im-doing` inside the container, since compose enforces host-side loopback separately — `Dockerfile`

## 2. Compose

- [x] 2.1 `docker-compose.yaml` bridge service: loopback-only port mapping (`127.0.0.1:5173:5173`) per ADR-0003, read-only `~/.config/herdr` mount — `docker-compose.yaml`
- [x] 2.2 Commented-out `bridge-cloud` service documenting the SSH-tunnel pattern for remote/multi-host herdr (ADR-0001) — `docker-compose.yaml`

## 3. Docs

- [x] 3.1 `deploy/docker/README.md`: prerequisites, build/run steps, expected result with a `curl`-verifiable check — `deploy/docker/README.md`
- [x] 3.2 Troubleshooting section: socket permission/ENOENT, macOS vs Linux socket mounting quirks, remote herdr via SSH tunnel, port-in-use — `deploy/docker/README.md`

## 4. Build hygiene

- [x] 4.1 `.dockerignore` excludes node_modules/build artifacts from the build context — `.dockerignore`

## 5. Validator

- [x] 5.1 `openspec validate add-l-docker-image --strict` passes with zero errors
