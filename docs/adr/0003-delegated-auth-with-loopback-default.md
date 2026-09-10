# ADR-0003: Delegated auth with 127.0.0.1 default

Status: Accepted
Date: 2026-09-09

## Context

The bridge exposes an HTTP+WS endpoint backed by full terminal control of
whatever herdr hosts it's configured against — a compromised bridge means a
compromised shell on the operator's dev machines. Cloud placement (ADR-0001)
is an explicit target, which means the bridge cannot rely on "it only ever
listens on localhost" as its sole safety net. Auth mistakes here have a much
higher blast radius than a typical web app: they lead directly to remote
shell access.

## Decision

The bridge owns no credentials of its own. Identity is delegated to a
reverse proxy placed in front of it — Tailscale Funnel, oauth2-proxy,
Cloudflare Access, or equivalent — which authenticates the user before
any request reaches the bridge. The bridge itself reads no auth headers
today; it trusts that whatever reaches it has already been authorised
by the proxy. Identity headers such as `X-Forwarded-User` may be added
by the proxy for downstream logging or a future audit trail, but the
bridge does not consume them. The bridge binds `127.0.0.1` by default;
binding on any other interface requires an explicit
`--i-know-what-im-doing` CLI flag. Safe operational
recipes for each placement are a required part of the documentation, not an
afterthought (see `docs/OPERATING.md`).

## Alternatives considered

- **A. No auth, localhost-only** (herdr-web's approach) — rejected as the
  sole mechanism because it doesn't cover the cloud placement this project
  explicitly targets.
- **B. Bridge-owned password + session store** — rejected: adds a
  credential store, password reset flow, and session management surface to
  a tool whose job is to proxy sockets, not manage identity.
- **C. mTLS or WebAuthn as the sole gate** — rejected: hostile onboarding
  experience on a new browser or device; can be layered on top of the
  delegated-proxy model later if needed, not a replacement for it.
- **D. Delegated auth with `127.0.0.1` default** — chosen.

## Consequences

- Zero credential-handling code in the bridge itself, and one deployment
  story that's uniform across laptop and cloud placements — the bridge
  never has to know or care how the user authenticated.
- Deployment complexity is pushed onto the operator: running oauth2-proxy,
  Tailscale, or an equivalent proxy is now a prerequisite for any
  non-loopback deployment, and misconfiguring the proxy silently reopens
  the risk this ADR exists to close.
- Revisit if a genuine password-only user emerges who cannot install or
  operate a reverse proxy in front of their bridge.
- Because the bridge does not read the proxy's identity header, per-user
  audit trails have to come from the proxy's own logs, not the bridge.
  Loopback loses its safety net once the bind is opened without a proxy
  in front — `--i-know-what-im-doing` is the only guard.
