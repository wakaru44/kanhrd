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

- [x] 4.1 Six captures: board, terminal, scoped, dense, settings, empty
- [x] 4.2 README gallery replaces the "pending a mock-bridge harness"
      paragraph; each image carries alt text
- [x] 4.3 Name the remaining gap (the six-palette composite) rather than
      implying the gallery is complete

## 5. Checks

- [x] 5.1 `pnpm screenshots` — 6 passed, determinism gate green
- [x] 5.2 `pnpm test:e2e` — 27 passed, 64 skipped (no live herdr), 0 failed
- [x] 5.3 `tsc --noEmit` over the new and edited e2e sources
- [x] 5.4 `pre-commit` over this lane's files

## 6. Deferred

- [ ] 6.1 The six-palette composite — six permutations plus a
      compositing step, not a single page capture
- [ ] 6.2 Regenerate `mobile_kanban.png` deterministically. It predates
      this harness and is the one capture not reproducible by
      `make screenshots`; left alone here because it is a committed
      asset this lane did not author
