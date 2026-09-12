# Tasks — add-parked-column-reorder

## 1. Copy

- [x] 1.1 Add `park.moveColumnLeft` = `move column left` and
      `park.moveColumnRight` = `move column right` to
      `shared/copy.ts`, verbatim from `docs/BRAND.md` § copy table.
- [x] 1.2 Keep both lowercase, exclamation-free and in herdr's
      vocabulary (`copy.spec.ts` enforces all three).

## 2. The store operation

- [x] 2.1 `ParkedStore.moveColumn(id, delta)` — re-insert the column
      `delta` places away in the sorted order, clamped at both ends, and
      renumber `order` densely (`0..n-1`).
- [x] 2.2 An unknown id, a `delta` of `0`, and a move that clamps to the
      position the column already holds are all no-ops that write no new
      state — never a thrown error.
- [x] 2.3 Membership is untouched: a reorder moves columns, not cards,
      and a hidden column's key (`parked:<id>`) is unchanged.
- [x] 2.4 Pure helpers beside it, so the view arithmetic is testable
      without a board: `reorderDelta(order, id, neighbourId)` and
      `visibleNeighbour(order, hiddenKeys, id, direction)`.
- [x] 2.5 Specs in `parked.store.spec.ts`: both directions, both
      clamps, persistence of the new order across a reload, hidden
      neighbours skipped, and an unknown id ignored.

## 3. The keyboard path

- [x] 3.1 Two `role="menuitem"` items in a parked column's header menu,
      `move column left` and `move column right`, with `LucideArrowLeft`
      / `LucideArrowRight` from `shared/icons.ts`.
- [x] 3.2 Each item is `disabled` + `aria-disabled` when there is no
      visible parked column in that direction; the enabled item moves
      past hidden columns rather than swapping with them.
- [x] 3.3 Choosing an item closes the menu and returns focus to the
      trigger, the contract the rename and rule items already keep.
- [x] 3.4 The items are present at every width, including below
      `--breakpoint-mobile` where the drag does not exist.
- [x] 3.5 Specs in `column.spec.ts`: both items move the column, the end
      items are disabled, focus returns to the trigger, and a status
      column's menu does not exist to carry them.

## 4. The drag path

- [x] 4.1 `canReorderColumns(parkedCount, mobile)` — pure, in the shape
      `canDrag` already has: at least two parked columns, and not below
      `--breakpoint-mobile`.
- [x] 4.2 The column strip's reorder `cdkDropList` is mounted on the
      strip's parent (`.board-region`, and a band's own `section`) with
      `cdkDropListElementContainer` naming the strip, so the
      `cdkDropListGroup` that connects the card lists keeps its element
      and its meaning.
- [x] 4.3 `cdkDropListOrientation="horizontal"`, and
      `cdkDropListSortPredicate` refusing every index left of the first
      parked column, so a status column is never a reorder target.
- [x] 4.4 `app-column` is a `cdkDrag` whose data is its `BoardColumnRef`,
      disabled unless the column is parked and `canReorderColumns` holds.
- [x] 4.5 A parked column's header is the `cdkDragHandle`; a status
      column's header is rendered by the other branch of the template and
      carries no handle directive at all.
- [x] 4.6 `columnReorderDelta(refs, order, previousIndex, currentIndex)`
      maps a drop on the VISIBLE strip onto a delta in the full parked
      order, so a hidden column between two visible ones cannot corrupt
      the move.
- [x] 4.7 A parked column's card `enterPredicate` requires a pane in
      `cdkDragData`, so a column drag can never be parked as a card.
- [x] 4.8 Grab cursor only on an enabled handle
      (`.cdk-drag:not(.cdk-drag-disabled)`), and a drop affordance only
      on the receiving strip — the same `cdk-*` markers the card drag
      already keys off.
- [x] 4.9 Specs: the predicate as arithmetic, the sort predicate's
      refusal, the delta mapping over a hidden column, a status column
      with no handle and an inert `cdkDrag`, and both strips (board and
      band) carrying the list. NOT proven by an automated test: a real
      pointer drag end to end — karma's viewport is permanently below
      `--breakpoint-mobile`, where the drag deliberately does not exist,
      and `apps/web/e2e/**` belongs to another lane. The drop HANDLER is
      exercised directly in `board.spec.ts` instead.

## 5. Proving the two drags do not fight

- [x] 5.1 `board.spec.ts` keeps its `cdkDropListGroup` assertion on both
      strips, and gains one that the reorder list is neither in that
      group nor connected to any `.column-body` list.
- [x] 5.2 The card-drag specs in `column.spec.ts` and `board.spec.ts`
      keep passing unchanged in substance (`enterPredicate` gains the
      pane requirement, which is a tightening, not a rewrite).
- [x] 5.3 With no parked column, every list and every drag is still
      inert — the board-level assertion E2E 22 mirrors.

## 6. Verify

- [x] 6.1 `pnpm --filter @kanhrd/web test` — count up, never down.
- [x] 6.2 `pnpm -w typecheck`.
- [x] 6.3 `pre-commit run --all-files`.
- [x] 6.4 `openspec validate add-parked-column-reorder --strict`.

## 7. Deliberately not in this change

- [x] 7.1 No reordering of status columns: their order is
      `STATUS_COLUMN_ORDER` and their membership is herdr's fact.
- [x] 7.2 No cross-band column drag, and no per-band column order —
      there is one `order` for the board.
- [x] 7.3 No drag below `--breakpoint-mobile`; the pager owns that
      gesture and the menu items cover the width.
- [x] 7.4 No docs edits: `docs/UX-GUIDELINES.md` and
      `docs/DESIGN-SYSTEM.md` need a line about this drag, and a
      maintainer writes it.
