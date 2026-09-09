## Context

See proposal.md - Why. Tier-1 and tier-2 each froze a contract before any
implementation existed to validate it against; this change does the same
for lifecycle. herdr exposes ten `Method` variants that map cleanly onto
"create/split/close panes, create/rename/delete tabs and workspaces," and —
unlike tier-2, which had to invent `pane.output`/`bridge.capabilities`
because herdr had no matching primitive — every tier-3 event the browser
needs already exists as a subscribable herdr `EventKind`. The work here is
almost entirely faithful mirroring plus documenting where herdr's real
semantics (cascading closes, worktree-group close confirmation, the
`pane.move` vs `tab.move` naming trap) diverge from what a wire-contract
author might guess from the method names alone.

## Goals / Non-Goals

**Goals:**
- Freeze a wire shape L2C (bridge) and L3C (web) can build against in
  parallel without a running bridge, same discipline as tier-1/tier-2.
- Surface every found herdr-schema surprise as a documented, reasoned
  decision instead of leaving L2C to discover it mid-implementation:
  `SplitDirection` has two variants not four; there is no `pane.kill`;
  `close_group` is worktree-specific, not a generic confirm flag; cascading
  closes are event-lossy; herdr allows closing the last workspace.
- Keep tier-1 and tier-2 fully working against a tier-3 bridge, and a
  tier-1/tier-2-only SPA fully working against a tier-3 bridge.
- Close the tier-1 cache-invalidation gap LC2 flagged (workspace/tab name
  cache never learned about renames) by having the bridge consume the new
  rename events it now subscribes to anyway.

**Non-Goals:**
- Implementing the bridge or the lifecycle web UI (later lanes).
- Solving workspace/tab reordering (`workspace.move`) — real herdr
  primitive, deliberately out of scope this tier; see proposal.md.
- Inventing UI confirmation flows — those are L3C's job client-side, not a
  wire-contract concern (see CONTRACT-TIER3.md section 6).

## Decisions

**`pane.move` gets its own result/event shape; it is not folded into
`tab.move`/`workspace.move`'s reorder shape.** Reading `PaneMoveResult`
(`panes.rs:618-638`) shows reparenting a pane can itself create or close a
tab/workspace as a side effect (`created_workspace`/`created_tab`/
`closed_workspace_id`/`closed_tab_id`), which `tab.move`/`workspace.move`
(plain `insert_index` reorders) never do. Alternative considered: give all
three "move" methods a uniform minimal shape for API symmetry — rejected,
it would either lose the cascading-side-effect fields `pane.move` actually
needs, or force `tab.move`/`workspace.move` to carry meaningless empty
optional fields. The types stay honest to what each operation actually
does; the shared name is a herdr-naming coincidence, not a shared
contract shape, and CONTRACT-TIER3.md section 5.1 flags this explicitly so
L2C/L3C don't assume symmetry that isn't there.

**Cascading-close event loss is documented as a client-side responsibility,
not patched at the wire level.** Verified against the actual close handler
code (not just the schema) that closing a pane/tab whose closure cascades
to closing its parent tab/workspace does NOT emit one event per
implicitly-destroyed resource — only the directly-closed resource's event
plus the top-most `workspace.closed`. Alternative considered: have the
bridge synthesize the missing intermediate `tab.closed`/`pane.closed`
events itself, computing which panes/tabs were nested under the closed
resource before forwarding herdr's real events — rejected for this change:
it would require the bridge to maintain a full pane/tab/workspace tree
mirror just to backfill events herdr itself doesn't consider worth
emitting, adding real complexity for a case the client can handle equally
correctly by locally purging cached children of whatever it purges. Revisit
only if L3C's live-board UX turns out to need per-resource close events for
something the "purge children of what actually closed" approach can't do
(e.g. per-pane close animations) — noted as a risk below, not solved here.

**`workspace.close`'s `close_group` is exposed verbatim, not renamed or
generalized into a UI-facing "confirm" boolean.** It has one narrow,
worktree-specific meaning (`workspace_group_close_required` gate,
`app/api/workspaces.rs:311-329`) that doesn't generalize to "user confirmed
this destructive action" — conflating the two would make the wire type lie
about what the flag does. Alternative considered: bridge-side, translate a
generic `confirmed: boolean` from the browser into `close_group` — rejected,
because `close_group: true` on a workspace with NO linked-worktree siblings
is simply a no-op, not "the user confirmed," and a generic confirm flag
would incorrectly suggest the bridge can gate arbitrary destructive-op
confirmation through this one field. The wire type is exactly herdr's
`WorkspaceCloseParams`; UI-level confirmation is a separate, client-only
concern per CONTRACT-TIER3.md section 6.

**No bridge-invented events or synthesized capabilities this tier.** Every
tier-3 event maps onto a real, publicly-subscribable herdr `EventKind`
(confirmed against `Subscription` dispatch arms in `subscriptions.rs`), so
there is no tier-2-style "polling because herdr can't push this" situation
to design around. `bridge.capabilities` gains five new booleans following
the exact tier-2 precedent (`paneResize`/`paneGraphics`: independently
checkable, default-safe when absent) rather than a new negotiation
mechanism.

## Risks / Trade-offs

- [Cascading-close event loss pushes tree-purge logic onto both L2C and
  L3C] → both the bridge's name-cache and the SPA's local pane/tab tree
  need "purge everything nested under whatever id actually closed" logic,
  duplicated in two places instead of centralized once in the bridge.
  Mitigation: CONTRACT-TIER3.md section 6 specifies the exact purge rule
  once so both lanes implement the same behavior; revisit centralizing it
  in the bridge (bridge computes and forwards synthesized child-close
  events) if duplication proves error-prone in practice.
- [`pane.move`'s result carries meaningfully different fields than
  `tab.move`/`workspace.move` despite the shared "move" name] → a lane
  skimming method names alone could assume symmetry and misuse the types.
  Mitigation: explicit doc comments on `HerdrPaneMoveDestination`/
  `HerdrTabMoveParams` in herdr.ts plus CONTRACT-TIER3.md section 5.1 call
  this out directly.
- [No running bridge or web app to validate this contract against yet,
  same structural risk tier-1/tier-2 accepted] → bounded the same way:
  text-derived contract by design, freeze-before-fan-out. L2C should raise
  a follow-up contract change immediately if implementation reveals a
  wrong assumption.

## Migration Plan

Additive only. No tier-1 or tier-2 method, param, result, or event shape
changes; existing tier-1/tier-2 bridge and web code (once built) requires
no changes to keep working. A tier-3 bridge is a strict superset of a
tier-2 bridge's method surface, which is itself a strict superset of
tier-1's.
