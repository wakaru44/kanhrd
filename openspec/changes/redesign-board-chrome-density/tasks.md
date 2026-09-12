# Tasks — redesign-board-chrome-density

Recorded after the fact for `043d787` and `f541972`; every box below is
what those commits actually did.

## 1. One wrapping row of groups

- [x] 1.1 `.filter-bar` becomes a wrapping ROW; each `.chip-row` stays a
      wrapping row of chips, so the flow is composition rather than a
      media query.
- [x] 1.2 Row gap tight, column gap wider — the gap between groups is the
      only thing separating two of them.
- [x] 1.3 No chip, column or control removed, and nothing moved behind a
      disclosure.

## 2. Groups name themselves

- [x] 2.1 `filter.hosts` / `filter.columns` in `shared/copy.ts`, recorded
      in `docs/BRAND.md`'s copy table.
- [x] 2.2 A `.row-label` on the hosts and columns groups, matching the
      group-by row that already had one.
- [x] 2.3 The label is the group's accessible name: `role="group"` plus
      `aria-label`, not decoration.

## 3. Checks

- [x] 3.1 A spec asserting the bar is a wrapping row and the groups wrap
      inside it — put `column` back and it fails.
- [x] 3.2 A spec asserting all three groups carry a label, and that the
      label is the accessible name.
- [x] 3.3 Measured against the built SPA at 1600, 1280, 900 and 390: bar
      height, rows used, first-card offset, and no horizontal page scroll.

## 4. Verify

- [x] 4.1 `pnpm --filter @kanhrd/web test` (729), `pnpm -w typecheck`,
      `pre-commit`.
- [x] 4.2 `openspec validate redesign-board-chrome-density --strict`.
