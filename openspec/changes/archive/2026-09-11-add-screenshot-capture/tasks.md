## 1. Share the mock

- [x] 1.1 Extract `installMock`, `urlForState` and `StateName` out of
      `viewport-matrix.spec.ts` into `e2e/helpers/mock-bridge.ts`, so the
      capture run and the matrix boot from one definition
- [x] 1.2 Rewire `viewport-matrix.spec.ts` to import them; no assertion
      added, none removed
- [x] 1.3 Extend the mock with an opt-in `tier3` payload plus `pane.read`
      and `pane.subscribe_output` replies, so pane detail renders a
      terminal. The subscription is confirmed and then silent — a live
      stream would repaint mid-capture

## 2. Capture with time frozen

- [x] 2.1 `e2e/capture.spec.ts` — install `page.clock` at a fixed epoch
      before navigation, then `pauseAt` a fixed interval later so
      elapsed text is stable and plausible rather than `0s`
- [x] 2.2 Take each shot twice and fail unless the buffers are equal
- [x] 2.3 Write to `docs/screenshots/`, logging why each file exists

## 3. Keep it out of the test path

- [x] 3.1 A `capture` Playwright project; `testIgnore` on `chromium`
- [x] 3.2 `test:e2e` selects `--project=chromium --project=mobile`, so a
      bare `playwright test` cannot rewrite committed binaries
- [x] 3.3 `make screenshots` target with a `##` description

## 4. Publish

- [x] 4.1 Eight captures: board, terminal, scoped, dense, mobile,
      settings, empty, and the six-palette composite
- [x] 4.2 README gallery replaces the "pending a mock-bridge harness"
      paragraph; each image carries alt text
- [x] 4.3 The six-palette composite: one tile per palette, seeded through
      `kanhrd.terminal-theme`, each shot in its own browser context, laid
      out with `page.setContent` so no image library is needed

## 5. Checks

- [x] 5.1 `pnpm screenshots` — 8 passed, determinism gate green
- [x] 5.2 `pnpm test:e2e` — 27 passed, 64 skipped (no live herdr), 0 failed
- [x] 5.3 `tsc --noEmit` over the new and edited e2e sources
- [x] 5.4 `pre-commit` over this lane's files

## 6. Done in the second pass

- [x] 6.1 The six-palette composite — shipped, see 4.3
- [x] 6.2 `mobile_kanban.png` regenerated deterministically at the 390px
      reference viewport. Every image in the README is now reproducible
      by `make screenshots`; none is hand-taken
