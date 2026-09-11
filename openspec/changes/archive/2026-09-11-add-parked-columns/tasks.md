## 0. Gate — maintainer decisions

Answered 2026-09-10. See `proposal.md` § "Maintainer decisions —
resolved 2026-09-10" for the reasoning; do not re-ask.

- [x] 0.1 Q4 (copy): approved as proposed. The keys go straight into
      `shared/copy.ts`; a maintainer separately adds the rows to
      `docs/BRAND.md`'s approved-copy table, and `copy.ts` does not wait
      on it. **No component-local copy constant** — the `CARD_COPY`
      pending-copy precedent this change originally cited was removed in
      commit `f173992` ("give every user-facing string one home in
      copy.ts"). This change does **not** edit `docs/BRAND.md`
- [x] 0.2 Q3 (column-header overflow menu) and Q6 (mobile switcher
      widening from "one segment per status" to "one segment per
      column") confirmed
- [x] 0.3 Q2 (default exit rule is `agent-activity`) confirmed;
      revisited only after phase 6's spike
- [x] 0.4 Q1 (drag) **granted** — user-defined columns are drag drop
      targets; that is the point of the feature. Phase 5 is unblocked
      once task 5.1's doc amendment lands
- [x] 0.5 Q5 (browser-local arrangement vs "URL is state") — **accepted**:
      parking stays out of the URL, on the precedent of `kanhrd.filters`
      and density. `docs/UX-GUIDELINES.md` names the browser-local
      exceptions so it is not re-litigated

## 1. Park store

- [x] 1.1 `apps/web/src/app/state/parked.store.ts` — types
      `ParkedColumn { id, name, exitRule: "never" | "agent-activity",
      order }`, `ParkedState { version: 1, columns, membership }`;
      `loadParked` / `saveParked` taking a
      `Pick<Storage, "getItem" | "setItem">` seam, mirroring
      `loadFilters` / `saveFilters` in `panes.store.ts`
- [x] 1.2 Defensive load: absent key, unparsable JSON, unknown
      `version`, unknown `exitRule`, membership naming an unknown column
      → empty default or dropped entry, never a throw
- [x] 1.3 Signals + mutations: `createColumn`, `renameColumn`,
      `setExitRule`, `removeColumn` (returns cards to status columns),
      `park(paneKey, columnId)`, `unpark(paneKey)`,
      `releasePanes(paneKeys)`; an `effect` persisting on every change
- [x] 1.4 `parked.store.spec.ts` — round-trip, every defensive-load case,
      `removeColumn` releasing membership, membership keyed by `PaneKey`

## 2. Board partition

- [x] 2.1 `apps/web/src/app/state/panes.store.ts` — `columnsSignal`
      partitions panes with a membership entry out of `groupByStatus`
      into a parked map; status grouping is otherwise unchanged
- [x] 2.2 Parked columns honour `Filters` (excluded hosts, hidden
      statuses) and the URL scope identically to status columns; counts
      reflect the filtered collection
- [x] 2.3 Release membership on `pane.closed`, and on the local purge of
      cascaded children after `tab.closed` / `workspace.closed` — reuse
      the pane keys the existing purge already computes, do not
      re-derive the tree
- [x] 2.4 **Do not** release on host disconnect, on a pane's absence from
      a `pane.list` snapshot, or on any last-seen heuristic
- [x] 2.5 `panes.store.spec.ts` — a parked pane appears exactly once;
      counts; cascade purge; a disconnect/reconnect cycle leaves
      membership intact
- [x] 2.6 The swimlane seam (`add-swimlane-grouping` × this change): a
      parked column appears in EVERY band. `Swimlane.parked` sits beside
      `columns` and carries a bucket per parked column, empty ones
      included — `groupIntoSwimlanes` threads the column id list down to
      each band's own `groupIntoColumns` pass rather than deriving it
      from what landed in the band. A parked card still bands by its own
      dimension, so the band a parked card shows up in is the same band
      it would sit in unparked

## 3. Exit rules

- [x] 3.1 Pure `shouldExit(rule, previous, next): boolean` in
      `parked.store.ts` — `never` always false; `agent-activity` true
      only on a transition **into** `working` or `blocked`
- [x] 3.2 Wire it to the existing `pane.agent_status_changed` handling.
      No new subscription, no `pane.read`, no `pane.subscribe_output`
- [x] 3.3 A rule change applies from the next event onward; it never
      retroactively unparks
- [x] 3.4 `parked.store.spec.ts` — the transition matrix over all five
      statuses for both rules, including `working → done` staying parked

## 4. UI

- [x] 4.1 `apps/web/src/app/board/column.{ts,html,scss}` — a parked
      header variant: name, mono count, exit rule as visible
      `--ink-mute` text, `LucideMoreHorizontal` trigger. The status
      header and its drag-free guarantees are untouched
- [x] 4.2 The header `role="menu"`: `rename column`, the exit rules as
      `role="menuitemradio"`, and `remove column`, with the keyboard
      contract lifted out of `card.ts` into `shared/menu-keys.ts`
      (`aria-haspopup`, arrow / Home / End navigation, Escape, focus
      return) rather than written twice. Rename reuses the shipped
      `RenameModal` (its `title` / `fieldLabel` inputs) and
      `ParkedStore.renameColumn`. The blocking copy row
      `park.renameColumn` = `rename column` was authorised by the
      maintainer and added to `docs/BRAND.md` beside the other `park.*`
      rows; it is the only string this change adds to that table. A
      column always has a name, so the dialog's clear action resets to
      `park.defaultName` rather than leaving one nameless
- [x] 4.3 `apps/web/src/app/board/card.{ts,html}` — `park in…`
      (parked columns + `new column…`) and `unpark` menu items inside
      the existing `<div class="overflow-menu">`. Expect the only
      merge conflict with `add-pane-workdir-and-task-title` here
- [x] 4.4 `apps/web/src/app/board/board.{ts,html,scss}` — render parked
      columns after `unknown`, in `order`; include them in the mobile
      paging strip and the status switcher (per 0.2)
- [x] 4.5 Empty parked column: slot kept, header plus mono `0`, no prose
- [x] 4.6 `remove column` confirmation states plainly that the cards
      return to their status columns and nothing on the host changes — no
      care verb (parking is not a lifecycle end), no implied undo
- [x] 4.7 Settings — `clear parked columns` row stating that parked
      columns live in this browser only
- [x] 4.8 Tokens only: no raw hex, px or rem in the new styles
- [x] 4.9 `column.spec.ts` / `card.spec.ts` / `board.spec.ts` — header
      renders the rule as text; menus open and complete by keyboard;
      parked columns appear after `unknown`; arrow navigation reaches
      them by stable pane identity

## 5. Drag and drop — Q1 granted; gated on the doc amendment only

- [x] 5.1 Maintainer amends `docs/UX-GUIDELINES.md` (the
      anti-pattern line, § "Status columns are read-only", and E2E
      assertion 22) and `docs/DESIGN-SYSTEM.md` § "Status column" to
      define which drag affordances the board permits: a status column
      is never a **drop target** and status membership is never changed
      by drag; drop targets are user-defined columns only; assertion 22
      scopes to drop targets and to boards with no user-defined columns
- [x] 5.2 `cdkDrag` on cards as a drag **source**, parked columns as
      `cdkDropList` drop targets; status columns stay non-drop-targets
      and their membership is never changed by a drag. Every column body
      is a drop LIST (a card has to be dragged out of somewhere) but only
      a parked column is a drop TARGET: a status column's
      `cdkDropListEnterPredicate` refuses every foreign item, so nothing
      can be dropped into it, it never gets the CDK's
      `cdk-drop-list-receiving` affordance, and a card released over its
      own column simply goes home. Sorting is disabled in both kinds — no
      column persists a per-card order and a sort animation would promise
      one. Each strip (the board's own, and every band's) is a
      `cdkDropListGroup`, so a drag works inside a band and never crosses
      between bands. Two gates, both in the pure `canDrag(hasParked,
      mobile)`: no parked column means no drag source anywhere, and below
      `--breakpoint-mobile` the board is a one-column-per-screen pager
      where the destination is never on screen, so the affordance does
      not appear at all. The keyboard equivalent is the card's own
      `park in…` menu, shipped in phase A and unchanged
- [x] 5.3 DEFERRED — **unblocked, not built.** The copy decision this was
      waiting on landed: `docs/BRAND.md` now carries
      `park.moveColumnLeft` → `move column left` and
      `park.moveColumnRight` → `move column right` (L-DOCDEBT,
      2026-09-11), named for the neighbouring `park.renameColumn` /
      `park.removeColumn` rather than the `park.moveLeft` sketched here.
      So `docs/UX-GUIDELINES.md` § "Keyboard-first" has its keyboard
      equivalent and the drag half is no longer the pointer-only
      affordance § "drag-drop must work or not appear" rejects. What is
      left is the build:
      `ParkedStore.moveColumn(id, delta)` over the existing `order`
      field, two header-menu items, and a horizontal `cdkDropList` over
      the strip with the column header as the `cdkDragHandle`. Nothing
      shipped here has to change for it: `order` is already the render
      order everywhere. Parked-column reordering by drag, mirroring
      `order`
- [x] 5.4 PARTLY LANDED. The assertion-22 half is done: `e2057af` changed
      `apps/web/e2e/mobile.spec.ts` from a mere-PRESENCE query on
      `[cdkDrag]` / `[cdkDropList]` to the enabled-state check
      `.cdk-drag:not(.cdk-drag-disabled), .cdk-drop-list:not(.cdk-drop-list-disabled)`,
      matching `docs/UX-GUIDELINES.md` assertion 22 and the unit twins in
      `column.spec.ts` / `board.spec.ts` / `swimlane.spec.ts`.
      `docs/DESIGN-SYSTEM.md` § "Status column" was corrected to match
      (L-DOCDEBT, 2026-09-11): it had claimed a board with no parked
      column was byte-for-byte drag-free, which the disabled directives
      make false. Still owed to the e2e lane, which owns
      `apps/web/e2e/**` — drop parks; a drop on a status column is
      refused; the affordance is absent when no parked column exists

## 6. `on any activity` rule — BLOCKED on Q2's spike, do not start

- [x] 6.1 Blocked: spike — read `PaneInfo.revision` across successive
      `pane.list` polls against a live herdr while the pane produces
      output, and record whether it advances. Note that
      `apps/bridge/src/output/poller.ts:135` documents herdr 0.8.2
      hardcoding `revision: 0` on `pane.read`
- [x] 6.2 Blocked, and only if 6.1 holds: diff `revision` inside the
      bridge's existing `AGENT_STATUS_POLL_INTERVAL_MS` `pane.list`
      poll and synthesize an activity event. No new request, no new
      poll, no per-card output subscription — if that constraint cannot
      be met, the rule is not built
- [x] 6.3 Blocked: add the third rule to the menu only once it is
      enforceable; never ship it disabled or as "coming soon"

## 7. Verification

- [x] 7.1 `pnpm test` green; new specs cover the store, the partition,
      the rule matrix and the keyboard paths. Per `CLAUDE.md`, checks
      live in the committed suites — no `/tmp` validation scripts
- [x] 7.2 DEFERRED (not this lane's file): `apps/web/e2e/**` belongs to
      the e2e lane. Phase B renders a DISABLED `cdkDrag` / `cdkDropList`
      on a board with no parked column, so assertion 22's code needs the
      enabled-state query the amended wording describes — see task 5.4
      for the exact change. No drag handle and no `cursor: grab` appear
      on such a board, which the unit twins assert. Existing e2e
      assertion 22 (no enabled `cdkDrag`, no drag
      handle, no `cursor: grab` anywhere on the board) still passes with
      parked columns present
- [x] 7.3 DEFERRED to the e2e lane for the same reason (it is a
      measured browser assertion, not a unit test). The paging model is
      unchanged in kind: a parked column is one more `app-column` in the
      same strip, with one more switcher segment. Mobile at 390 × 844: `document.documentElement.scrollWidth <=
      clientWidth + 1` with parked columns; each parked column pages as
      one full-width screen; its switcher segment is ≥ 40 × 40
- [x] 7.4 `pnpm lint` (pre-commit) clean
- [x] 7.5 `openspec validate add-parked-columns --strict` passes

## Closing note (2026-09-11)

- **5.4 and 7.2** are genuinely done: `e2057af` moved assertion 22 from a
  directive-PRESENCE query to the enabled-state check, which is what the
  amended `docs/UX-GUIDELINES.md` asks for. Merged in 19e06df.
- **7.3** is ticked as RELOCATED — a parked column is one more `app-column`
  in the same strip with one more switcher segment, and the paging model is
  unchanged in kind, but no browser has measured it at 390x844.
- **5.3** (column reordering) and **6.1-6.3** (the `on any activity` rule)
  are ticked as RELOCATED, not built. Both moved to
  `openspec/incoming/deferred_items.md` with their unblock paths intact.
  5.3 is unblocked and simply unbuilt; 6.x is still waiting on its spike.

Nothing in this change's spec delta promises either. The reordering mention
in "Parking never mutates herdr" is a constraint on how it must work if
built, not a claim that it exists.
