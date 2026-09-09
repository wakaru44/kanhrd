## Why

The Docker lane's default compose file is loopback-only by design
(ADR-0003) — kanhrd owns no identity/auth of its own. Making the board
reachable off a single laptop (a cloud-hub deployment) needed a delegated,
authenticated front door without adding auth logic to the bridge itself.
This is a retroactive OpenSpec record of the L-OAUTH-DEPLOY lane, written
after the fact because the work landed without a proposal. Commit:
`8e4e0bb` (`deploy`).

## What Changes

- Add `deploy/oauth/docker-compose.oauth.yaml`: a compose **overlay** (not
  a fold-in) that adds `oauth2-proxy` and `nginx` services on top of the
  root `docker-compose.yaml`, and reconfigures the base `bridge` service to
  bind only the internal Docker network instead of publishing a host port.
- Add `deploy/oauth/nginx.conf`: public-facing reverse proxy doing TLS
  termination, an `auth_request` gate against oauth2-proxy, injecting
  `X-Forwarded-User` on success, and WebSocket upgrade handling for `/ws`.
- Add `deploy/oauth/oauth2-proxy.cfg`: example (non-secret) oauth2-proxy
  config — provider, access restriction (`github_users`/`github_org`/
  `github_team`), upstream pointing at `http://bridge:5173`. Real secrets
  (`OAUTH2_PROXY_CLIENT_ID`/`_SECRET`/`_COOKIE_SECRET`) live in a
  git-ignored `.env`, never in the committed config.
- Add `docs/how-to/oauth-proxy.md`: a full deployment how-to for a cloud
  VM — a placeholder checklist (every `<REPLACE_ME_...>` value and where
  it lives), prerequisites (Docker Compose v2.24+ for the `!reset` merge
  extension, DNS, TLS certs, a registered GitHub OAuth App), and numbered
  steps.
- Add `deploy/oauth/README.md`: file-by-file reference plus a wire-flow
  diagram (browser → nginx → `auth_request` subrequest to oauth2-proxy →
  `X-Forwarded-User` → bridge, bridge unreachable except via the internal
  network).

## Capabilities

### New Capabilities
- `oauth-proxy-deploy`: a compose overlay + nginx + oauth2-proxy stack that
  gates the bridge behind delegated GitHub-identity auth for cloud-hub
  deployments, with a documented placeholder checklist and secrets kept
  out of the committed config.

### Modified Capabilities
(none)

## Impact

- Affected code: `deploy/oauth/**`, `docs/how-to/oauth-proxy.md`.
- Affected systems: requires a cloud VM with Docker Compose v2.24+, a
  domain with DNS pointed at it, TLS certs, and a registered GitHub OAuth
  App; does not modify the base `docker-compose.yaml` or the bridge itself
  — auth stays entirely in front of it, consistent with ADR-0003.
