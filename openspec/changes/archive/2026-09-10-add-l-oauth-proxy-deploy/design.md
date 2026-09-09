## Context

The base `docker-compose.yaml` (see `add-l-docker-image`) publishes the
bridge only to `127.0.0.1`, matching ADR-0003's loopback-by-default
posture. A cloud-hub deployment needs the opposite: reachable from the
internet, but only behind authenticated identity, with kanhrd itself never
owning credentials.

## Goals / Non-Goals

**Goals:**
- Gate the bridge behind delegated auth (oauth2-proxy + GitHub) without
  adding any auth code to the bridge.
- Keep the base compose file's local/loopback story completely untouched.

**Non-Goals:**
- Multi-provider auth support (GitHub only, for now).
- Auth logic inside kanhrd itself — this stays a deploy-time concern.

## Decisions

**Separate overlay file (`docker-compose.oauth.yaml`) instead of folding
oauth2-proxy/nginx into the main `docker-compose.yaml`.** The alternative —
adding `oauth2-proxy`/`nginx` services directly to the root compose file,
gated by profiles or commented-out blocks — was rejected. A single file
that has to represent both "loopback-only local dev" and "internet-facing
behind auth" as two divergent states of the *same* service definitions
(the bridge's port-binding differs between the two) is harder to read and
easier to misconfigure by half-applying one intent. `docker compose -f
docker-compose.yaml -f deploy/oauth/docker-compose.oauth.yaml up` composes
cleanly: the base file stays the simple, obviously-correct local-dev
default, and the overlay is the only place that needs to reason about the
internet-facing shape. This mirrors Compose's own intended use of multiple
files for environment-specific overrides, rather than fighting it with
profiles or env-var-gated service definitions.

## Risks / Trade-offs

- Two files to keep in sync if the base `bridge` service's image tag or
  volumes change — mitigated by the overlay only overriding what actually
  differs (network mode, published ports), not redeclaring the whole
  service.
- Placeholder-driven config (`<REPLACE_ME_...>`) relies on the operator
  actually replacing every value; the how-to's checklist is the mitigation,
  not a runtime check.
