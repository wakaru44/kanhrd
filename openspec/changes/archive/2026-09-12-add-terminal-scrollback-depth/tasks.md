# Tasks — add-terminal-scrollback-depth

## 1. Measure first (this gates the rest)

- [x] 1.1 Against a `kanhrd-test-*` session (never the operator's socket),
      seed a pane with several thousand lines of known output.
- [x] 1.2 Request `pane.read` at `source: recent` with no `lines`, then
      with 200, 2000 and 20000, and record for each: lines returned,
      bytes, `truncated`, and latency.
- [x] 1.3 Record the same for `pane.subscribe_output` snapshots.
- [x] 1.4 Write the numbers into the change's `design.md`. If herdr caps
      below a usable depth, the ceiling is a documented product limit and
      the setting's maximum becomes that number.

## 2. One request shape, on the wire

- [x] 2.1 `pane.subscribe_output` gains `lines` in
      `packages/schema/src/wire.ts`.
- [x] 2.2 The poller forwards `lines` to every poll's `pane.read`.
- [x] 2.3 A single source of truth in the SPA for `{ source, format, lines }`,
      used by the first `pane.read` and by `pane.subscribe_output`, so a
      later snapshot can never be narrower than the first paint.

## 3. The operator's depth

- [x] 3.1 `state/terminal-scrollback.service.ts`, modelled on
      `terminal-font-size.service.ts`: a `kanhrd.*` key, a defensive load,
      steps 250 / 500 / 1000 whose maximum is herdr's measured ceiling, and
      a default of 250.
- [x] 3.2 A Settings control beside text size and palette, its note
      interpolating the ceiling from the same constant, and a row in the
      clear-local-data preview.
- [x] 3.3 Changing it re-reads and re-subscribes the open pane without a
      reload.

## 4. Truncation is visible

- [x] 4.1 Read `truncated` from the read result and from `pane.output`.
- [x] 4.2 One quiet line at the head of the buffer when it is true, from
      `copy.ts`, recorded in `docs/BRAND.md`, re-rendered on every full
      repaint. Not a toast.
- [x] 4.3 It disappears when a later snapshot is complete.
- [x] 4.4 `docs/UX-GUIDELINES.md` records truncation as a reliability state.

## 5. Verify

- [x] 5.1 `pnpm --filter @kanhrd/web test`, bridge tests, `pnpm -w typecheck`,
      `make lint`.
- [x] 5.2 A live check against the isolated session: a pane with more
      output than the depth shows the truncation line, and one with less
      does not.
      Committed as `apps/web/e2e/terminal-scrollback.spec.ts` (live-only,
      skips without herdr), so it runs with the suite rather than once.
