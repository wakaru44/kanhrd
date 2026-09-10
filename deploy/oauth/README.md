# deploy/oauth

Cloud-hub deployment overlay: puts oauth2-proxy and nginx in front of the
bridge so it is never reachable without a delegated, authenticated identity
(ADR-0003). Task-oriented steps live in
`docs/how-to/oauth-proxy.md`; this file is the file-by-file reference.

## Files

| File                        | Purpose                                                                                                                                                                                                                   |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docker-compose.oauth.yaml` | Compose overlay. Adds `oauth2-proxy` and `nginx` services, and reconfigures the base `bridge` service to bind only the internal Docker network instead of a host port. Layer it on top of the root `docker-compose.yaml`. |
| `nginx.conf`                | Public-facing reverse proxy: TLS termination, `auth_request` gate against oauth2-proxy, `X-Forwarded-User` header injection, WebSocket upgrade for `/ws`.                                                                 |
| `oauth2-proxy.cfg`          | oauth2-proxy config (example, non-secret values only). Provider, access restriction, upstream.                                                                                                                            |

Why nginx and not Caddy: `docs/OPERATING.md`'s existing cloud-hub recipe
already documents an nginx config for this exact shape, so this overlay
extends that convention instead of introducing a second reverse-proxy
story for the same topology.

## Wire flow

```text
                    HTTPS (443)                 internal Docker network only
 browser  ────────────────────────▶  nginx  ──────────────┬─────────────────▶  bridge:5173
                                       │                    │  (auth_request
                                       │                    │   subrequest)
                                       └────────────────────▶  oauth2-proxy:4180
                                            /oauth2/*, /oauth2/auth

 1. nginx terminates TLS on 443, redirects 80 -> 443.
 2. Every request to `/` triggers an internal auth_request to
    oauth2-proxy's /oauth2/auth.
 3. oauth2-proxy answers 202 (authenticated) or 401 (redirect to SSO).
 4. On success, nginx reads the identity off the auth_request response
    and forwards it to the bridge as X-Forwarded-User.
 5. bridge:5173 is only reachable from other containers on the `internal`
    Docker network — no host port is published for it in this overlay.
```

## Environment variables

Set these in a repo-root `.env` file (git-ignored, sourced from your own
secrets manager — see `docker-compose.oauth.yaml`'s `env_file:`). Never put
real values in `oauth2-proxy.cfg`, which is committed to the repo.

| Variable                     | Used by      | Notes                                                                  |
| ---------------------------- | ------------ | ---------------------------------------------------------------------- |
| `OAUTH2_PROXY_CLIENT_ID`     | oauth2-proxy | OAuth App client ID from your provider.                                |
| `OAUTH2_PROXY_CLIENT_SECRET` | oauth2-proxy | OAuth App client secret.                                               |
| `OAUTH2_PROXY_COOKIE_SECRET` | oauth2-proxy | 32 random bytes, base64: `openssl rand -base64 32 \| tr -- '+/' '-_'`. |

## Placeholders

Every redacted value in this directory uses the `<REPLACE_ME_XXX>` form.
The full checklist, with what each one controls, lives at the top of
`docs/how-to/oauth-proxy.md`.

## Related

- `docs/adr/0003-delegated-auth-with-loopback-default.md` — why identity is
  delegated to a proxy instead of owned by the bridge.
- `docs/OPERATING.md` §2 "Cloud hub with oauth2-proxy" — high-level recipe
  shape this overlay implements concretely.
- `docs/how-to/oauth-proxy.md` — step-by-step deployment guide.
