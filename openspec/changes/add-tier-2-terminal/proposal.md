## Why

Tier-1 kanhrd gives a unified board of every pane across every configured
herdr host, but the board is read-only status — to actually look at what an
agent is doing or nudge it, a user still has to attach to the right herdr
host and find the right pane manually. Clicking a card and getting a live
terminal right there, without leaving the browser, is the natural next
capability the kanban board exists to lead into.

## What Changes

- Extend the browser ↔ bridge `BridgeMethod`/`EventKind` unions (same
  envelope as tier-1, no new frame shapes) with a terminal detail-view
  surface: `pane.read` (one-shot content fetch), `pane.subscribe_output` /
  `pane.unsubscribe_output` (live content via bridge-side polling, pushed
  as `pane.output` events), `pane.send_keys` / `pane.send_text` (input),
  and `bridge.capabilities` (feature probe so a tier-1 SPA and a tier-2
  bridge — in either combination — degrade instead of breaking).
- Define `pane.resize` and `pane.graphics.info` / `pane.graphics.stream` /
  `pane.graphics_frame` as OPTIONAL capabilities in the wire shape.
  `pane.resize` is defined but always rejected in this tier — herdr has no
  public API to set a pane's PTY dimensions from an external client.
  `pane.graphics.*` turned out to be a write path for pushing overlay
  images onto a pane (used by plugins), not a way to capture an agent's own
  kitty-graphics/sixel output, so it does not deliver "view what the agent
  drew" and is scoped down to a smaller, clearly-optional graphics-overlay
  viewer instead.
- Publish the extended contract as TypeScript types in
  `packages/schema/src/{wire,herdr}.ts` (tier-1 types unchanged) so L2B
  (bridge) and L3B (web) build against the same shapes without drifting,
  and document every herdr-schema mismatch found while mirroring the real
  source (`pane.send_keys` takes `keys: string[]` not `string`;
  `pane.resize`/`pane.graphics.*` don't do what their names suggest for
  this use case).

## Capabilities

### New Capabilities
- `tier-2-terminal`: live, interactive xterm.js terminal for a single pane
  — one-shot and polled-live content, keyboard/paste input — reachable by
  clicking a tier-1 kanban card. Optional, separately-gated graphics
  overlay viewing and pane resize, both currently non-functional pending
  either herdr API additions (resize) or explicit product scoping
  (graphics-as-viewer rather than graphics-as-capture).

### Modified Capabilities
- `tier-1-kanban`: unchanged. The bridge envelope, `pane.list`, and
  `events.subscribe` keep their exact tier-1 shapes; a tier-1 SPA continues
  to work unmodified against a tier-2 bridge.

## Out of Scope

- Pane lifecycle CRUD (create/close/split/move panes, layout operations) —
  tier 3.
- Plugin actions, worktree/workspace management — tier 4+.
- Implementing the bridge (`apps/bridge/**`) or web terminal UI
  (`apps/web/**`) themselves — later lanes (L2B, L3B) fan out from this
  frozen contract.
- Actually capturing/replaying an agent's native kitty-graphics or sixel
  terminal output — no public herdr API exists for this today; would
  require a herdr-side change and a new contract revision, not something
  this bridge/schema change can deliver.
- True PTY resize from an external client — same as above, blocked on a
  herdr API that doesn't exist yet.

## Impact

- Affected code: `packages/schema/src/wire.ts`, `packages/schema/src/herdr.ts`
  (extended, this change). `apps/bridge/**` and `apps/web/**` are
  downstream consumers, implemented in later lanes — not touched here.
- Affected systems: herdr's JSON API over `~/.config/herdr/herdr.sock`
  (read-only dependency) — one additional per-pane polling loop per active
  `pane.subscribe_output`, on top of tier-1's existing per-host connection.
- No breaking changes to tier-1 — this change only adds new union members
  and new optional fields; every tier-1 request/response/event shape is
  untouched.
