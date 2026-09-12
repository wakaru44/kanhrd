# Tasks — add-terminal-scrollback-depth

## 1. Measure first (this gates the rest)

- [ ] 1.1 Against a `kanhrd-test-*` session (never the operator's socket),
      seed a pane with several thousand lines of known output.
- [ ] 1.2 Request `pane.read` at `source: recent` with no `lines`, then
      with 200, 2000 and 20000, and record for each: lines returned,
      bytes, `truncated`, and latency.
- [ ] 1.3 Record the same for `pane.subscribe_output` snapshots.
- [ ] 1.4 Write the numbers into the change's `design.md`. If herdr caps
      below a usable depth, the ceiling is a documented product limit and
      the setting's maximum becomes that number.

## 2. One request shape

- [ ] 2.1 A single source of truth for `{ source, format, lines }`, used by
      the first `pane.read` and by `pane.subscribe_output`, so a later
      snapshot can never be narrower than the first paint.
- [ ] 2.2 xterm's `scrollback` follows the same number rather than sitting
      at an unrelated 5000.

## 3. The operator's depth

- [ ] 3.1 `state/terminal-scrollback.service.ts`, modelled on
      `terminal-font-size.service.ts`: a `kanhrd.*` key, a defensive load,
      and a clamped range whose maximum comes from task 1.
- [ ] 3.2 A Settings control beside terminal font size and palette.
- [ ] 3.3 Changing it refits and re-reads the open pane without a reload.

## 4. Truncation is visible

- [ ] 4.1 Read `truncated` from the read result and the snapshots.
- [ ] 4.2 One quiet line at the head of the buffer when it is true, from
      `copy.ts`, recorded in `docs/BRAND.md`. Not a toast.
- [ ] 4.3 It disappears when a later snapshot is complete.

## 5. Verify

- [ ] 5.1 `pnpm --filter @kanhrd/web test`, `pnpm -w typecheck`,
      `pre-commit run --all-files`.
- [ ] 5.2 A live check against the isolated session: a pane with more
      output than the depth shows the truncation line, and one with less
      does not.
