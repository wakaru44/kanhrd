# Design: bridge Origin allowlist

Every decision below is settled. The implementer should need no further
judgement calls; where a decision is arguable, the reasoning is recorded so
a reviewer can overturn it deliberately rather than by accident.

## Context

- `apps/bridge/src/config.ts` already owns the precedent this change
  copies: `LOOPBACK_ADDRESSES` plus the guard at `config.ts:85` that
  refuses a non-loopback bind unless `--i-know-what-im-doing` was passed,
  with an error naming the flag. Safe default, explicit escape hatch,
  honest error message. The Origin guard takes the same shape.
- `apps/bridge/src/ws/server.ts` registers `/ws` through
  `@fastify/websocket` v11. Fastify's route lifecycle (`onRequest`,
  `preValidation`, `preHandler`) runs on the upgrade request *before* the
  socket is handed to the handler; replying from such a hook aborts the
  upgrade. That is the hook point — the WebSocket handler itself is too
  late, and it is why "there is no hook where it could check" is true only
  of the current code, not of the framework.
- The bridge owns no credentials (ADR-0003) and this change does not give
  it any. An Origin allowlist is not authentication; it is the browser
  telling the server which page opened the socket, which is exactly the
  fact needed to distinguish the kanhrd SPA from a random page the
  operator visited.

## Decision 1: the default allowlist, derived from `bind` + `port`

A loopback deployment with no config must keep working. The allowlist is
therefore always the union of a **derived** set and a **configured** set.

Derivation, given the merged `bind` and `port`:

- Let `HOSTS` be the set of host strings the operator's browser could
  plausibly use to reach this bridge, computed from `bind`:
  - `bind` in `LOOPBACK_ADDRESSES` (`127.0.0.1`, `::1`, `localhost`) →
    `HOSTS = {"127.0.0.1", "localhost", "[::1]"}`.
  - `bind` is the wildcard `0.0.0.0` or `::` → `HOSTS =
    {"127.0.0.1", "localhost", "[::1]"}` only. The wildcard itself is not a
    reachable origin and is never derived from.
  - `bind` is any other literal address (e.g. a Tailscale IP from
    `make run-tailscale`) → `HOSTS = {"127.0.0.1", "localhost", "[::1]",
    "<bind>"}`, with an IPv6 literal bracketed.
- The derived allowlist is `{http, https} × HOSTS` at the configured
  `port` — e.g. for the default `127.0.0.1:5173`:

  ```text
  http://127.0.0.1:5173   https://127.0.0.1:5173
  http://localhost:5173   https://localhost:5173
  http://[::1]:5173       https://[::1]:5173
  ```

Two derivation choices worth naming:

- **`[::1]` is included.** A browser given `http://[::1]:5173` sends
  `Origin: http://[::1]:5173`. Omitting it would break a small but real
  set of setups for no gain — reaching that origin already requires being
  on the box.
- **Deriving from a literal non-loopback bind is deliberate.** When the
  bridge is bound to `100.64.x.y:5173`, a page served from
  `http://100.64.x.y:5173` *is* the kanhrd SPA. An attacker page cannot
  forge that `Origin`; it can only reach the port directly, which is the
  network boundary that loopback/proxy placement already governs. So this
  keeps `make run-tailscale` and `make run-exposed` working without
  weakening the property being bought.

## Decision 2: configuring extra origins

- **YAML key**: `allowed_origins`, a list of strings, snake_case to match
  the existing `spa_dir`/`hosts` shape in `RawConfigFile`. Maps to
  `BridgeConfig.allowedOrigins: string[]`.
- **CLI flag**: `--allowed-origin <origin>`, **repeatable**; each
  occurrence appends. Singular name because each occurrence carries one
  origin — `parseArgs` in `main.ts` already consumes `argv[++i]` for
  every valued flag, so this slots in unchanged in shape.
- **Precedence**: if one or more `--allowed-origin` flags are given, the
  resulting list **replaces** the file's `allowed_origins` — the same
  "each flag overrides the matching config-file value" rule every other
  override in `CliOverrides` follows. The derived set of decision 1 is
  always added on top of whichever list wins; it cannot be turned off
  except by `--allow-any-origin`.

Worked config for each `docs/OPERATING.md` recipe:

### Recipe 1 — laptop-only

No change. `make run` / `pnpm --filter @kanhrd/bridge dev` binds
`127.0.0.1:5173`, and the derived allowlist already contains
`http://127.0.0.1:5173` and `http://localhost:5173`. A `kanhrd.config.yaml`
that never mentions `allowed_origins` is correct and complete.

```yaml
# kanhrd.config.yaml — unchanged; nothing to add
bind: 127.0.0.1
port: 5173
hosts:
  - name: local
    socket: ~/.config/herdr/herdr.sock
```

### Recipe 2 — cloud hub behind oauth2-proxy

The bridge stays on loopback; the browser's origin is the public name
nginx serves, so it must be listed. One line:

```yaml
# kanhrd.config.yaml on the cloud VM
bind: 127.0.0.1
port: 8080
allowed_origins:
  - https://kanhrd.example.com
hosts:
  - name: laptop
    socket: /home/kanhrd/sockets/laptop.sock
```

Equivalently, without a config file:

```bash
kanhrd-bridge --bind 127.0.0.1 --port 8080 \
  --allowed-origin https://kanhrd.example.com
```

Tailscale Serve is the same shape with the tailnet name — this is the
line the task brief calls out as needing to be obvious:

```yaml
allowed_origins:
  - https://kanhrd.tailnet-name.ts.net
```

Note: `docs/OPERATING.md` recipe 2 currently prints
`kanhrd-bridge --bind 127.0.0.1:8080 --i-know-what-im-doing`. That command
is already wrong today, independently of this change — `--bind` takes an
address, not `address:port`, and `"127.0.0.1:8080"` is not in
`LOOPBACK_ADDRESSES`, so `loadConfig` throws. The docs task in `tasks.md`
should fix it to `--bind 127.0.0.1 --port 8080` while adding the
`allowed_origins` line.

### Recipe 3 — mixed: cloud hub + reverse-tunnelled laptop

The tunnel is invisible to the bridge (ADR-0001); origin-wise this recipe
is recipe 2 with an extra host entry, and if the operator also opens the
board from the laptop over an SSH forward, that forward's local origin
goes in the list too:

```yaml
# kanhrd.config.yaml on the cloud VM
bind: 127.0.0.1
port: 8080
allowed_origins:
  - https://kanhrd.example.com
hosts:
  - name: cloud
    socket: ~/.config/herdr/herdr.sock
  - name: laptop
    socket: /home/kanhrd/sockets/laptop.sock
```

```bash
# on the laptop, if browsing through `ssh -L 8080:127.0.0.1:8080 cloud-host`
# nothing extra is needed: http://127.0.0.1:8080 is already derived from
# the bridge's own bind+port.
```

### Container (not one of the three recipes, but shipped in-repo)

`Dockerfile` runs `CMD ["--bind", "0.0.0.0", "--i-know-what-im-doing"]`
and `docker-compose.yaml` maps `127.0.0.1:5173:5173`. Under decision 3 a
wildcard bind with no configured origins refuses to start, so the image's
`CMD` must gain the origin the operator's browser actually uses — which,
thanks to the loopback port mapping, is host-side loopback:

```dockerfile
CMD ["--bind", "0.0.0.0", "--i-know-what-im-doing", \
     "--allowed-origin", "http://127.0.0.1:5173", \
     "--allowed-origin", "http://localhost:5173"]
```

## Decision 3: non-loopback bind

**A wildcard bind (`0.0.0.0` or `::`) with an empty configured allowlist
is a startup error.** A literal non-loopback address is not, because
decision 1 can derive a real origin from it.

Rationale: `0.0.0.0` says "reachable by an unknown set of names", so the
bridge cannot honestly guess which origin is legitimate, and guessing
wrong here is the difference between a closed hole and a hole with a
reassuring log line. This is exactly the `--i-know-what-im-doing` shape:
refuse, and name the way forward.

Failure mode when missing — thrown from `loadConfig`, so the process never
listens:

```text
refusing to serve /ws on wildcard bind "0.0.0.0" with an empty origin
allowlist: a browser origin cannot be derived from a wildcard bind.
Set `allowed_origins:` in kanhrd.config.yaml, pass --allowed-origin
<origin> (repeatable), or --allow-any-origin to disable the check.
```

`--allow-any-origin` is **CLI-only** — no YAML equivalent. A config file
gets copied between machines and reviewed rarely; a flag on the command
line sits next to `--i-know-what-im-doing` where it is visible in
`ps`, the Makefile, or the compose file. It is logged at `warn` on every
startup, not just once.

## Decision 4: handshakes with no `Origin` header

**Allowed by default. Opt-in strictness via `require_origin: true` /
`--require-origin`.**

The reasoning, because this is the decision most likely to break someone:

- A browser **always** sends `Origin` on a WebSocket handshake. The
  WebSocket API sets it unconditionally; unlike `fetch`, there is no
  no-cors mode that omits it and no way for page script to remove it. So
  "absent" is a strong signal of a non-browser client, and rejecting
  absent buys nothing against the threat this change exists to close.
- Non-browser clients that legitimately send none: `curl`,
  `websocat`, Node's `ws` (no `origin` option set), future kanhrd CLI
  tooling, health checks, and some proxies. Rejecting them would be a
  gratuitous break with an obscure symptom.
- An attacker with a non-browser client can of course omit `Origin` — but
  such an attacker must already be able to reach the port, which is the
  boundary that loopback binding and the reverse proxy already govern.
  Allowing absent origins is therefore not a regression against today's
  behaviour; it simply does not extend the fix into a threat this change
  does not claim to address.
- Operators who have a proxy in front and know every legitimate client is
  a browser can set `require_origin: true` and get the stricter posture.

The literal string `Origin: null` (sandboxed iframe, `file://`, some
redirect chains) is **not** "absent": it is a present origin that matches
no allowlist entry, and is rejected. `null` is never allowlistable —
if it were, any sandboxed frame on any site would qualify.

## Decision 5: wildcards in allowlist entries

**No pattern syntax at all.** Entries are exact origins. The all-or-nothing
escape hatch is `--allow-any-origin`; there is no middle syntax.

A pattern language here is a footgun with a known shape: a naive
`endsWith(".example.com")` matches `https://evil-example.com` and
`https://example.com.attacker.net`; a naive `*` glob converted to a regex
without anchoring matches everything. The failure is silent and looks like
success. Nobody in the three recipes needs a wildcard: each has exactly
one browser-facing name.

Matching rule, stated precisely so it can be implemented without further
decisions:

1. At startup, each configured entry is parsed with the WHATWG `URL`
   parser and normalized to a canonical origin triple
   `(scheme, host, port)`:
   - scheme lowercased; only `http` and `https` are accepted;
   - host lowercased; an IPv6 literal is stored bracketed;
   - port is the explicit port if present, else `80` for `http` and
     `443` for `https`.
2. An entry with a path other than empty or `/`, or with a query,
   fragment, userinfo, or an unparseable value, is a **startup error**
   naming the offending entry. Config mistakes fail loudly at boot, not
   silently at the first handshake.
3. The incoming `Origin` header is parsed with the same function. If it
   fails to parse, or its scheme is not `http`/`https` (including the
   literal `null`), the handshake is rejected.
4. The handshake is permitted iff the incoming triple is **equal** to some
   allowlist triple — all three components compared, scheme and host
   case-insensitively via the normalization above, port numerically.
   No prefix, suffix, or subdomain matching. `http://localhost:5173` does
   not match `https://localhost:5173`, and neither matches
   `http://localhost:5174`.

Note that exact host matching is what defeats the
`http://localhost.attacker.example/` trick: that hostname resolves to
`127.0.0.1` for the fetch, but its origin string is not `localhost`.

## Decision 6: rejection behaviour

Refuse the **upgrade**, from a `preValidation` hook on the `/ws` route, so
no WebSocket is ever created and none of `dispatch`'s verbs are reachable:

- Response: `403 Forbidden`, `content-type: application/json`, body
  `{"error":"origin not allowed"}`. The body is a courtesy for `curl`; a
  browser surfaces only a generic WebSocket error either way, which is why
  the log below carries the real diagnosis.
- Log, one line per rejected handshake, at `warn` via the existing Fastify
  logger:

  ```text
  ws handshake rejected: origin "https://evil.example" is not allowed
  (remote 127.0.0.1). Allowed: http://127.0.0.1:5173, http://localhost:5173,
  http://[::1]:5173 (+https). Add it with `allowed_origins:` in
  kanhrd.config.yaml or --allowed-origin.
  ```

  The rejected origin, the remote address, the effective allowlist, and
  the way to fix it are all in the one line. That is what makes "I
  configured this wrong" (origin is my own proxy's name) distinguishable
  from "something attacked me" (origin is a site I do not run) without a
  debugging session.
- At startup, one `info` line prints the effective allowlist and how it
  was assembled, so an operator can diagnose before the first failure:

  ```text
  ws origin allowlist: derived http://127.0.0.1:5173, http://localhost:5173,
  http://[::1]:5173 (+https from bind 127.0.0.1 port 5173); configured
  https://kanhrd.example.com; missing-Origin handshakes allowed
  ```
- With `--allow-any-origin`, that startup line instead reads at `warn`:
  `ws origin allowlist DISABLED by --allow-any-origin: any web page in
  your browser can drive this bridge`.
- No rate limiting or lockout on repeated rejections. Out of scope; the
  log is the signal.

## Decision 7: migration

Checked against every recipe and run target in the repo:

| Deployment | Browser origin | Effect on upgrade |
| --- | --- | --- |
| `make run`, `pnpm dev`, recipe 1 | `http://127.0.0.1:5173` / `http://localhost:5173` | Works unchanged (derived) |
| `make run-exposed` (`--bind 0.0.0.0`) | `http://<lan-ip>:5173` | **Refuses to start** until an origin is configured; Makefile target updated in this change's task list |
| `make run-tailscale` (`--bind <tailscale ip>`) | `http://<tailscale ip>:5173` | Works unchanged (derived from the literal bind) |
| `make run-tailscale-serve` (loopback + `tailscale serve`) | `https://<host>.<tailnet>.ts.net` | **Breaks** until `allowed_origins` gains the ts.net name |
| Recipe 2, oauth2-proxy + nginx | `https://kanhrd.example.com` | **Breaks** until `allowed_origins` gains that name |
| Recipe 3, mixed hub + tunnel | as recipe 2 | Same as recipe 2 |
| `docker compose up` (mapped `127.0.0.1:5173:5173`) | `http://127.0.0.1:5173` | **Refuses to start** on the wildcard bind until the image `CMD` gains the two loopback origins (in this change's task list) |

So the claim in the brief holds: **laptop users see no change**. The
breaks are exactly the proxied deployments, which is the population that
must think about this anyway, and each is one line of config with the
error message naming the line. This can land without a breaking release —
kanhrd is alpha with no tags (`SECURITY.md`), the in-repo `Dockerfile` and
`Makefile` are updated in the same change, and `--allow-any-origin` is a
one-flag rollback for an operator caught mid-upgrade.

## Decision 8: other bypasses and adjacent holes

Noted for the reviewer; none are in scope unless marked.

- **`Sec-WebSocket-Protocol` is not a bypass of this check**, but it is a
  trap for a future one. Page script *can* set subprotocols, so a design
  that ever carries a credential there is forgeable by the attacker page
  exactly like the socket itself. If a token ever appears (it should not —
  ADR-0003), it does not belong in a subprotocol.
- **DNS rebinding against the REST routes — deferred, named follow-up
  `add-bridge-host-header-check`.** `apps/bridge/src/http/rest.ts` serves
  `GET /api/hosts` and `GET /api/hosts/:host/panes` with no `Host`
  validation (verified live: `curl -H 'Host: evil.example'
  http://127.0.0.1:5199/api/hosts` returns `200 {"hosts":[]}`). Today a
  cross-site `fetch` to those routes cannot *read* the response — no CORS
  headers are sent, so the browser withholds it — which is why REST is
  materially less exposed than `/ws` and why this change does not stretch
  to cover it. DNS rebinding defeats that same-origin protection, and the
  standard mitigation is a `Host` allowlist, not an `Origin` one: a
  different header, a different threat, a different failure mode for
  proxied deployments (nginx rewrites `Host`). Bundling it would double
  the migration surface of a change whose value is that it is small and
  reviewable. The follow-up should cover `/ws` too, since a `Host` check
  there is free once written.
- **Absent `Origin` from a non-browser client** — accepted by design,
  decision 4.
- **`Origin: null`** — rejected, decision 5, and never allowlistable.
- **Browser-internal mitigations are not a substitute.** Private Network
  Access / Local Network Access restrictions on public-to-private requests
  are shipping unevenly and can be disabled; they are a happy accident, not
  a control kanhrd may rely on.
- **The check is per-handshake, not per-message.** A permitted socket stays
  permitted for its lifetime, which is correct — the origin cannot change
  mid-socket — but it means a config change requires a restart to take
  effect on established connections.
- **A compromised or XSS'd kanhrd SPA is unaffected by this change.** Its
  origin is legitimately on the list. Out of scope.

## Alternatives considered

- **Per-session token in the handshake** — rejected by the owner: "that's
  what the OAuth proxy is for". It would put credential handling in a
  bridge whose defining decision (ADR-0003) is that it holds none.
- **Suffix/wildcard origin patterns** — rejected, decision 5: the failure
  mode is a silently over-broad allowlist.
- **Warn-only mode for one release** — rejected: the hole is arbitrary
  command execution, and a warn-only mode is a hole with a log line.
  `--allow-any-origin` already provides the deliberate, visible opt-out.
- **Checking `Referer` instead of `Origin`** — rejected: `Referer` is not
  sent on WebSocket handshakes and is strippable elsewhere.
