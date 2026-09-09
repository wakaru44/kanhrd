# How to deploy kanhrd on a cloud VM behind oauth2-proxy

Deploy the bridge on an always-on cloud VM with oauth2-proxy and nginx
gating access, per ADR-0003's delegated-auth model. Use this when you want
the board reachable off your laptop.

## Placeholder checklist

Replace every one of these before running `docker compose up`:

- [ ] `<REPLACE_ME_DOMAIN>` — your domain, in `deploy/oauth/nginx.conf` (3 occurrences: `server_name` x2, `ssl_certificate` paths x2).
- [ ] `<REPLACE_ME_GITHUB_USERNAME>` — GitHub username(s) allowed to sign in, in `deploy/oauth/oauth2-proxy.cfg` (or switch to the commented `github_org`/`github_team` lines).
- [ ] `<REPLACE_ME_GITHUB_ORG>` / `<REPLACE_ME_GITHUB_TEAM>` — if using org/team restriction instead of `github_users`.
- [ ] `<REPLACE_ME_EMAIL_DOMAIN_OR_STAR>` — `email_domains` in `deploy/oauth/oauth2-proxy.cfg`.
- [ ] `<REPLACE_ME_GITHUB_OAUTH_APP_CLIENT_ID>` — `OAUTH2_PROXY_CLIENT_ID` in your `.env`.
- [ ] `<REPLACE_ME_GITHUB_OAUTH_APP_CLIENT_SECRET>` — `OAUTH2_PROXY_CLIENT_SECRET` in your `.env`.
- [ ] `<REPLACE_ME_32_BYTES_BASE64>` — `OAUTH2_PROXY_COOKIE_SECRET` in your `.env`.

## Prerequisites

- A cloud VM with Docker and Docker Compose v2.24+ installed (the compose
  overlay uses the `!reset` merge extension).
- A domain with a DNS `A`/`AAAA` record pointing at the VM.
- TLS certificates for that domain under `/etc/letsencrypt/live/<domain>/`
  on the VM (for example via `certbot certonly --standalone`).
- A GitHub OAuth App registered for this deployment (Settings → Developer
  settings → OAuth Apps), with its callback URL set per step 5 below.
- herdr running somewhere reachable from the VM — either directly on the VM
  or reverse-tunnelled from your laptop (see `docs/OPERATING.md` §3).
- The kanhrd repo checked out on the VM, with the root `docker-compose.yaml`
  present (built separately; see `docs/OPERATING.md` §2 for the underlying
  recipe shape).

## Steps

1. On the VM, clone the repo and `cd` into it:

   ```bash
   git clone <your-kanhrd-remote> kanhrd && cd kanhrd
   ```

2. Create a repo-root `.env` file with your OAuth secrets:

   ```bash
   cat > .env <<'EOF'
   OAUTH2_PROXY_CLIENT_ID=<REPLACE_ME_GITHUB_OAUTH_APP_CLIENT_ID>
   OAUTH2_PROXY_CLIENT_SECRET=<REPLACE_ME_GITHUB_OAUTH_APP_CLIENT_SECRET>
   OAUTH2_PROXY_COOKIE_SECRET=<REPLACE_ME_32_BYTES_BASE64>
   EOF
   ```

   Generate the cookie secret with `openssl rand -base64 32 | tr -- '+/' '-_'`.

3. Edit `deploy/oauth/nginx.conf` and `deploy/oauth/oauth2-proxy.cfg`,
   replacing the remaining `<REPLACE_ME_...>` placeholders from the
   checklist above with your domain and access-control values.

4. Point `deploy/oauth/oauth2-proxy.cfg`'s `upstreams` at the bridge (it
   already defaults to `http://bridge:5173`, matching the service name in
   `docker-compose.oauth.yaml` — leave it as-is unless you renamed the
   service) and set your bridge's own `kanhrd.config.yaml` host list per
   `docs/OPERATING.md`.

5. In your GitHub OAuth App settings, set the authorization callback URL to
   `https://<your-domain>/oauth2/callback`.

6. Bring the stack up, layering the oauth overlay on the base compose file:

   ```bash
   docker compose -f docker-compose.yaml -f deploy/oauth/docker-compose.oauth.yaml up -d
   ```

7. Open `https://<your-domain>` in a browser.

## Expected result

The browser redirects to GitHub's SSO login, then back to
`https://<your-domain>/oauth2/callback`, and finally lands on the kanhrd
board. Opening a card's terminal view and typing works over the `/ws`
connection through the proxy chain.

## Troubleshooting

- **Board loads but the terminal view never connects.** Some
  reverse-proxy setups drop the WebSocket upgrade. Confirm
  `deploy/oauth/nginx.conf`'s `location /` block still has
  `proxy_set_header Upgrade $http_upgrade;` and
  `proxy_set_header Connection $connection_upgrade;`, and that nothing
  upstream of nginx (a cloud load balancer, CDN) is stripping the
  `Upgrade` header.
- **Login loops back to the SSO screen repeatedly.** Usually a cookie
  domain/secure mismatch — `cookie_secure = true` requires HTTPS end to
  end, so confirm you're hitting `https://`, not `http://`, and that
  `OAUTH2_PROXY_COOKIE_SECRET` is a stable 32-byte value (regenerating it
  on every restart invalidates all existing sessions).
- **Bridge shows all activity as one identity, or as blank.** Check that
  `pass_user_headers = true` and `set_xauthrequest = true` are set in
  `oauth2-proxy.cfg`, and that nginx's `auth_request_set $auth_user
$upstream_http_x_auth_request_user;` line is present and forwarding into
  `X-Forwarded-User` — this is the trusted identity header ADR-0003
  specifies.
- **`docker compose ... config` fails with an unknown `!reset` error.**
  Your Compose version predates the merge-reset extension; upgrade to
  Compose v2.24 or later.
- **`docker compose up` succeeds but the bridge container immediately
  exits.** Confirm the base `docker-compose.yaml`'s `bridge` service exists
  and builds from the repo `Dockerfile` — this overlay only reconfigures
  that service, it doesn't define it from scratch.
- **oauth2-proxy container is unhealthy / 502 from nginx.** Check
  `docker compose logs oauth2-proxy` for a provider auth error first (bad
  client id/secret is the most common cause), then confirm the socket the
  bridge points at (per `docs/OPERATING.md`) is actually reachable from the
  VM.

## Related

- `docs/OPERATING.md` §2 "Cloud hub with oauth2-proxy" — the high-level
  recipe this how-to implements concretely.
- `docs/adr/0003-delegated-auth-with-loopback-default.md` — why the bridge
  delegates identity to a proxy instead of owning credentials itself.
- `deploy/oauth/README.md` — file-by-file reference for everything under
  `deploy/oauth/`.
