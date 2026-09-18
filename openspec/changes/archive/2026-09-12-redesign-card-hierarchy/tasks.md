# Tasks — redesign-card-hierarchy

## 1. The card as row boxes

- [x] 1.1 Replace the single `grid-template-areas` card with one column
      box holding three row boxes (identity, locators, state). No grid
      column may be shared between rows.
- [x] 1.2 Keep the DOM order dot → title → seal → locators → state, so
      the reading order a screen reader gets is unchanged.
- [x] 1.3 Keep every class an existing spec or E2E asserts on:
      `.card-open`, `.status-dot`, `.status-label`, `.host-seal`,
      `.path`, `.meta`, `.card-actions`, `.actions-inline`,
      `.actions-overflow`.
- [x] 1.4 The stretched link stays anchored to `.card`: no new positioned
      ancestor between `a.card-open::after` and the card box.

## 2. Title

- [x] 2.1 The title fills its row: no inset from the status word, no
      reservation for the action row.
- [x] 2.2 It truncates only when it genuinely exceeds its own row.

## 3. Locators

- [x] 3.1 The locator row wraps; each locator claims at least half the
      row, so at most two share a line.
- [x] 3.2 A locator that does not fit takes its own line rather than
      ellipsing beside a neighbour.
- [x] 3.3 Suppress the repo name when it equals the workspace name.
- [x] 3.4 The full checkout path stays reachable on `:focus-within` and
      in full on the detail route (unchanged behaviour).

## 4. State row

- [x] 4.1 Status word, elapsed and line count read left to right; the
      actions sit at the trailing edge of the same row.
- [x] 4.2 The status word keeps its emphasis rules (blocked strongest).

## 5. Compact

- [x] 5.1 Compact is one row box carrying dot, title, seal, elapsed,
      status cue and overflow trigger — the same items as today.
- [x] 5.2 Only the title truncates; seal, elapsed, status cue and
      trigger do not.
- [x] 5.3 `--card-compact-height` and the virtual-scroll `itemSize`
      arithmetic are unchanged.

## 6. Verify

- [x] 6.1 `pnpm --filter @kanhrd/web test` — count up, never down.
- [x] 6.2 `pnpm -w typecheck`.
- [x] 6.3 `pre-commit run --all-files`.
- [x] 6.4 `openspec validate redesign-card-hierarchy --strict`.
