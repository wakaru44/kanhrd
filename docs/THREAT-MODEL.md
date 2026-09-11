# kanhrd threat model

kanhrd puts a web UI in front of live terminal sessions. Those terminals
usually have coding agents running in them. Anyone who can drive the UI can
type into those terminals, read everything on their screens, and close them.

This page states what that means, what kanhrd defends against, and what it
deliberately does not. It is the companion to
[`adr/0003-delegated-auth-with-loopback-default.md`](adr/0003-delegated-auth-with-loopback-default.md),
which records why the design is shaped this way. Deployment recipes live in
[`OPERATING.md`](OPERATING.md) and are not repeated here.

Verified against the tree at the time of writing: `apps/bridge/src`
(`main.ts`, `config.ts`, `http/rest.ts`, `ws/server.ts`, `ws/dispatch.ts`),
the `Makefile` run targets, `Dockerfile`, and `docker-compose.yaml`.
Re-verified 2026-09-11 against `apps/bridge/src/http/origin.ts` and the
test fixtures under `apps/bridge/integration/fixtures/` and
`apps/web/e2e/fixtures/`.

## System in one paragraph

One process is deployed: the bridge (`apps/bridge`). It serves the built SPA
over HTTP and a single WebSocket endpoint at `/ws`, and it speaks herdr's
JSON API over one Unix socket per configured host. Remote herdr hosts reach
the bridge as local socket paths via SSH tunnels the bridge knows nothing
about (see
[`adr/0001-hub-bridge-ssh-tunnels.md`](adr/0001-hub-bridge-ssh-tunnels.md)).
The browser never talks to herdr directly.

## Assets

- **Shell access on every configured herdr host.** `pane.send_text` and
  `pane.send_keys` deliver arbitrary keystrokes into a live terminal. A
  terminal is a shell, so this is arbitrary command execution as the user
  who runs herdr, on every host in the bridge's host list — not only the
  machine the bridge runs on.
- **Terminal output.** `pane.read` and the output poller return full pane
  snapshots: source code, file paths, command history, whatever secrets the
  operator has echoed or a tool has printed, and the full text of agent
  conversations, including prompts and any credentials pasted into them.
- **Session lifecycle.** `pane.close`, `tab.close` and `workspace.close`
  destroy real state. A closed pane's scrollback is gone and its process is
  terminated; closing a linked-worktree workspace detaches that worktree.
  There is no undo.
- **The host list itself.** `GET /api/hosts` enumerates every configured
  host by name — a map of the operator's machines.

## Trust boundaries

### Browser to bridge

The only boundary that faces a network. The bridge applies no
authentication and no authorisation here: every HTTP route and every
WebSocket verb is served to whoever connects. The one check it does apply
is the `Origin` allowlist, which constrains which _web page_ may connect,
not which _person_ — a client that sends no `Origin` at all is a
non-browser client and is allowed through unless `--require-origin` says
otherwise. Identity on this boundary is expected to be enforced _outside_
the bridge, by a reverse proxy or by the bind address.

### Bridge to herdr socket

Not a security boundary. herdr's Unix socket is protected by filesystem
permissions and nothing else; a process that can open it has full control of
that herdr. The bridge holds that capability for every configured host for
its whole lifetime, and never re-checks anything per request. Compromise of
the bridge process is compromise of every host it is configured against.

### Reverse proxy to bridge

The proxy is the actual gate. It authenticates the user and forwards the
request; the bridge accepts whatever arrives. The bridge cannot tell a
proxy-authenticated request from a direct one, so any path that reaches the
bridge's port without traversing the proxy bypasses authentication
completely.

## What kanhrd defends against

Stated narrowly, because the list is short.

- **Accidental network exposure.** `loadConfig` refuses to start on any bind
  address outside `127.0.0.1`, `::1` and `localhost` unless
  `--i-know-what-im-doing` is passed. The default configuration is
  loopback-only, so a bridge started with no arguments is not reachable from
  the network.
- **Accidental container exposure.** `docker-compose.yaml` publishes the
  port as `127.0.0.1:5173:5173`, so the loopback restriction is enforced at
  the Docker layer even though the process inside the container binds
  `0.0.0.0`.
- **A web page in your browser driving the bridge.** `/ws` and `GET /api/*`
  both run the `Origin` allowlist in `http/origin.ts` before the handler:
  an upgrade or a request naming an origin outside the allowlist gets a
  bare `403 origin not allowed`, and the reason goes to the operator's log
  instead of the caller. The allowlist is derived from the bind address and
  port, so a loopback bridge covers its own origins with no configuration,
  and a wildcard bind with an empty `allowed_origins:` refuses to start
  rather than serving `/ws` to an origin it cannot name. This is an
  `Origin` check only; see the `Host` header below for what it does not
  cover.
- **Accidental writes to a live herdr from the test suites.** Neither suite
  can address `~/.config/herdr/herdr.sock`. Each run starts its own
  headless `kanhrd-test-*` herdr session, seeds it, points the bridge at it
  with a generated `--config`, and deletes it on teardown;
  `assertIsolatedSocket()` throws on the default socket and on any path
  outside a test session directory, and a suite with no session of its own
  skips rather than falling back.
- **Silent destruction of sessions from the UI.** Lifecycle verbs are
  confirmed in the client and state what will be destroyed (see
  [`adr/0005-client-side-cascade-purge-and-destructive-op-confirmations.md`](adr/0005-client-side-cascade-purge-and-destructive-op-confirmations.md)).
  This is a usability guard against operator mistakes, not a security
  control: the WebSocket verbs are reachable directly and are not gated by
  it.

That is the whole list. Everything else is the operator's responsibility.

## What kanhrd does not defend against

- **No authentication.** There is no login, no password, no token, no API
  key, no session. Nothing in `apps/bridge/src` reads a credential of any
  kind.
- **No authorisation.** There are no users, roles, or per-host permissions.
  Every connection can reach every configured host and every verb. A proxy
  that authenticates a group of people authenticates all of them into the
  same unrestricted board.
- **The identity header is not verified, or read.** ADR-0003 describes the
  proxy passing a trusted identity header such as `X-Forwarded-User`. The
  bridge does not currently read that header — no request handler inspects
  it. Even if it did, it could not verify it: a header is only as trustworthy
  as the guarantee that nothing can reach the port except through the proxy.
- **No audit log.** The bridge logs HTTP requests via Fastify's default
  logger. WebSocket verbs — every keystroke sent, every pane read, every
  close — are not recorded. After an incident there is no record of what was
  typed, by whom, or into which pane.
- **No rate limiting and no CSRF token.** Nothing throttles a caller that
  passes the origin check, and there is no per-request token: the allowlist
  is the whole of the browser-side guard.
- **No `Host` check, so DNS rebinding is still open.** The bridge validates
  `Origin`, not `Host`. A name the attacker controls that resolves to
  `127.0.0.1` carries its own origin, so a page served from it is
  same-origin with the bridge as far as the browser is concerned and the
  allowlist has nothing to reject. Closing that needs a `Host` allowlist
  alongside the origin one; a follow-up `add-bridge-host-header-check` is
  contemplated and not yet filed. Treat loopback as protection against the
  network, not against the browser.
- **No transport security of its own.** The bridge speaks plain HTTP. TLS is
  the proxy's job.
- **No confinement of what an agent does.** kanhrd relays keystrokes. What
  the agent or shell on the other end does with them is outside its control.

The single sentence that covers all of it: **anyone who can reach the
bridge's port can run arbitrary commands as you, on every machine you have
configured, and read everything on those screens.**

## Dangerous configurations, by name

### `--bind 0.0.0.0 --i-know-what-im-doing` with no proxy

`make run-exposed` does exactly this. It publishes the board on every
interface the machine has, including untrusted Wi-Fi and any network the
laptop later joins, with no authentication in front. On a coffee-shop
network, every other client on that network gets a shell on your development
machines. The flag is the whole gate; there is no second check.

Use it only on a network you would be willing to leave an unlocked SSH
session on — in practice, almost never. Prefer `make run-tailscale`, which
binds only the Tailscale interface IP, or the proxy recipe in
[`OPERATING.md`](OPERATING.md).

### Publishing the container port beyond loopback

The image runs `--bind 0.0.0.0 --i-know-what-im-doing` internally, because
container-side loopback is invisible to a port mapping. That flag is safe
only because `docker-compose.yaml` maps `127.0.0.1:5173:5173`. Changing that
mapping to `0.0.0.0:5173:5173` — or running `docker run -p 5173:5173`, which
binds all interfaces by default — removes the only control that was
enforcing loopback, with no error and no warning. The in-container flag will
not stop you.

### Tailscale Funnel versus Tailscale Serve

`tailscale serve` keeps the bridge on your tailnet: reachable by devices you
have authorised, and by nothing else. `make run-tailscale-serve` sets this
up, and the bridge stays bound to loopback behind it.

`tailscale funnel` publishes the same service to the **public internet**.
Funnel terminates TLS but does not authenticate anyone; without an
identity-aware proxy behind it, a Funnel in front of kanhrd is an
unauthenticated shell on a public URL. If you use Funnel, put oauth2-proxy
or Tailscale's identity headers plus an enforcing proxy between it and the
bridge, and confirm the policy actually rejects an unauthenticated request
before you trust it.

Tailnet membership is also not per-user authorisation. Every device on the
tailnet that can reach the bridge gets the full board.

### Network placement used as a stand-in for identity

"It's only on the VPN" and "it's behind Cloudflare" are network controls, not
identity controls. The bridge grants the same total access to every request
that arrives. Whatever sits in front must require an authenticated user and
enforce an allowlist — oauth2-proxy's `--email-domain` or allowlist, a
Cloudflare Access policy, or equivalent.

### Pointing a test suite at a herdr session you care about

The suites are sandboxed by construction: they drive panes they created in
their own `kanhrd-test-*` session and delete the session afterwards. This
was not always true — a run on 2026-09-10 typed into the operator's real
panes, including one running an agent, which executed the text as a prompt.
The guard at the time was an opt-in environment variable, which is a prompt
for a human, not isolation.

What remains dangerous is aiming a suite somewhere on purpose. The tier-2
specs type into a pane and the tier-3 specs close real tabs and workspaces,
so any session you hand them is a session you are willing to have typed
into and closed. Details in
[`../apps/web/e2e/README.md`](../apps/web/e2e/README.md) and
[`../apps/bridge/integration/README.md`](../apps/bridge/integration/README.md).

## Safe recipes

Do not improvise a deployment from this page. The three supported
placements — laptop-only, cloud hub behind oauth2-proxy, and a mixed setup
with a reverse SSH tunnel — are written out in
[`OPERATING.md`](OPERATING.md), with the oauth2-proxy walkthrough in
[`how-to/oauth-proxy.md`](how-to/oauth-proxy.md) and a working compose stack
in [`../deploy/oauth/`](../deploy/oauth/).

## Reporting

Vulnerabilities go to the private route in
[`../SECURITY.md`](../SECURITY.md). The behaviours documented on this page
are known and intentional; they are not vulnerabilities on their own. A way
to reach the bridge that bypasses a correctly configured proxy is.
