## 0. Gate — maintainer decisions

Answered 2026-09-10. See `proposal.md` § "Maintainer decisions"; do not
re-ask.

- [x] 0.1 Q1: **both** repository and checkout path, as separate values
      of the setting. Neither is a substitute for the other.
- [x] 0.2 Q4: **orthogonal.** A parked column is a column on the
      vertical axis; a swimlane is a band on the horizontal one. Neither
      feature blocks the other.
- [x] 0.3 Q2: an empty band is **not rendered**.
- [x] 0.4 Q3: swimlanes apply below 900px; the pager pages **within**
      the current band.
- [x] 0.5 Q5: one virtual scroller per column per band; the existing
      50-card threshold applies at that granularity.

## 1. Grouping

- [x] 1.1 Derive the grouping key per pane for each dimension: host,
      `project.repo_name`, `project.checkout_path`, tab.
- [x] 1.2 Resolve a band label per dimension, and decide what a pane
      with no `project` shows when grouping by repository or checkout —
      `project` is optional on `Pane`.
- [x] 1.3 Stable band ordering, so bands do not reshuffle as cards move.

## 2. Layout

- [x] 2.1 Render one band per distinct value, each holding the full set
      of visible columns.
- [x] 2.2 Do not render a band that holds no cards in any column.
- [x] 2.3 Keep status columns' order, filter behaviour and empty slots
      inside every band.
- [ ] 2.4 A parked column, when that feature exists, appears in every
      band beside the status columns.

## 3. Setting

- [x] 3.1 Add the dimension to `SettingsService`, persisted under the
      existing `kanhrd.settings` key and cleared by clear-local-data.
- [x] 3.2 A board-level control — the operator changes this while
      reading the board, not from a settings screen.

## 4. Mobile and density

- [x] 4.1 Below 900px: choose the band, then page columns within it.
- [x] 4.2 Compact and virtualization thresholds apply per column per
      band; check the scroller count at the documented fixture size.

## 5. Verification

- [x] 5.1 `pnpm --filter @kanhrd/web test`
- [x] 5.2 `pnpm --filter @kanhrd/web build`
- [x] 5.3 `bash tools/lint-scss-tokens.sh`
- [ ] 5.4 Fixture with linked worktrees: confirm repository and checkout
      path genuinely differ in the rendered bands.

## 6. Deferred — not this change

- [ ] 6.1 **2.4 parked column in every band** belongs to
      `add-parked-columns`. Nothing here hardcodes the five statuses; a
      band renders whatever `visibleStatuses()` yields, so that change
      drops a column into every band without touching swimlane code.
- [ ] 6.2 **5.4 e2e linked-worktree fixture.** Proven at unit level
      ("linked worktrees of one repo share a band" / "the same worktrees
      separate under checkout path"); not yet in the Playwright suite.
- [ ] 6.3 **Scroll and focus restore while grouped.**
      `BoardReturnService` restores via the board's own `#strip` /
      `#columnEl`, which do not exist in the grouped path, so returning
      from a pane lands at the top of the band stack. No test claims
      otherwise. Moving the restore machinery into the bands is its own
      lane.
