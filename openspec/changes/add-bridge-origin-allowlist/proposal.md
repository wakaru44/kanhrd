## Why

The bridge's `/ws` endpoint accepts any WebSocket handshake from any web
page in the operator's browser. Verified against the tree, not inferred:

- `apps/bridge/src/ws/server.ts:28` registers the route as
  `app.get("/ws", { websocket: true }, (socket) => {` — the `FastifyRequest`
  Fastify passes as the handler's second argument is never taken, so no
  handshake header is available at any point in the connection's life.
- `grep -rniE "origin|referer|csrf|token|headers" apps/bridge/src/ws/`
  returns nothing, and `grep -rn "\.headers" apps/bridge/src/` returns
  nothing — no file in the bridge reads a request header at all.
- Live proof against the built bridge (`node apps/bridge/dist/main.js` on
  `127.0.0.1:5199`, empty `hosts:` list), a raw handshake carrying
  `Origin: https://evil.example`:

  ```text
  HTTP/1.1 101 Switching Protocols
  Upgrade: websocket
  Connection: Upgrade
  Sec-WebSocket-Accept: s3pPLMBiTxaQ9kYGzzhZRbK+xOo=
  ```

The same-origin policy does not apply to WebSockets: the browser sends the
handshake with the page's `Origin` and delivers the socket to the page
regardless of what the server thinks of it, unless the server refuses the
upgrade. So any page the operator visits — an ad frame, a docs site, a
malicious npm README rendered in a browser — can run
`new WebSocket("ws://127.0.0.1:5173/ws")` and then drive all nineteen
implemented dispatch verbs in `apps/bridge/src/ws/dispatch.ts`
unauthenticated: `pane.send_text`, `pane.send_keys`, `pane.read`,
`pane.subscribe_output`, `pane.list`, `pane.split`, `pane.close`,
`pane.move`, `pane.rename`, `tab.create`/`rename`/`close`/`move`,
`workspace.create`/`rename`/`close`, `events.subscribe`,
`pane.unsubscribe_output`, `bridge.capabilities`.

`pane.send_text` types into a live shell. This is therefore arbitrary
command execution as the operator on every configured herdr host, with all
terminal output readable back over the same socket.

Loopback binding does not help. It is the load-bearing half of ADR-0003's
model for the default deployment (`make run`, no proxy), and it stops
attackers *on the network* — but the attacker here is a page already
running inside the operator's own browser, which is on localhost by
definition. `docs/THREAT-MODEL.md` already states this ("No rate limiting,
no CSRF token, no Origin check"); documenting the hole is not closing it.

## What Changes

- The bridge SHALL validate the `Origin` header on every `/ws` handshake
  against an allowlist, refusing the upgrade with `403` when it does not
  match.
- The allowlist is derived by default from the existing `bind`/`port`
  config, so every loopback deployment (`make run`, `pnpm dev`, the
  compose stack) keeps working with no config change.
- Extra origins are configured with one obvious line: `allowed_origins:`
  in `kanhrd.config.yaml`, or a repeatable `--allowed-origin` CLI flag.
- A wildcard bind (`0.0.0.0`, `::`) with no configured origins refuses to
  start, mirroring the existing `--i-know-what-im-doing` guard in
  `apps/bridge/src/config.ts:85`. The escape hatch is `--allow-any-origin`,
  CLI-only and loudly logged.
- Handshakes carrying **no** `Origin` header are allowed by default
  (non-browser clients send none, browsers always send one), with an opt-in
  `require_origin` / `--require-origin` for operators who want strictness.
  See `design.md` decision 4.

Deliberately **not** in this change:

- **No per-session token.** Rejected by the owner: that is what the OAuth
  proxy is for (ADR-0003). Noted in `design.md` alternatives only.
- **No `Host`-header check on the REST routes.** DNS rebinding against
  `apps/bridge/src/http/rest.ts` is a real, related exposure, but it is a
  different mechanism against a different threat, and the REST surface is
  two read-only `GET`s versus `/ws`'s nineteen verbs including keystroke
  injection. Deferred to a named follow-up — see `design.md` decision 8.
- **No implementation in this change.** Proposal-first, per
  `openspec/README.md`; `tasks.md` describes work for a later change.

## Impact

- Affected specs: new capability `bridge-security` (this is the bridge's
  first security-behaviour spec; `tier-1`/`2`/`3` cover wire contracts).
- Affected code, when implemented: `apps/bridge/src/config.ts`
  (`BridgeConfig`, `RawConfigFile`, `CliOverrides`, derivation + guard),
  `apps/bridge/src/main.ts` (`parseArgs`), `apps/bridge/src/ws/server.ts`
  (a `preValidation` hook on the `/ws` route), plus their unit tests.
- Affected deployment files, when implemented: `Dockerfile` (its
  `CMD ["--bind", "0.0.0.0", "--i-know-what-im-doing"]` is a wildcard bind
  and would refuse to start), `Makefile` `run-exposed` target, and the
  three recipes in `docs/OPERATING.md`.
- Migration: laptop-only operators see no change. Operators behind
  oauth2-proxy or Tailscale Serve must add one `allowed_origins` line —
  this is the intended, loud break. Full per-recipe analysis in
  `design.md` decision 7.
- No wire-contract change: no `packages/schema/**` change, no new verb, no
  change to any response shape. A permitted handshake behaves exactly as
  it does today.
