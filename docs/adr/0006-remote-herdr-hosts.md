# ADR-0006: Remote herdr hosts via operator-managed SSH forwards

Status: Proposed
Date: 2026-09-10

## Context

ADR-0001 already chose the topology: one hub bridge, every herdr socket
made locally reachable to it by an SSH forward, tunnel lifecycle outside
the bridge. What ADR-0001 did *not* settle is the operator-facing half —
where the operator learns that remote hosts exist, what a remote entry
looks like in config, and whether the bridge should ever open the tunnel
itself. That gap is now a reported user problem: "cannot find where to add
a remote host — likely not built yet," with `alpaca01` already running
herdr and waiting to be added.

The code confirms the gap is documentation and ergonomics, not transport:

- `apps/bridge/src/config.ts` — `HostConfig = { name: string; socket: string }`.
  Hosts come only from `kanhrd.config.yaml`; the built-in default is a
  single `local` → `~/.config/herdr/herdr.sock`.
- `apps/bridge/src/herdr/hosts.ts` — one `HostRuntime` per configured
  host, each with its own `HerdrClient`, its own reconnect backoff
  (1s → 30s), and a `HostSummary { name, connected, last_error }` the SPA
  renders per host. Nothing in that runtime cares whether the socket path
  is local or forwarded.
- `apps/web/src/app/settings/settings.ts` — `/settings` lists hosts
  read-only and says so: "the host list is bridge-owned … this screen reads
  it, it never writes it."

So the transport work for a remote host is: put a socket file at a path
the bridge can `connect()` to. Zero bridge code. The reason the user
cannot find where to add a remote host is a stack of small, concrete
defects:

1. **No example config ships.** There is no `kanhrd.config.yaml` and no
   `kanhrd.config.example.yaml` in the repo. `apps/bridge/README.md` has
   the only correct YAML in the tree.
2. **The one place the SPA shows the config snippet is unreachable.**
   `apps/web/src/app/board/empty-state.ts` renders a correct `hosts:` /
   `socket:` snippet, gated on `noHostsConfigured = hosts().length === 0`.
   Because `DEFAULT_CONFIG` always supplies the `local` host, that
   condition is never true in a running bridge. The instructions exist and
   are structurally unshowable.
3. **The docs disagree with the code on the key name.**
   `docs/OPERATING.md:50,152` and `docs/CONTEXT.md:119,158` document
   `{name, socket_path}`. The parser reads `socket`. An operator following
   OPERATING.md verbatim writes a host entry the bridge silently ignores
   the path of.
4. **`docs/OPERATING.md` §3 only documents the *reverse* direction**
   (laptop pushes its socket up to a cloud hub). The user's case is the
   forward direction — laptop bridge reaching out to `alpaca01` — and no
   recipe covers it.

The open architecture question the user raised is which shape to build
for, given herdr's transport quirk: herdr's socket is one request per
connection (`apps/bridge/src/herdr/client.ts` — `request()` opens a fresh
connection per call and herdr closes it after one response line), with
`events.subscribe` the sole exception that holds a connection open. The
bridge's steady state is therefore *many short connections* — one
`pane.read` per open terminal per 150ms (ADR-0004), one `pane.list` per
host per 5s (`AGENT_STATUS_POLL_INTERVAL_MS`) — plus one long-lived
subscription per host. Any remote transport must be cheap per connection,
not just cheap per session.

### Empirical results

Measured on this machine (macOS 25.5, OpenSSH 10.2p1, ssh to `localhost`,
so network RTT is ~0 and the numbers isolate transport overhead, not
distance). A fake herdr that closes after each response was placed at
`/tmp/kh-real.sock`; a client ran 30 sequential one-shot requests while
holding a concurrent `events.subscribe` stream.

| Transport | Median request | Notes |
| --- | --- | --- |
| Direct unix socket | 0.12 ms | baseline |
| `ssh -nNT -L /tmp/fwd.sock:/tmp/real.sock host` | 0.83 ms | 30/30 requests OK, subscription streamed concurrently on the same tunnel |
| `ssh host socat - UNIX-CONNECT:…` per request | ~200 ms | full connection setup per request |
| same, over `ControlMaster` | ~30 ms | channel open + remote `socat` spawn per request |

Four further behaviours were verified, not assumed:

- A `-L` unix→unix forward multiplexes independent channels: the
  close-per-request pattern and a held-open subscription coexist on one
  tunnel with no interference.
- When the tunnel process dies, the local socket **file survives** and
  `connect()` fails `ECONNREFUSED` — a clean, immediate error, exactly
  what `HostRuntime`'s existing failure path already turns into
  `connected: false` + `last_error`.
- A restarted `ssh -L` over that stale file fails:
  `unix_listener: cannot bind to path …: Address already in use`.
  `-o StreamLocalBindUnlink=yes` fixes it (verified: forward re-established
  over the stale file, 10/10 requests OK). For a `-R` forward the
  equivalent knob is `StreamLocalBindUnlink` in the **server's**
  `sshd_config` — unverified here, no second host was available.
- If the *remote* socket path is wrong, the local connect succeeds and the
  channel then dies: the bridge sees `EPIPE` / "closed before a response
  arrived". Distinguishable from a dead tunnel only by the error text.

## Decision

Confirm ADR-0001's transport unchanged and make the operator path real:
remote hosts are reached by an **operator-managed persistent SSH forward
that lands a Unix socket file on the bridge host**. The bridge does not
spawn, supervise, or know about `ssh`. `HostConfig` stays
`{ name, socket }` — a remote host is a local socket path like any other.

The work is documentation and ergonomics, not transport:

- Ship a committed `kanhrd.config.example.yaml` with a local host and a
  commented remote host.
- Add an OPERATING.md recipe for the forward direction (laptop bridge →
  `alpaca01`), the mirror of the existing §3 reverse recipe, including
  `StreamLocalBindUnlink=yes` and a keepalive supervisor
  (`autossh`/systemd user unit on Linux, `launchd` KeepAlive on macOS).
- Fix the `socket_path` → `socket` drift in `docs/OPERATING.md` and
  `docs/CONTEXT.md`.
- Surface the "how to add a host" snippet from a route the operator can
  actually reach — `/settings` under the existing read-only hosts section —
  instead of only from a board empty state that a bridge with the default
  `local` host can never enter.

Adding a host stays a config-file operation. The SPA reads hosts; it does
not write them.

Optionally (a separate, later decision, not decided here): the bridge may
grow a *diagnostic* distinction between "socket file missing", "connection
refused" (tunnel down) and "channel closed before response" (tunnel up,
remote path wrong), surfaced through the existing `last_error` string. No
wire-shape change; it only makes the three SSH failure modes tellable
apart on the board.

## Alternatives considered

- **A. Operator-managed persistent `ssh -L` forward** — chosen. Zero
  bridge code, sub-millisecond per-request overhead on top of network RTT,
  survives close-per-request, carries the subscription on the same tunnel,
  and fails into the reconnect/`last_error` path the bridge already has.
  Cost: a moving part outside kanhrd (already accepted in ADR-0001), and a
  stale-socket footgun that `StreamLocalBindUnlink=yes` disarms.
- **B. Spawn `ssh host socat - UNIX-CONNECT:…` per request** — rejected on
  measurement. ~200ms per request bare, ~30ms with `ControlMaster`, both
  against a **150ms** `pane.read` poll interval and a per-open-terminal
  multiplier. The bare form cannot keep up with a single terminal; even
  the multiplexed form spends a whole process spawn per poll. It also puts
  `ssh` process lifecycle, zombie reaping, and per-request auth failure
  handling inside the bridge — the exact ownership ADR-0001 pushed out.
- **C. Bridge owns the SSH connection (a Node SSH library, or bridge-spawned
  `ssh` supervised as a child process)** — rejected for now. It buys real
  ergonomics (a remote host becomes one config entry, no external unit to
  install) but it moves credential handling into a process ADR-0003 built
  specifically to own no credentials: the bridge would need key paths,
  passphrase or agent-socket access, and `known_hosts` policy. A
  compromised bridge already means shell access on every configured host;
  giving it the keys as well widens that from "the sockets it can reach"
  to "anything those keys open." Revisit if operator complaints about
  tunnel upkeep outweigh that — ADR-0001 already names this as its own
  revisit trigger.
- **D. Bridge-per-host, co-located behind oauth2-proxy + tailscale
  (the user's Option B)** — rejected as the *primary* answer, and it is
  worth being precise about why, because the repo can almost do it today.
  `deploy/oauth/` (compose overlay, `nginx.conf`, `oauth2-proxy.cfg`) and
  `docs/how-to/oauth-proxy.md` already deploy a bridge behind an
  authenticating proxy; `make run-tailscale-serve` already fronts a
  loopback bridge with Tailscale HTTPS. What is missing is not deployment
  — it is the board. kanhrd's stated purpose is *one* kanban across every
  host. N co-located bridges means N origins, N proxy configs, N places
  auth can be misconfigured, and either N browser tabs or a client that
  federates. That is ADR-0001's alternative A, rejected then for the same
  reason, and nothing in the repo has changed to reopen it. It remains the
  right shape for a *different* goal: alpaca01 having its own board that
  someone else can reach without a tunnel to the operator's laptop.
- **E. Bridge-to-bridge federation** — named for the record, rejected.
  A hub bridge that speaks kanhrd's own HTTP+WS to remote bridges instead
  of speaking herdr's socket. It solves the "one board over N co-located
  bridges" problem D creates, and rides over Tailscale/oauth2-proxy
  without SSH. But it requires the bridge to become a client of itself:
  proxying events, forwarding subscriptions, holding delegated-auth
  credentials for each downstream (which ADR-0003 forbids), and versioning
  a bridge↔bridge contract alongside the existing browser↔bridge one. That
  is a large amount of new surface to avoid running `ssh`.

## Consequences

- **The user's lean toward Option A is supported by the evidence.**
  Not weakly: A costs no bridge code and 0.7ms of transport overhead,
  B/D cost a rejected board topology, and the per-request alternatives are
  slower than the poll interval they would serve. The one honest caveat is
  that A means the laptop bridge is dark when the laptop is closed — if
  the operator wants the board reachable 24/7, the answer is not Option B,
  it is ADR-0001's cloud hub plus OPERATING.md §3's *reverse* tunnel, with
  `alpaca01` as the hub instead of a cloud VM. Same decision, different
  placement.
- Remote-host support ships as docs plus one example file plus a settings
  snippet. No `HostConfig` change, no schema change, no new bridge code
  paths, and no new tests beyond whatever the settings snippet needs.
- Every remote host depends on a supervisor process kanhrd does not own.
  When it dies the host goes grey with a `last_error` and nothing else
  breaks — the failure is per-host and already handled.
- The three SSH failure modes (`ENOENT` no socket file, `ECONNREFUSED`
  tunnel down, `EPIPE` wrong remote path) currently all read as a generic
  error string. Until the optional diagnostic above is built, "why is
  alpaca01 grey" is answered by looking at the tunnel, not the board.
- Anything that needs a bridge on `alpaca01` itself — a second operator, a
  board that outlives the laptop's uptime — is served by the existing
  `deploy/oauth/` and Tailscale recipes as a *second* deployment, not as a
  replacement for the hub. That path is already documented and needs no
  new decision.
- Revisit when tunnel upkeep becomes a recurring support burden across
  more than one operator, or if a herdr release ever exposes a native
  authenticated network listener for its JSON API — that would obsolete
  the tunnel entirely and reopen alternative C on much better terms.
