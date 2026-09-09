## Why

kanhrd could only be run from a pnpm workspace checkout. Self-hosting it
needed a reproducible, minimal-attack-surface way to run the bridge +
built SPA without a Node toolchain on the host. This is a retroactive
OpenSpec record of the L-DOCKER lane, written after the fact because the
work landed without a proposal. Commit: `8e4e0bb` (`deploy`), with a
follow-up fix in `fc47b35` (`T3 stuff`).

## What Changes

- Add a multi-stage `Dockerfile`: a `builder` stage (`node:22-alpine`,
  pnpm via corepack) installs workspace deps, builds `@kanhrd/schema`,
  `@kanhrd/bridge`, and `@kanhrd/web`, then uses `pnpm --filter
  @kanhrd/bridge deploy --prod --legacy` to produce a self-contained
  production copy of the bridge (workspace deps inlined as real files, not
  symlinks) so the runtime stage needs no pnpm workspace or lockfile.
- A `runtime` stage (`node:22-alpine` + `curl`) runs as a non-root
  `kanhrd` user, copies in the deployed bridge and the built SPA's
  `dist/web/browser` output, exposes port 5173, and adds a `HEALTHCHECK`
  hitting `GET /api/hosts`.
- The container entrypoint binds `--bind 0.0.0.0 --i-know-what-im-doing`
  inside the container (required so the published port is reachable from
  the host — container-side loopback is invisible to Docker's port
  mapping), while `docker-compose.yaml` enforces loopback-only exposure
  from the host side (`127.0.0.1:5173:5173`, per ADR-0003) so the
  net-visible behavior is unchanged from the non-Docker default.
- `docker-compose.yaml` mounts `~/.config/herdr` read-only into the
  container at the non-root user's home, matching the bridge's default
  socket path with no extra config; a commented-out `bridge-cloud` service
  documents the SSH-tunnel pattern for remote/multi-host herdr (ADR-0001).
- Add `deploy/docker/README.md`: build/run steps, expected result
  (`curl http://127.0.0.1:5173/api/hosts`), and a troubleshooting section
  (socket permission/ENOENT, macOS vs Linux socket mounting, remote herdr
  via SSH tunnel, port-in-use).

## Capabilities

### New Capabilities
- `docker-image`: a reproducible, non-root, loopback-by-default container
  image bundling the bridge and built SPA, with a documented compose file
  and how-to for local and remote-herdr setups.

### Modified Capabilities
(none)

## Impact

- Affected code: `Dockerfile`, `docker-compose.yaml`,
  `deploy/docker/README.md`, `.dockerignore`.
- Affected systems: none required — this packages the existing bridge/web
  build outputs; no bridge/schema behavior changes.
