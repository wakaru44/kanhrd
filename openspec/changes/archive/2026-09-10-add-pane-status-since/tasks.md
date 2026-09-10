## 1. Bridge

- [x] 1.1 Widen the existing `paneAgentStatus` map in
      `apps/bridge/src/herdr/hosts.ts` from `status` to
      `{ status, since }`. Reuse the diff already in `pollAgentStatus()`
      — do not add a second poll or a second source of truth.
- [x] 1.2 Stamp `since` on transition; leave it untouched when the
      status is unchanged; drop the entry when the pane leaves
      `pane.list`.
- [x] 1.3 A pane first seen at startup gets NO `since` — the bridge has
      not observed it enter that status and must not pretend. Stamping
      "now" here is the exact bug this change exists to remove.
- [x] 1.4 Project `status_since` onto the `Pane` the bridge emits, in
      `pane.list` responses and in every event payload carrying a pane.
- [x] 1.5 Bridge tests for: transition re-stamps, steady state does not,
      pane removal drops the entry, startup panes have no value, a pane
      that vanishes and returns is stamped fresh.

## 2. Schema

- [x] 2.1 Add optional `status_since?: number` (epoch ms) to `Pane` in
      `packages/schema/src/herdr.ts`, documented as bridge-observed,
      resets on bridge restart, accurate to one poll interval.
- [x] 2.2 Confirm no herdr type gains the field — it is bridge-injected,
      like `host`, and `HerdrPaneInfo` stays a faithful mirror of
      herdr's own shape.

## 3. Web

- [x] 3.1 Delete `statusSince`, `lastObservedStatus` and the transition
      effect from `card.ts`. They are the defect, not scaffolding for
      the fix.
- [x] 3.2 Derive elapsed from `pane().status_since` against `ClockTick`.
- [x] 3.3 Render no duration when `status_since` is absent. Check what
      the meta row looks like with the duration gone — it shares a row
      with the optional line count and must not collapse oddly when both
      are missing.
- [x] 3.4 Component tests: two panes with different `status_since` show
      different durations; a pane without it shows none; the value does
      not change when the component is destroyed and recreated with the
      same input.

## 4. Docs

- [x] 4.1 Correct `docs/DESIGN-SYSTEM.md`'s card meta row (currently
      "first seen by this client") to describe the bridge observation,
      its restart reset and its poll-interval resolution.
- [x] 4.2 Check `docs/UX-GUIDELINES.md`'s "fabricated data" reject still
      reads correctly against the new behaviour, and reference this
      readout as the worked example if it helps.

## 5. Verification

- [x] 5.1 `pnpm --filter @kanhrd/web test`
- [x] 5.2 `pnpm --filter @kanhrd/bridge test` (unit only — see the
      isolation rule in CLAUDE.md; never the operator's live socket)
- [x] 5.3 `pnpm --filter @kanhrd/web build` and `pnpm typecheck`
- [x] 5.4 Verified end to end against a SECOND bridge on a spare port
      (`--port 5199`, same herdr socket, read-only) so the operator's
      running bridge was never restarted. A fresh bridge with 11 panes:
      **5 had no `status_since`** (found already in their status at
      connect — the seeding path) and **6 had real stamps**, all after
      the bridge started, with four distinct ages (39s/42s/43s/44s)
      where the old readout showed every card identical.
      In the UI the 5 unvouched cards render no duration at all.
      Decisive check on the original report: after a FULL PAGE RELOAD
      the durations did not reset — `kanhrd / Farmine` went `5s` → `21s`
      across the reload, and the unvouched cards still showed none.