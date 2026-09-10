## 0. Gate — maintainer decisions before code

- [ ] 0.1 Q4 (copy): a maintainer approves or replaces the proposed
      `card.park` / `card.unpark` / `park.*` / `settings.clearParked`
      strings and adds them to `docs/BRAND.md`'s approved-copy table.
      Until then the lane follows `card.ts`'s existing `CARD_COPY`
      pending-copy precedent and does **not** invent table rows
- [ ] 0.2 Q3 (column-header menu) and Q6 (mobile switcher widening from
      "one segment per status" to "one segment per column") confirmed,
      and `docs/UX-GUIDELINES.md` extended by the maintainer if the
      answer changes either contract
- [ ] 0.3 Q2 (default exit rule is `agent-activity`) confirmed
- [ ] 0.4 Q1 (drag) recorded as **not** answered yet — phase 5 stays
      unstarted; nothing in phases 1–4 depends on it

## 1. Park store

- [ ] 1.1 `apps/web/src/app/state/parked.store.ts` — types
      `ParkedColumn { id, name, exitRule: "never" | "agent-activity",
      order }`, `ParkedState { version: 1, columns, membership }`;
      `loadParked` / `saveParked` taking a
      `Pick<Storage, "getItem" | "setItem">` seam, mirroring
      `loadFilters` / `saveFilters` in `panes.store.ts`
- [ ] 1.2 Defensive load: absent key, unparsable JSON, unknown
      `version`, unknown `exitRule`, membership naming an unknown column
      → empty default or dropped entry, never a throw
- [ ] 1.3 Signals + mutations: `createColumn`, `renameColumn`,
      `setExitRule`, `removeColumn` (returns cards to status columns),
      `park(paneKey, columnId)`, `unpark(paneKey)`,
      `releasePanes(paneKeys)`; an `effect` persisting on every change
- [ ] 1.4 `parked.store.spec.ts` — round-trip, every defensive-load case,
      `removeColumn` releasing membership, membership keyed by `PaneKey`

## 2. Board partition

- [ ] 2.1 `apps/web/src/app/state/panes.store.ts` — `columnsSignal`
      partitions panes with a membership entry out of `groupByStatus`
      into a parked map; status grouping is otherwise unchanged
- [ ] 2.2 Parked columns honour `Filters` (excluded pens, hidden
      statuses) and the URL scope identically to status columns; counts
      reflect the filtered collection
- [ ] 2.3 Release membership on `pane.closed`, and on the local purge of
      cascaded children after `tab.closed` / `workspace.closed` — reuse
      the pane keys the existing purge already computes, do not
      re-derive the tree
- [ ] 2.4 **Do not** release on pen disconnect, on a pane's absence from
      a `pane.list` snapshot, or on any last-seen heuristic
- [ ] 2.5 `panes.store.spec.ts` — a parked pane appears exactly once;
      counts; cascade purge; a disconnect/reconnect cycle leaves
      membership intact

## 3. Exit rules

- [ ] 3.1 Pure `shouldExit(rule, previous, next): boolean` in
      `parked.store.ts` — `never` always false; `agent-activity` true
      only on a transition **into** `working` or `blocked`
- [ ] 3.2 Wire it to the existing `pane.agent_status_changed` handling.
      No new subscription, no `pane.read`, no `pane.subscribe_output`
- [ ] 3.3 A rule change applies from the next event onward; it never
      retroactively unparks
- [ ] 3.4 `parked.store.spec.ts` — the transition matrix over all five
      statuses for both rules, including `working → done` staying parked

## 4. UI

- [ ] 4.1 `apps/web/src/app/board/column.{ts,html,scss}` — a parked
      header variant: name, mono count, exit rule as visible
      `--ink-mute` text, `LucideMoreHorizontal` trigger. The status
      header and its drag-free guarantees are untouched
- [ ] 4.2 The header `role="menu"`: rename, exit rules as
      `role="menuitemradio"`, remove column. Lift the keyboard contract
      from `card.ts` (`aria-haspopup`, arrow navigation, Escape,
      focus return) rather than writing a second one
- [ ] 4.3 `apps/web/src/app/board/card.{ts,html}` — `park in…`
      (parked columns + `new column…`) and `unpark` menu items inside
      the existing `<div class="overflow-menu">`. Expect the only
      merge conflict with `add-pane-workdir-and-task-title` here
- [ ] 4.4 `apps/web/src/app/board/board.{ts,html,scss}` — render parked
      columns after `unknown`, in `order`; include them in the mobile
      paging strip and the status switcher (per 0.2)
- [ ] 4.5 Empty parked column: slot kept, header plus mono `0`, no prose
- [ ] 4.6 `remove column` confirmation states plainly that the cards
      return to their status columns and nothing on the pen changes — no
      care verb (parking is not a lifecycle end), no implied undo
- [ ] 4.7 Settings — `clear parked columns` row stating that parked
      columns live in this browser only
- [ ] 4.8 Tokens only: no raw hex, px or rem in the new styles
- [ ] 4.9 `column.spec.ts` / `card.spec.ts` / `board.spec.ts` — header
      renders the rule as text; menus open and complete by keyboard;
      parked columns appear after `unknown`; arrow navigation reaches
      them by stable pane identity

## 5. Drag and drop — BLOCKED on Q1, do not start

- [ ] 5.1 Blocked: maintainer amends `docs/UX-GUIDELINES.md` (the
      anti-pattern line, § "Status columns are read-only", and E2E
      assertion 22) and `docs/DESIGN-SYSTEM.md` § "Status column" to
      define which drag affordances the board permits
- [ ] 5.2 Blocked: `cdkDrag` on cards as a drag **source**, parked
      columns as `cdkDropList` drop targets; status columns stay
      non-drop-targets and their membership is never changed by a drag
- [ ] 5.3 Blocked: parked-column reordering by drag, mirroring `order`
- [ ] 5.4 Blocked: e2e — drop parks; a drop on a status column is
      refused; the affordance is absent when no parked column exists

## 6. `on any activity` rule — BLOCKED on Q2's spike, do not start

- [ ] 6.1 Blocked: spike — read `PaneInfo.revision` across successive
      `pane.list` polls against a live herdr while the pane produces
      output, and record whether it advances. Note that
      `apps/bridge/src/output/poller.ts:135` documents herdr 0.8.2
      hardcoding `revision: 0` on `pane.read`
- [ ] 6.2 Blocked, and only if 6.1 holds: diff `revision` inside the
      bridge's existing `AGENT_STATUS_POLL_INTERVAL_MS` `pane.list`
      poll and synthesize an activity event. No new request, no new
      poll, no per-card output subscription — if that constraint cannot
      be met, the rule is not built
- [ ] 6.3 Blocked: add the third rule to the menu only once it is
      enforceable; never ship it disabled or as "coming soon"

## 7. Verification

- [ ] 7.1 `pnpm test` green; new specs cover the store, the partition,
      the rule matrix and the keyboard paths. Per `CLAUDE.md`, checks
      live in the committed suites — no `/tmp` validation scripts
- [ ] 7.2 Existing e2e assertion 22 (no enabled `cdkDrag`, no drag
      handle, no `cursor: grab` anywhere on the board) still passes with
      parked columns present
- [ ] 7.3 Mobile at 390 × 844: `document.documentElement.scrollWidth <=
      clientWidth + 1` with parked columns; each parked column pages as
      one full-width screen; its switcher segment is ≥ 40 × 40
- [ ] 7.4 `pnpm lint` (pre-commit) clean
- [ ] 7.5 `openspec validate add-parked-columns --strict` passes
