## Purpose

A compose overlay gating the bridge behind delegated GitHub-identity auth
(oauth2-proxy + nginx) for cloud-hub deployments, keeping the base
loopback-only compose file untouched and auth entirely outside the bridge.

## ADDED Requirements

### Requirement: Bridge is unreachable except through the auth-gated proxy
When the oauth overlay is applied, the bridge service SHALL be reachable
only from other containers on the internal Docker network, not via any
published host port. All external traffic SHALL route through nginx.

#### Scenario: Bridge port is not directly reachable from the host
- **WHEN** the oauth overlay (`docker-compose.oauth.yaml`) is applied on top of the base compose file
- **THEN** `curl http://<vm-ip>:5173` from outside the Docker network fails to connect

### Requirement: Every request is authenticated before reaching the bridge
nginx SHALL issue an `auth_request` subrequest to oauth2-proxy for every
request to `/`, and SHALL only forward the request to the bridge — with an
`X-Forwarded-User` header identifying the authenticated user — when
oauth2-proxy responds success; otherwise it SHALL redirect to sign-in.

#### Scenario: Unauthenticated request is redirected, not forwarded
- **WHEN** a browser with no valid session cookie requests the board
- **THEN** nginx redirects to the OAuth provider's sign-in flow instead of forwarding the request to the bridge

### Requirement: Secrets are never committed to the repo
oauth2-proxy's client ID, client secret, and cookie secret SHALL be
supplied only via a git-ignored `.env` file at deploy time. The committed
`oauth2-proxy.cfg` SHALL contain only non-secret, placeholder, or
access-control configuration.

#### Scenario: Committed config contains no real credentials
- **WHEN** `deploy/oauth/oauth2-proxy.cfg` is inspected in the repository
- **THEN** it contains no live client secret or cookie secret value, only placeholders or non-secret settings
