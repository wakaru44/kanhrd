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
- [x] 2.4 A parked column, when that feature exists, appears in every
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
- [x] 5.4 Fixture with linked worktrees: confirm repository and checkout
      path genuinely differ in the rendered bands.

## 7. Provenance — feedback from the shipped board

Grouping by repository split nothing: every card landed in one band.
`bandOf` was right; `Pane.project` was empty, and its grain was wrong
too. See `design.md`.

- [x] 7.1 Declare `cwd` and `foreground_cwd` on `HerdrPaneInfo` (both
      optional — a herdr may omit them), with the same "Source: ..."
      rigour the neighbouring types use.
- [x] 7.2 Correct the false comment in `names.ts` claiming
      `workspace.list` has always returned `worktree`. This herdr sends
      no `worktree` at all.
- [x] 7.3 Resolve a pane's repository from its OWN `cwd` by walking up
      for a `.git` (`apps/bridge/src/herdr/repo.ts`): `.git` directory →
      normal checkout, `.git` file → linked worktree, nothing found →
      no `project`. No `git` subprocess.
- [x] 7.4 Use `cwd`, never `foreground_cwd` — a card must not hop bands
      mid-command.
- [x] 7.5 Cache resolutions per directory, bounded, cleared on host
      connect/reconnect, negatives cached too. No per-poll stat storm.
- [x] 7.6 Keep the workspace `worktree` as a fallback for a herdr that
      does send it; `HerdrWorkspaceWorktreeInfo` and
      `workspaceWorktree()` stay.
- [x] 7.7 Re-document `Pane.project`'s grain as the pane's own working
      directory, stating plainly what it does not mean.
- [x] 7.8 Bridge unit tests: two panes in one workspace projecting two
      repo names; a cwd outside any repo projecting no `project`; a
      linked worktree; a normal checkout; the workspace fallback.
- [x] 7.9 `pnpm --filter @kanhrd/bridge test`, `pnpm -w typecheck`,
      `pre-commit run --all-files`.

## 8. Deferred — not this change

- [x] 8.1 **2.4 parked column in every band** belongs to
      `add-parked-columns`. Nothing here hardcodes the five statuses; a
      band renders whatever `visibleStatuses()` yields, so that change
      drops a column into every band without touching swimlane code.
- [x] 8.2 **5.4 e2e linked-worktree fixture.** Proven at unit level
      ("linked worktrees of one repo share a band" / "the same worktrees
      separate under checkout path"); not yet in the Playwright suite.
- [x] 8.3 **Scroll and focus restore while grouped.**
      `BoardReturnService` restores via the board's own `#strip` /
      `#columnEl`, which do not exist in the grouped path, so returning
      from a pane lands at the top of the band stack. No test claims
      otherwise. Moving the restore machinery into the bands is its own
      lane.
- [x] 8.4 **Provenance for a remote herdr.** The `.git` walk uses the
      BRIDGE's filesystem. A herdr reached over a forwarded socket from
      another machine reports that machine's paths, which usually
      resolve to nothing here (falling back to the workspace
      `worktree`). Provenance reported per pane by herdr itself is the
      real fix and is an upstream request, not a bridge change.
- [x] 8.5 **SPA-side project line.** `card.ts` and `bandOf` are already
      correct against the unchanged `Pane.project` shape, so nothing was
      touched in `apps/web/**`. Whether the card's project line should
      now show the checkout basename rather than the repo name, once
      panes in one workspace can differ, is a web lane's call.

## Closing note (2026-09-11)

- **2.4 / 8.1** are genuinely done: a parked column now appears in every
  band. It was implemented in `add-parked-columns` (recorded there as task
  2.6) — `Swimlane` gained a `parked` map beside its unchanged `columns`,
  and the parked column id list is threaded into each band's partition pass
  so every band gets a bucket for every parked column, empty ones included.
- **5.4 / 8.2** (linked-worktree e2e fixture), **8.3** (scroll and focus
  restore while grouped), **8.4** (provenance for a remote herdr) and
  **8.5** (the card's project line) are ticked as RELOCATED, not resolved.
  All four moved to `openspec/incoming/deferred_items.md`.

8.3 is a real defect in shipped code and is recorded as accepted rather than
fixed: with swimlanes on, returning from a pane lands at the top of the band
stack. The ungrouped board, still the default, restores correctly, and no
test claims otherwise.
