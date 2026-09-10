## 1. Bridge

- [ ] 1.1 Widen the existing `paneAgentStatus` map in
      `apps/bridge/src/herdr/hosts.ts` from `status` to
      `{ status, since }`. Reuse the diff already in `pollAgentStatus()`
      — do not add a second poll or a second source of truth.
- [ ] 1.2 Stamp `since` on transition; leave it untouched when the
      status is unchanged; drop the entry when the pane leaves
      `pane.list`.
- [ ] 1.3 A pane first seen at startup gets NO `since` — the bridge has
      not observed it enter that status and must not pretend. Stamping
      "now" here is the exact bug this change exists to remove.
- [ ] 1.4 Project `status_since` onto the `Pane` the bridge emits, in
      `pane.list` responses and in every event payload carrying a pane.
- [ ] 1.5 Bridge tests for: transition re-stamps, steady state does not,
      pane removal drops the entry, startup panes have no value, a pane
      that vanishes and returns is stamped fresh.

## 2. Schema

- [ ] 2.1 Add optional `status_since?: number` (epoch ms) to `Pane` in
      `packages/schema/src/herdr.ts`, documented as bridge-observed,
      resets on bridge restart, accurate to one poll interval.
- [ ] 2.2 Confirm no herdr type gains the field — it is bridge-injected,
      like `host`, and `HerdrPaneInfo` stays a faithful mirror of
      herdr's own shape.

## 3. Web

- [ ] 3.1 Delete `statusSince`, `lastObservedStatus` and the transition
      effect from `card.ts`. They are the defect, not scaffolding for
      the fix.
- [ ] 3.2 Derive elapsed from `pane().status_since` against `ClockTick`.
- [ ] 3.3 Render no duration when `status_since` is absent. Check what
      the meta row looks like with the duration gone — it shares a row
      with the optional line count and must not collapse oddly when both
      are missing.
- [ ] 3.4 Component tests: two panes with different `status_since` show
      different durations; a pane without it shows none; the value does
      not change when the component is destroyed and recreated with the
      same input.

## 4. Docs

- [ ] 4.1 Correct `docs/DESIGN-SYSTEM.md`'s card meta row (currently
      "first seen by this client") to describe the bridge observation,
      its restart reset and its poll-interval resolution.
- [ ] 4.2 Check `docs/UX-GUIDELINES.md`'s "fabricated data" reject still
      reads correctly against the new behaviour, and reference this
      readout as the worked example if it helps.

## 5. Verification

- [ ] 5.1 `pnpm --filter @kanhrd/web test`
- [ ] 5.2 `pnpm --filter @kanhrd/bridge test` (unit only — see the
      isolation rule in CLAUDE.md; never the operator's live socket)
- [ ] 5.3 `pnpm --filter @kanhrd/web build` and `pnpm typecheck`
- [ ] 5.4 Manual: open the board, note a card's duration, navigate into
      the pane and back, reload — the number must keep climbing, and two
      cards of different ages must differ.
