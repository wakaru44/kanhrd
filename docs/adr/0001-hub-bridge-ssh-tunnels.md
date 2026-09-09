# ADR-0001: Hub bridge + SSH-forwarded sockets

Status: Accepted
Date: 2026-09-09

## Context

kanhrd's whole reason to exist is a single kanban board across every machine
a user runs herdr on (currently three: laptop plus two others). herdr itself
only speaks over a local Unix socket
(`$XDG_CONFIG_HOME/herdr/herdr.sock`, `src/api/mod.rs:98` in the herdr repo)
— there is no herdr-native network listener to point a browser at directly.
Something has to sit between N herdr sockets and one browser tab.

herdr does have its own remote transport, `remote-client-bridge`, used by
the TUI to reach remote hosts over SSH. But that transport speaks herdr's
private bincode TUI wire (`src/protocol/wire.rs`), gated by
`PROTOCOL_VERSION`, not the JSON API kanhrd needs. Building on it would
tie kanhrd's release cadence to herdr's internal wire protocol.

The bridge can be placed on the user's laptop (simplest, but dark whenever
the laptop is closed) or on an always-on cloud host (available 24/7, but
now needs a way to reach herdr sockets that only exist on other machines).

## Decision

One bridge process — placement-agnostic, it can run on a laptop or in the
cloud — exposes a single HTTP+WS endpoint to the browser. Each remote herdr
socket is made locally reachable to the bridge via a forward or reverse SSH
tunnel, so from the bridge's point of view every host is just "a local
Unix-socket path." The bridge has no knowledge of which tunnel direction is
in play. Tunnel lifecycle (starting, restarting, monitoring autossh/systemd)
lives entirely outside the bridge process.

## Alternatives considered

- **A. Bridge-per-host, multi-endpoint SPA** — rejected: three bridges means
  three endpoints to secure, three places auth can be misconfigured, and a
  browser that has to juggle N connections instead of one.
- **B. Hub bridge + SSH-forwarded sockets** — chosen.
- **C. Piggyback on herdr's own `remote-client-bridge`** — rejected: that
  transport speaks the private TUI bincode wire (`src/protocol/wire.rs`),
  not the JSON API, and would couple kanhrd to herdr's `PROTOCOL_VERSION`
  instead of its stable JSON socket contract.

## Consequences

- Single ingress to secure, one wire format inside the bridge (JSON socket
  in, WebSocket out), and a cloud-hosted bridge means the board is reachable
  even when the laptop is closed.
- The bridge is dark whenever the hub itself is down, and every non-local
  herdr host now depends on an SSH tunnel staying up outside kanhrd's
  control — an operational moving part the project doesn't own.
- Revisit if the operator ergonomics of setting up and maintaining tunnels
  (autossh/systemd units per host) becomes a recurring blocker for users.
