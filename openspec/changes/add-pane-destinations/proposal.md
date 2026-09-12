## Why

Every part of this is already implemented below the SPA. The board simply
does not use it.

**Creating a card ignores the destination it already knows.**
`Board.newPane()` (`board.ts:599`) calls `splitPane(host, { direction:
'right' })` — no `workspace_id`, no `target_pane_id`, no `cwd` — while the
wire's `pane.split` accepts all three (`wire.ts:182-190`). herdr therefore
splits whatever pane is focused in that host's focused workspace, and the
new card inherits that pane's `cwd`. `newTab()` sends `{}` though
`tab.create` takes a `workspace_id`. The host is not chosen either:
`primaryHost()` returns the FIRST host in config order with any create
capability, regardless of what the operator is looking at or filtering by.
On one host with one workspace this is invisible; with several it puts the
card somewhere else entirely. (A sibling session has this in
`openspec/incoming/backlog.md` as "New pane / tab / workspace land wherever
herdr focus happens to be"; this change is its resolution.)

**Moving a pane is fully wired and completely unreachable.** `pane.move`
exists end to end: herdr's `PaneMoveDestination` union is mirrored
verbatim (`herdr.ts:573-576` — into an existing tab with a split direction,
into a new tab, or into a new workspace), the bridge dispatches it
(`dispatch.ts:256`), `BridgeCapabilities.paneMove` gates it, and
`tier-3-lifecycle` specifies it including the cascade result
(`closed_tab_id` / `created_workspace`). The SPA calls it nowhere. That was
deliberate: `docs/UX-GUIDELINES.md` says relocating a pane between tabs or
workspaces "is a separate feature with its own destination, capability,
keyboard, error and reconciliation requirements; it is not part of this
redesign, and the UI must not hint that it exists." This change is that
separate feature.

**And the card's action row says what it does with icons alone.** Two
arrows (split right, split down), an X and a dots menu — four controls, no
labels, and the most consequential one is a bare X.

## What Changes

### A destination is chosen, never inherited from focus

One shared destination picker — host → workspace → tab — used by every
creation path:

- The board's `+` menu picks where the new card, tab or workspace goes,
  defaulting to the operator's current scope when the URL has one (the
  rail is already the navigator; the scope is already in the URL).
- A tab's overflow menu in the rail gains `new card in this tab`, which
  needs no picker at all: the destination is the row the menu belongs to.
  It sends `pane.split` with that tab's current pane as `target_pane_id`.
- With no scope and several candidate hosts, the picker asks rather than
  guessing. `primaryHost()`'s first-in-config-order fallback stops being
  the silent default.

### `move` becomes a real, visible operation

A card's move menu offers the three destinations herdr's union actually
has: another tab, a new tab, a new workspace. It calls `pane.move` and is
rendered only where `capabilities.paneMove` is true.

The move result is not a simple success: moving the last pane out of a tab
closes that tab, and possibly its workspace (`closed_tab_id`,
`closed_workspace_id`), and moving into a new tab/workspace creates one.
The board already purges cascaded children locally for `tab.closed` /
`workspace.closed`, so the move path SHALL route through the same purge
rather than growing a second reconciliation. A no-op move (herdr's
`reason: 'same_tab' | 'zoomed_tab'`) SHALL say so instead of looking like
it worked.

### The action row becomes move / split / rest / dots

Per the operator's design (2026-09-12):

| control | opens | contains |
| --- | --- | --- |
| move | a menu | move to tab…, new tab, new workspace, and park in… |
| split | a menu | split right, split down |
| rest | a confirm | the existing `let this one rest?` dialog |
| dots | the menu | every action above, with its label, plus rename |

`rest` is the word the product already uses for closing a pane
(`copy.confirm.closePaneAction`), so the row stops spelling the most
destructive action as an unlabelled X.

**Two decisions the maintainer owes, called out rather than assumed:**

1. **`move to column` is not a move.** The operator's sketch lists "move to
   column" beside tab and workspace. A status column is herdr's fact and is
   not settable by anything (`docs/UX-GUIDELINES.md`, "Status columns are
   read-only"); a parked column is browser-local membership that changes
   nothing on the host. So one menu would mix a herdr mutation with a local
   arrangement under one verb. This change proposes keeping `park in…`
   inside the move menu but under its own heading, so the boundary between
   "this changes herdr" and "this rearranges your board" stays visible. Say
   if you would rather they were separate menus.
2. **Splitting costs a click it did not before.** Split right is one press
   today and becomes two under this model. That is the stated design and
   the labels are worth it, but it is a real regression for the most
   frequent action — worth knowing before it ships.

## Impact

- **Affected specs:** `board-card-actions` (ADDED: the action row's four
  controls and what each opens; the move menu's contract), `tier-3-lifecycle`
  is UNCHANGED — the bridge already specifies everything needed.
  `l-brand-neo-shepherd-redesign` MODIFIED where it pins the card's inline
  actions.
- **Affected code:** `board/card.{ts,html,scss}`, `board/board.{ts,html}`,
  `rail/rail.{ts,html}`, a new shared destination picker, `state/panes.store.ts`
  (a `movePane` beside `splitPane`), `shared/copy.ts` + `docs/BRAND.md`.
- **No wire, schema or bridge change of any kind.** Every method and
  capability this needs already ships.
- **Docs a maintainer owes:** `docs/UX-GUIDELINES.md`'s "the UI must not
  hint that it exists" sentence about pane.move is retired by this change
  and has to be rewritten as the rules the move menu follows.
