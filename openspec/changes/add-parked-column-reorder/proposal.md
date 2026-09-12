## Why

A parked column's position is the operator's opinion, and today it is
frozen at creation time: `ParkedColumn.order` is written once by
`createColumn` (append at the right-hand end) and never again. A column
created in the wrong place stays there until it is removed and rebuilt,
which loses its membership with it.

Reordering was cut from `add-parked-columns` § 5.3 for one reason, and it
was the right one. A drag-only reorder is a pointer-only affordance:
`docs/UX-GUIDELINES.md` is keyboard-first and refuses hover- or
pointer-only paths, so the drag could not ship without a keyboard
equivalent, and the keyboard equivalent had no approved copy. It has copy
now — `docs/BRAND.md` carries `park.moveColumnLeft` = `move column left`
and `park.moveColumnRight` = `move column right` — so the keyboard path
is buildable, and the drag becomes legal because it is no longer the only
way to do it.

`order` is already the render order everywhere (`ParkedStore.columns`
sorts by it; `boardColumnRefs` appends the sorted list after `unknown`;
every swimlane band renders the same list), so nothing that ships today
needs changing to make a reorder visible.

## What Changes

### One store operation over the existing field

`ParkedStore.moveColumn(id, delta)` lifts the column out of the sorted
order and re-inserts it `delta` places away, clamped to the ends, then
renumbers `order` as a dense `0..n-1` sequence. Moving the leftmost
column left is a **no-op, not an error** — the same shape `park()`
already has for an unknown column id. No new storage key, no schema
version bump: the document already carries `order`.

Two pure helpers ride with it, because the view needs the same
arithmetic in three places (the two menu items, and a drop):

- `reorderDelta(order, id, neighbourId)` — the delta that lands `id`
  where `neighbourId` is now.
- `visibleNeighbour(order, hiddenKeys, id, direction)` — the next parked
  column in that direction that the filter bar has **not** hidden, or
  `null` when there is none.

Hidden columns are skipped rather than counted: commit `2ecdf61` made
the filter chips per-column, so a `move column right` that swapped with
a hidden neighbour would look like a control that did nothing. Nothing
about a hidden column's key (`parked:<id>`) or its chip changes — the key
is the id, and the id never moves.

### The keyboard path: two header-menu items

A parked column's overflow menu gains `move column left` and `move
column right`, beside rename, the exit rules and remove. They are
`role="menuitem"`, they carry `LucideArrowLeft` / `LucideArrowRight` from
the pinned icon set (no twenty-first icon), and each is `disabled` with
`aria-disabled` when there is no visible column in that direction —
visible and honest rather than absent or silently inert.

The menu items work at **every** width, including below
`--breakpoint-mobile` where the drag deliberately does not exist.

### The drag path: one horizontal list per strip

The column strip becomes a horizontal `cdkDropList` whose items are the
`app-column` elements, with the column **header** as `cdkDragHandle`:

- Only a parked column is a drag source. A status column's `cdkDrag` is
  disabled and its header carries **no handle directive at all** — the
  header is rendered by a different branch of the template, so there is
  no `cdk-drag-handle` class, no grab cursor and no handle on a status
  column, in either kind of board.
- A status column is never a reorder **target** either: the list's
  `cdkDropListSortPredicate` refuses every index left of the first
  parked column, so a dragged column cannot be sorted into the status
  run and the status columns' positions are fixed.
- Nothing below `--breakpoint-mobile`, and nothing with fewer than two
  parked columns: `canReorderColumns(count, mobile)` is a pure predicate
  in the shape `canDrag` already has, because karma's viewport is
  permanently below the breakpoint and the enabled half can only be
  proven as arithmetic.
- A drag in any band reorders the board's columns, because there is one
  `order` and every band renders it.

### How column reorder and card drag stay out of each other's way

Two CDK drop lists now overlap the same strip, and the hazard is that
they connect. They do not, and the shape below is what prevents it:

- The **card** lists stay exactly where they are: one `cdkDropList` per
  `.column-body`, all joined by the `cdkDropListGroup` on the strip. That
  wiring is untouched — the group directive keeps its element, so cards
  keep moving between columns and into parked columns unchanged.
- The **column** list is mounted one element up (`.board-region`, and a
  band's own `<section class="swimlane">`) with
  `cdkDropListElementContainer` pointing at the strip, so the strip
  element itself is not a drop list and the group on it keeps its
  meaning. `CdkDropList` injects its group with `skipSelf`, and provides
  `CDK_DROP_LIST_GROUP: undefined` on its own element; putting both
  directives on one element would have made "which group does a column
  body see" depend on directive order.
- Neither list is in the other's group and neither names the other in
  `cdkDropListConnectedTo`, so a card can never be dropped into the
  column list and a column can never be dropped into a card list — CDK
  only considers connected siblings.
- Belt and braces, because the cost is one predicate: a parked column's
  card `enterPredicate` now requires the dragged item to actually carry a
  pane (`cdkDragData` with a `host` and an `id`), rather than accepting
  any foreign item.
- A card's `cdkDrag` is nested inside a column's `cdkDrag`. The CDK stops
  propagation for a nested drag, and the column drags only from its
  handle, so a pointer press on a card starts the card's drag and never
  the column's.

## Impact

- **Affected specs:**
  - `board-parked-columns` — MODIFIED "A parked card leaves its status
    column" (the order is now the operator's, and changing it is
    browser-local), MODIFIED "Parked-column controls are visible and
    keyboard-operable" (the two menu items join the header menu),
    MODIFIED "No drag affordance ships until the design docs permit one"
    (its scenario is carried forward with the board it still describes —
    one with no user-defined column; the parked-column case moves to the
    new requirement, which is not silent: the old scenario's `WHEN`
    changes from "with parked columns present" to "with no user-defined
    column", which is what E2E assertion 22 actually exercises), and
    ADDED "Parked columns are reorderable by keyboard and by drag".
- **Affected code:**
  - `apps/web/src/app/state/parked.store.ts` (+ spec)
  - `apps/web/src/app/board/column.{ts,html,scss}` (+ spec)
  - `apps/web/src/app/board/board.{ts,html}` (+ spec)
  - `apps/web/src/app/board/swimlane.{ts,html}` (+ spec)
  - `apps/web/src/app/shared/copy.ts` — the two `park.*` rows only
- **No change to:** `packages/schema/**`, `apps/bridge/**`, any wire
  method, event kind or capability flag, the `kanhrd.parked-columns` key
  or its `version: 1`, `STATUS_COLUMN_ORDER`, and the card-drag wiring
  (`cdkDropListGroup`, the per-column `.column-body` lists, `canDrag`).
- **Docs a maintainer still owns:** `docs/UX-GUIDELINES.md` describes the
  Q1 card drag but says nothing about reordering the board's own
  furniture, and its "does not reorder columns" line is about paging and
  status columns. A line permitting a parked-column reorder — drag from
  the header plus the keyboard equivalent, status columns fixed — belongs
  there and in `docs/DESIGN-SYSTEM.md` beside the grab-cursor rule. This
  change does not write docs.
- **Risk:** low and browser-local. The reversible half is the drag; the
  keyboard path is a menu item over the same one store call.
