# Tasks — add-pane-destinations

Three phases, each shippable on its own. Phase 1 is the reported bug;
phases 2 and 3 are the feature the operator asked for.

## 1. Creation lands where the operator is looking

- [ ] 1.1 `Board.newPane()` sends the current scope's `workspace_id`, and
      `target_pane_id` when a card is in view, instead of `{ direction }`
      alone.
- [ ] 1.2 `newTab()` sends the current scope's `workspace_id`.
- [ ] 1.3 With no scope, the `+` menu asks for a destination rather than
      falling through to `primaryHost()`'s first-in-config-order host.
- [ ] 1.4 A tab row's overflow menu in the rail gains `new card in this
      tab`, which needs no picker: the row IS the destination.
- [ ] 1.5 Specs: a scoped board creates in that workspace; an unscoped
      board with two capable hosts does not silently pick one.

## 2. The shared destination picker

- [ ] 2.1 `shared/destination-picker` — host → workspace → tab, reading
      the store, defaulting to the active scope.
- [ ] 2.2 It offers only destinations the host's capabilities allow, and
      renders nothing for a host that can do neither.
- [ ] 2.3 Keyboard contract matches the card menu's (arrows, Home/End,
      Escape, focus returns to the trigger).
- [ ] 2.4 Used by the `+` menu and by the card's move menu — one picker,
      not two.

## 3. Move

- [ ] 3.1 `PanesStore.movePane(host, params)` beside `splitPane`.
- [ ] 3.2 The card's move menu offers herdr's three destinations: an
      existing tab, a new tab, a new workspace. Gated on
      `capabilities.paneMove`.
- [ ] 3.3 The result's cascade (`closed_tab_id`, `closed_workspace_id`,
      `created_tab`, `created_workspace`) routes through the SAME local
      purge the board already runs for `tab.closed` / `workspace.closed`.
      No second reconciliation path.
- [ ] 3.4 `changed: false` with `reason: 'same_tab' | 'zoomed_tab'` is
      reported to the operator, not swallowed as success.
- [ ] 3.5 A failed move posts a toast quoting herdr's message, like every
      other lifecycle failure.

## 4. The action row: move / split / rest / dots

- [ ] 4.1 Four controls, each with an `aria-label` from `copy.ts`:
      `move`, `split`, `rest`, `more actions`.
- [ ] 4.2 `move` and `split` open menus; `rest` opens the existing
      confirm dialog; `dots` carries every action with its label plus
      rename.
- [ ] 4.3 The move menu separates herdr destinations from `park in…`
      under their own headings — one changes the host, the other does not
      (maintainer decision pending, see proposal).
- [ ] 4.4 Every control is visible on first render, never hover-only, and
      meets `--touch-target-min`.
- [ ] 4.5 The compact card keeps ONE visible trigger (the dots menu), as
      it does today.

## 5. Verify

- [ ] 5.1 `pnpm --filter @kanhrd/web test`, `pnpm -w typecheck`,
      `pre-commit run --all-files`.
- [ ] 5.2 Against the isolated test session, never the operator's socket:
      create in a chosen tab, move a pane between tabs, and move the last
      pane out of a tab so the cascade fires.
- [ ] 5.3 Shoot the card's action row and the move menu against the
      mocked bridge.

## 6. Docs a maintainer owes

- [ ] 6.1 `docs/UX-GUIDELINES.md`: the sentence saying the UI must not
      hint that pane.move exists is retired by this change and becomes the
      rules the move menu follows.
- [ ] 6.2 `docs/BRAND.md`: the new labels.
