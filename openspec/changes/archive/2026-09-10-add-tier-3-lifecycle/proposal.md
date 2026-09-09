## Why

Tier-1 kanban shows every pane across every host; tier-2 lets a user open
and interact with one pane's terminal from the browser. Both are still
read-and-poke: to actually spin up a new agent pane, split an existing one
for a side task, or clean up a finished tab/workspace, a user still has to
attach to the herdr host and drive the TUI directly. Pane/tab/workspace
lifecycle is the natural next capability — it turns kanhrd from a viewer
into something that can actually manage a fleet of agent panes.

## What Changes

- Extend the browser ↔ bridge `BridgeMethod`/`EventKind` unions (same
  envelope as tier-1/tier-2, no new frame shapes) with ten lifecycle
  methods: `pane.split`, `pane.close`, `pane.move`, `tab.create`,
  `tab.rename`, `tab.close`, `tab.move`, `workspace.create`,
  `workspace.rename`, `workspace.close`.
- Extend `BridgeEventPayload` with eight herdr-native lifecycle events
  (`workspace.created/closed/renamed`, `tab.created/closed/renamed/moved`,
  `pane.moved`) — all of these map directly onto existing herdr
  `Subscription`/`EventKind` variants, so unlike tier-2's `pane.output`
  (which had to be invented via bridge-side polling because herdr has no
  push event for pane content), no synthesis is needed here.
- Extend `BridgeCapabilities` with five independent tier-3 booleans
  (`paneCreate`, `paneClose`, `paneMove`, `tabCrud`, `workspaceCrud`) so a
  bridge can implement partial tier-3 support honestly, same pattern as
  tier-2's `paneResize`/`paneGraphics`.
- Publish the extended contract as TypeScript types in
  `packages/schema/src/{wire,herdr}.ts` (tier-1/tier-2 types unchanged) so
  L2C (bridge) and L3C (web) build against the same shapes, and document
  every herdr protocol quirk found while mirroring the real source: no
  `pane.kill` (only `pane.close`), `SplitDirection` has only two variants
  (`right`/`down`, not four), `pane.move` reparents while `tab.move`/
  `workspace.move` merely reorder, `workspace.close`'s `close_group` flag
  means "confirm closing a linked-worktree group" not "confirm destructive
  op" generically, herdr does not reject closing the last remaining
  workspace, and cascading closes (pane closes its last-pane tab closes its
  last-tab workspace) are event-lossy — only the directly-closed resource's
  event plus the top-most cascaded `workspace.closed` fire, not one event
  per implicitly-destroyed child.

## Capabilities

### New Capabilities
- `tier-3-lifecycle`: browser-driven pane split/close/move and tab/workspace
  create/rename/close, reachable from the tier-1 kanban board and tier-2
  terminal detail view. Independently gated per operation group
  (`paneCreate`/`paneClose`/`paneMove`/`tabCrud`/`workspaceCrud`) so a
  bridge can ship partial support.

### Modified Capabilities
- `tier-1-kanban`: unchanged. `pane.list`/`events.subscribe` keep their
  exact tier-1 shapes.
- `tier-2-terminal`: unchanged. `pane.read`/`pane.subscribe_output`/
  `pane.send_keys`/`pane.send_text`/`pane.resize`/`pane.graphics.*` keep
  their exact tier-2 shapes.

## Out of Scope

- Tier-4: pane layout export/apply/set-split-ratio, plugin actions,
  integrations, notifications, command palette.
- Workspace/tab reordering (`workspace.move`/`workspace.move_block`) — herdr
  has the primitive (same shape as `tab.move`), but it's a board-layout
  concern, not lifecycle CRUD; left out of this change, trivially additive
  later since it needs no breaking change.
- `pane.swap` (position swap between two panes) — not a create/close/move
  lifecycle operation.
- Implementing the bridge (`apps/bridge/**`) or web lifecycle UI
  (`apps/web/**`) themselves — later lanes (L2C, L3C) fan out from this
  frozen contract.
- UI-level guardrails (confirm-before-destroy, block closing the last
  workspace, linked-worktree-group close warnings) — product/UX decisions
  for L3C to implement client-side; the wire contract intentionally does
  what herdr does and no more (see `tmp/foreman/CONTRACT-TIER3.md` section 6).

## Impact

- Affected code: `packages/schema/src/wire.ts`, `packages/schema/src/herdr.ts`
  (extended, this change). `apps/bridge/**` and `apps/web/**` are
  downstream consumers, implemented in later lanes — not touched here.
- Affected systems: herdr's JSON API over `~/.config/herdr/herdr.sock`
  (read-only dependency) — ten additional forwarded methods and eight
  additional forwarded (not polled) subscriptions per host connection, on
  top of tier-1/tier-2's existing surface.
- Bridge-side cache impact: the tier-1 workspace/tab name cache (built from
  `workspace.list`/`tab.list`) needs live invalidation on the new
  `*.renamed`/`*.created`/`*.closed`/`pane.moved` events — see
  `tmp/foreman/CONTRACT-TIER3.md` section 6 for the exact update rules per
  event. This closes a gap LC2 flagged and accepted for tier-1/tier-2.
- No breaking changes to tier-1 or tier-2 — this change only adds new union
  members and new fields; every prior request/response/event shape is
  untouched.
