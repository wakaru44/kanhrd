## Context

See proposal.md - Why. Tier-1 froze a kanban board contract; this change
freezes the next contract in the same style (text-derived from herdr's real
source, before any bridge/web implementation exists to validate it
against). herdr exposes ~120 JSON-RPC-style methods over its per-host
socket; tier-2 needs exactly six of them (`pane.read`, `pane.send_text`,
`pane.send_keys`, plus the three graphics/resize methods that turned out
not to fit), and invents one new bridge-only method (`bridge.capabilities`)
plus one bridge-only push event (`pane.output`) that have no herdr
counterpart at all.

## Goals / Non-Goals

**Goals:**
- Freeze a wire shape L2B (bridge) and L3B (web) can build against in
  parallel without a running bridge to test against yet, same as tier-1.
- Surface the two real herdr-schema mismatches found while reading source
  (no output-push event; `pane.graphics.*` is a write path) as documented,
  reasoned design decisions instead of leaving L2B to discover them
  mid-implementation and improvise incompatible fixes.
- Keep tier-1 fully working against a tier-2 bridge and vice versa.

**Non-Goals:**
- Implementing the bridge or the web terminal UI (later lanes).
- Solving graphics capture or PTY resize — both need a herdr-side API
  addition that doesn't exist; flagged as out of scope, not solved here.
- Byte-perfect terminal streaming (a raw PTY tap). herdr's public API
  exposes rendered snapshots, not raw bytes; this change treats that as a
  given constraint, not something to work around with a parallel raw
  transport.

## Decisions

**Live output is polling, pushed as full snapshots, not incremental
chunks.** herdr has no publicly-subscribable "pane output changed" event
(`EventKind::PaneOutputChanged` exists but has no matching `Subscription`
variant — see `CONTRACT-TIER2.md` section 5.1 for the exact source lines).
The nearest public primitive, `Subscription::PaneOutputMatched`, is a
one-shot pattern-match trigger, not a continuous stream. Alternative
considered: build the bridge on top of `PaneOutputMatched` with a
match-everything pattern to approximate push semantics — rejected because
its semantics (fires once per matching line, is designed around
`herdr agent wait`-style automation waits) don't map cleanly onto "keep
this xterm.js view current," and it would need its own timeout/retry
dance per subscription that plain polling doesn't. Alternative considered:
expose a raw incremental `chunk` field as the brief sketched — rejected
because herdr's `pane.read` returns a libghostty-vt-rendered text/ANSI
snapshot, not raw PTY bytes, so there is no true byte delta to forward
without the bridge re-implementing terminal parsing itself. Polling
`pane.read` per subscribed pane, deduping on herdr's own monotonic
`revision`, and pushing full snapshots is the simplest thing that is both
correct and buildable without new herdr capability.

**`pane.graphics.*` is scoped down to an optional overlay-viewer feature,
not agent-graphics capture.** Reading `pane_graphics_stream.rs` end to end
shows the public `pane.graphics.stream` method is a client → herdr PUSH (a
caller streams `{FrameHeader}\n{binary body}` frames INTO a pane's overlay
layer); `pane.graphics.info` reports capability/config metadata (cell
pixel size, format/size limits), not a list of currently-drawn content or
a way to read out an agent's own kitty-graphics/sixel escapes. Alternative
considered: quietly ship `pane.graphics.stream` as if it were the read path
the brief assumed and let L2B discover the mismatch — rejected, that
wastes an entire lane's implementation cycle on a feature that cannot do
what the product goal needs. Alternative considered: drop `pane.graphics.*`
from the wire contract entirely — rejected, the write-path capability is
real and usable for a smaller feature (viewing bridge/plugin-pushed
overlay images), so the types are kept but explicitly marked optional and
re-scoped, with `bridge.capabilities.paneGraphics` as the feature flag.

**`pane.resize` is defined in the wire contract but designed to always
reject.** herdr's `Method::PaneResize` is split-pane geometry resize
(direction + amount, like a `tmux resize-pane`), not PTY dimension
control, and `PaneInfo` carries no cols/rows fields at all — there is no
public herdr primitive an external client can use to set a pane's terminal
size. Alternative considered: omit `pane.resize` from the tier-2 union
entirely until herdr adds the primitive — rejected in favor of keeping the
shape (so L3B can compile a resize handler now and the wire doesn't need a
breaking follow-up change later) while making the "always rejected today"
behavior explicit in both `wire.ts`'s doc comments and
`bridge.capabilities.paneResize` (always `false`).

**`bridge.capabilities` is the tier-negotiation method, checked by error
presence rather than a version number comparison.** A tier-1 bridge simply
doesn't implement the method; a tier-2 SPA calling it against a tier-1
bridge gets an ordinary `WsResponseError`, which the client treats as "no
tier-2 support" without inspecting the specific error code. Alternative
considered: a `protocol_version` field on every response/event frame (like
herdr's own `PROTOCOL_VERSION` wire-compat pattern) — rejected as
premature for a two-tier system with only one prior tier; revisit if a
third tier needs finer-grained negotiation than "does this method exist."

**Every new method keeps `host` on the envelope only, never duplicated
into `params`.** Matches the tier-1 precedent (`pane.list` has no `host`
field in its own params) and avoids two sources of truth for which host a
request concerns. The original tier-2 brief's per-method sketches
(`{ pane_id, host, ... }`) are folded accordingly — noted as a deviation in
`CONTRACT-TIER2.md` section 2, not a silent divergence.

## Risks / Trade-offs

- [Polling means "live" is bounded by `outputPollIntervalMs`, not truly
  push-driven] → a fast-scrolling pane (e.g. a build log) can visibly lag
  or skip intermediate states between polls, since `pane.output` only ever
  carries the latest full snapshot. Mitigation: documented explicitly in
  `CONTRACT-TIER2.md` section 6 so L3B builds staleness-aware UI instead of
  assuming frame-perfect delivery; revisit polling cadence or a smarter
  primitive (e.g. lobbying for a real herdr push event) if UAT shows this
  is actually a problem for typical agent output volume.
- [`pane.graphics.*` ships as a defined-but-inert-by-default optional
  capability] → risk that L2B either burns time implementing an overlay
  viewer nobody asked for, or the unused surface bit-rots. Mitigation:
  `CONTRACT-TIER2.md` section 6 explicitly tells L2B/L3B not to spend time
  on it until `paneGraphics` is a real product requirement from Can;
  `bridge.capabilities` makes "not implemented" a first-class, checkable
  state rather than an error surprise.
- [No running bridge or web app yet to validate this contract against,
  same structural risk tier-1 accepted] → bounded the same way: this is a
  text-derived contract by design (freeze before fan-out). L2B should raise
  a follow-up contract change immediately if implementation reveals a wrong
  assumption rather than silently drifting from `wire.ts`/`herdr.ts`.

## Migration Plan

Additive only. No tier-1 method, param, result, or event shape changes;
existing tier-1 bridge and web code (once built) requires no changes to
keep working. A tier-2 bridge is a strict superset of a tier-1 bridge's
method surface.
