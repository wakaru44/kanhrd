# Tasks — add-pane-destinations

Three phases, each shippable on its own. Phase 1 is the reported bug;
phases 2 and 3 are the feature the operator asked for.

## 1. Creation lands where the operator is looking

- [x] 1.1 `Board.newPane()` sends the current scope's `workspace_id`, and
      `target_pane_id` when a card is in view, instead of `{ direction }`
      alone.
- [x] 1.2 `newTab()` sends the current scope's `workspace_id`.
- [x] 1.3 With no scope, the `+` menu asks for a destination rather than
      falling through to the first-in-config-order host. Ships WITH the
      picker (2.1): there is nothing to ask with until it exists. The
      fallback is now `unscopedHost()`, named for what it is and used
      nowhere else.
- [x] 1.4 A tab row's overflow menu in the rail gains `new card in this
      tab`, which needs no picker: the row IS the destination.
- [x] 1.5 Specs: a scoped board creates in that workspace (and on that
      workspace's host, over first-in-config-order). The second half —
      an unscoped board with two capable hosts does not silently pick
      one — belongs to 1.3 and ships with it.

## 2. The shared destination picker

- [x] 2.1 `shared/destination-picker` — host → workspace → tab, reading
      the store, defaulting to the active scope.
- [x] 2.2 It offers only destinations the host's capabilities allow, and
      renders nothing for a host that can do neither.
- [x] 2.3 Keyboard contract matches the card menu's (arrows, Home/End,
      Escape, focus returns to the trigger).
- [x] 2.4 Used by the `+` menu and by the card's move menu — one picker,
      not two.

## 3. Move

- [x] 3.1 `PanesStore.movePane(host, params)` beside `splitPane`.
- [x] 3.2 The card's move menu offers herdr's three destinations: an
      existing tab, a new tab, a new workspace. Gated on
      `capabilities.paneMove`.
- [x] 3.3 The result's cascade (`closed_tab_id`, `closed_workspace_id`,
      `created_tab`, `created_workspace`) routes through the SAME local
      purge the board already runs for `tab.closed` / `workspace.closed`.
      No second reconciliation path.
- [x] 3.4 `changed: false` with `reason: 'same_tab' | 'zoomed_tab'` is
      reported to the operator, not swallowed as success.
- [x] 3.5 A failed move posts a toast quoting herdr's message, like every
      other lifecycle failure.

## 4. The action row: move / split / rest / dots

- [ ] 4.1 Four controls, each with an `aria-label` from `copy.ts`:
      `move`, `split`, `rest`, `more actions`. BLOCKED on one icon:
      `docs/DESIGN-SYSTEM.md` pins twenty and says a twenty-first is a
      change to that document first. There is no move glyph among them,
      and `LucideSquareSplitHorizontal` is explicitly reserved there for
      navigating between cards, NOT for splitting. A maintainer names the
      icon (or rules the row may reuse an existing one) and this ships.
- [ ] 4.2 `move` and `split` open menus; `rest` opens the existing
      confirm dialog; `dots` carries every action with its label plus
      rename. Rides with 4.1 — it is the same row. The overflow menu
      already carries every action with its label, move included.
- [x] 4.3 The move menu carries herdr destinations ONLY. `park in…`
      stays in the overflow menu where it already lives: it changes
      nothing outside this browser and needs no capability (maintainer
      decision, 2026-09-12).
- [x] 4.4 Every control is visible on first render and never hover-only.
      The `--touch-target-min` clause is DROPPED for the inline row by
      maintainer decision (2026-09-12), taken with the measurements in
      hand: 26x26 today, 40x40 minimum, a 260px card whose action row
      shares its line with the status label and meta chips. The rule
      still governs overflow triggers and open-menu items, which is all
      `docs/UX-GUIDELINES.md` ever named. Recorded in `design.md`,
      including where the cost lands.
- [x] 4.5 The compact card keeps ONE visible trigger (the dots menu), as
      it does today.

## 5. Verify

- [ ] 5.1 `pnpm --filter @kanhrd/web test`, `pnpm -w typecheck`,
      `pre-commit run --all-files`.
- [x] 5.2 Against the isolated test session, never the operator's socket:
      create in a chosen tab, move a pane between tabs, and move the last
      pane out of a tab so the cascade fires. Committed as
      `apps/bridge/integration/pane-destinations.test.ts` (F1-F3), which
      needs no UI: these are herdr semantics the SPA rests on and the
      unit tests cannot prove, because they supply the responses
      themselves.
- [ ] 5.3 Shoot the card's action row and the move menu against the
      mocked bridge. Held until 4.1 lands so the row is shot once, in its
      final shape, rather than twice.

## 6. Docs a maintainer owes

- [x] 6.1 `docs/UX-GUIDELINES.md`: the sentence saying the UI must not
      hint that pane.move exists is retired by this change and becomes the
      rules the move menu follows.
- [x] 6.2 `docs/BRAND.md`: the new labels.
