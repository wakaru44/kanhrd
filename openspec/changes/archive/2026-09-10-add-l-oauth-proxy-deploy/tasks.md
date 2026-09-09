## 1. Compose overlay

- [x] 1.1 `docker-compose.oauth.yaml`: adds `oauth2-proxy` + `nginx` services, reconfigures `bridge` to the internal network only (no published host port) — `deploy/oauth/docker-compose.oauth.yaml`

## 2. Reverse proxy + auth config

- [x] 2.1 `nginx.conf`: TLS termination, `auth_request` gate against oauth2-proxy, `X-Forwarded-User` injection, WebSocket upgrade for `/ws` — `deploy/oauth/nginx.conf`
- [x] 2.2 `oauth2-proxy.cfg`: example non-secret config (provider, access restriction, upstream) — `deploy/oauth/oauth2-proxy.cfg`
- [x] 2.3 Secrets (`OAUTH2_PROXY_CLIENT_ID`/`_SECRET`/`_COOKIE_SECRET`) sourced from a git-ignored `.env`, never committed — `deploy/oauth/docker-compose.oauth.yaml` (`env_file:`)

## 3. Docs

- [x] 3.1 `docs/how-to/oauth-proxy.md`: placeholder checklist, prerequisites, numbered deployment steps — `docs/how-to/oauth-proxy.md`
- [x] 3.2 `deploy/oauth/README.md`: file-by-file reference + wire-flow diagram — `deploy/oauth/README.md`
- [x] 3.3 Cross-reference `docs/adr/0003-delegated-auth-with-loopback-default.md` and `docs/OPERATING.md`'s cloud-hub recipe — `deploy/oauth/README.md`

## 4. Validator

- [x] 4.1 `openspec validate add-l-oauth-proxy-deploy --strict` passes with zero errors
