## 1. Config surface (`apps/bridge/src/config.ts`)

- [x] 1.1 Add `allowedOrigins: string[]` and `requireOrigin: boolean` to
      `BridgeConfig`; add `allowed_origins?: string[]` and
      `require_origin?: boolean` to `RawConfigFile` and copy them in
      `readConfigFile`. `DEFAULT_CONFIG` gets `allowedOrigins: []`,
      `requireOrigin: false`.
- [x] 1.2 Add `allowedOrigins?: string[]`, `requireOrigin?: boolean`,
      `allowAnyOrigin?: boolean` to `CliOverrides`. CLI list replaces the
      file list when non-empty (design decision 2).
- [x] 1.3 Add `parseOrigin(value): {scheme, host, port}` — WHATWG `URL`,
      lowercased scheme/host, bracketed IPv6, default port 80/443; throws
      on a path other than `/`, query, fragment, userinfo, non-`http(s)`
      scheme, or parse failure (design decision 5).
- [x] 1.4 Add `deriveOrigins(bind, port)` returning the `{http,https} ×
      HOSTS` set of design decision 1, with `WILDCARD_ADDRESSES =
      new Set(["0.0.0.0", "::"])` alongside the existing
      `LOOPBACK_ADDRESSES`.
- [x] 1.5 In `loadConfig`, after the existing loopback guard at
      `config.ts:85`: validate every configured entry through
      `parseOrigin` (error names the offending entry), then throw the
      wildcard-bind-with-empty-allowlist error of design decision 3 unless
      `allowAnyOrigin`.
- [x] 1.6 Expose the resolved allowlist on the returned config as
      normalized triples plus their original strings, so `ws/server.ts`
      does no parsing and the startup log can print what the operator
      typed.

## 2. CLI (`apps/bridge/src/main.ts`)

- [x] 2.1 `parseArgs`: `--allowed-origin <origin>` pushes onto
      `overrides.allowedOrigins` (repeatable); `--require-origin` and
      `--allow-any-origin` set their booleans. Same `argv[++i]` shape as
      the existing valued flags.
- [x] 2.2 Emit the startup `info` line (or the `--allow-any-origin`
      `warn` line) of design decision 6 after `loadConfig`, before
      `app.listen`.

## 3. Handshake enforcement (`apps/bridge/src/ws/server.ts`)

- [x] 3.1 Register `/ws` with a `preValidation` hook that reads
      `request.headers.origin` and replies `403` +
      `{"error":"origin not allowed"}` when the check fails. The
      WebSocket handler signature stays `(socket)` — nothing about the
      connection's lifetime changes.
- [x] 3.2 Implement the decision table: absent header → allowed unless
      `requireOrigin`; unparseable or `null` → refused; otherwise exact
      triple match against the effective allowlist; `allowAnyOrigin` short
      -circuits to allowed.
- [x] 3.3 Emit the per-rejection `warn` line of design decision 6 through
      the Fastify logger (`request.log.warn`).

## 4. Tests (`apps/bridge/src/**/*.test.ts`)

- [x] 4.1 `config.test.ts`: derivation for loopback / wildcard / literal
      non-loopback binds; port propagation; malformed-entry startup error;
      wildcard-bind-empty-allowlist startup error naming all three
      remedies; `--allow-any-origin` suppressing that error; CLI list
      replacing the file list.
- [x] 4.2 `parseOrigin` matching table: scheme mismatch, port mismatch,
      `example.com` vs `example.com.attacker.net`, `localhost` vs
      `localhost.attacker.example`, IPv6 bracketing, default-port
      equivalence (`http://x` ≡ `http://x:80`).
- [x] 4.3 Handshake tests using `app.inject` / `injectWS` against a
      registered route: allowed origin upgrades; disallowed origin gets
      `403` and no socket; absent origin allowed by default and refused
      under `requireOrigin`; `Origin: null` refused.
- [x] 4.4 One regression test asserting the original hole is closed: a
      handshake with a foreign origin never reaches `dispatch` (spy on the
      dispatch entry point or assert no message is ever processed).
- [x] 4.5 `pnpm --filter @kanhrd/bridge typecheck`, `build`, and `test`.
      Do **not** run `pnpm test:int` or `pnpm test:e2e` — both drive a
      real herdr and type into live panes.

## 5. Deployment files (same change, so nothing ships broken)

- [x] 5.1 `Dockerfile`: extend `CMD` with
      `--allowed-origin http://127.0.0.1:5173 --allowed-origin
      http://localhost:5173` (the wildcard bind would otherwise refuse to
      start — design decision 7).
- [x] 5.2 `Makefile`: `run-exposed` gains an explicit
      `--allowed-origin http://$$(hostname -I | awk '{print $$1}'):5173`
      or an equivalent documented value; `run-tailscale` needs no change
      (its literal bind derives its own origin) — confirm by running it.
- [x] 5.3 `docker-compose.yaml`: comment noting that changing the port
      mapping also requires changing the allowed origin.

## 6. Docs (owned by this change, written after the code is green)

> **Section 6 deferred — not written by this lane.** The implementing lane
> (L-ORIGIN) is scoped out of `docs/**`: a maintainer extends the docs. The
> code is green and the deployment files ship correct, but the four doc
> edits below are still outstanding and the change should not be archived
> until a maintainer lands them.

- [ ] 6.1 `docs/OPERATING.md`: add the `allowed_origins` line to recipes 2
      and 3, and fix the pre-existing wrong invocation
      `--bind 127.0.0.1:8080` → `--bind 127.0.0.1 --port 8080` (design
      decision 2).
- [ ] 6.2 `docs/THREAT-MODEL.md`: move "no Origin check" out of "does not
      defend against" into "defends against", stating the derived default,
      the missing-`Origin` policy, and that the `Host` check is still
      outstanding.
- [ ] 6.3 `SECURITY.md`: the known-by-design list no longer implies that
      any browser page can drive `/ws`.
- [ ] 6.4 `docs/adr/0003-*.md`: append a consequence noting that loopback
      binding is now paired with an origin allowlist. Do not rewrite the
      decision.

## 7. Follow-up, not this change

- [ ] 7.1 (still open, by design) File `add-bridge-host-header-check` for DNS rebinding against
      `apps/bridge/src/http/rest.ts` and `/ws` (design decision 8).

## 8. OpenSpec

- [x] 8.1 `openspec validate add-bridge-origin-allowlist --strict`
- [ ] 8.2 Archive on landing (blocked on section 6):
      `openspec archive add-bridge-origin-allowlist --yes`

## 9. Added during implementation

- [x] 9.1 `Makefile` `dev-bridge` gains `--allowed-origin
      http://localhost:4200` / `http://127.0.0.1:4200`. `design.md` is
      silent on the Angular dev server, whose proxy forwards `/api` and
      `/ws` with `changeOrigin: true` — that rewrites `Host`, not
      `Origin`, so the browser's origin at the bridge is the dev server's.
      Without this, `make dev` is a 403.
- [x] 9.2 `Makefile` `run-tailscale-serve` gains `--allowed-origin
      https://<ts.net name>` from the DNS name it already computes.
      `design.md` decision 7 lists this target as breaking; since the
      target owns the name, it can pass it and the safe Tailscale recipe
      keeps working with no operator action.
- [x] 9.3 The same allowlist is enforced on `GET /api/hosts` and
      `GET /api/hosts/:host/panes`, with `require_origin` deliberately NOT
      applied there (a browser omits `Origin` on a same-origin `GET`, so
      applying it would refuse the SPA's own requests). `design.md`
      decision 8 scopes REST out only for the *`Host`* check; leaving the
      `Origin` check off one of the two surfaces is a hole, and this
      costs no recipe. Static assets and the SPA fallback are unguarded —
      they are the page, not the data.
