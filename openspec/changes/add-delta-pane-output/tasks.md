# Tasks — add-delta-pane-output

## 1. Evidence

- [x] 1.1 Measure 80 / 250 / 1000 full against 1000 delta on a streaming
      pane, a status-line pane, a full-redraw pane and an alternate-screen
      TUI, including the fraction of frames that fall back to full. Recorded
      in `design.md`.

## 2. Wire

- [ ] 2.1 `pane.subscribe_output` gains `delta?: boolean`; `pane.output`
      gains `delta?: { drop; keep; length }`, documented in
      `packages/schema/src/wire.ts`.

## 3. Bridge

- [ ] 3.1 A pure line-delta helper with unit tests: appends, a sliding
      window at the depth, a bottom-region redraw, repeated identical rows,
      a snapshot sharing nothing, an empty previous, and a delta no smaller
      than the full frame (returns none). Every returned delta rebuilds the
      next snapshot exactly.
- [ ] 3.2 Poll loops keyed by host, pane, `source`, `format`, `lines`.
- [ ] 3.3 Per-subscriber `primed`; a delta against the loop's last snapshot
      only for a primed subscriber that asked for one; full otherwise.
- [ ] 3.4 Poller tests: a subscriber without `delta` never gets one; the
      first frame is full; a late joiner gets a full frame then deltas; two
      depths on one pane run two loops.

## 4. SPA

- [ ] 4.1 `PaneTerminal` subscribes with `delta: true`, rebuilds snapshots,
      and re-loads the pane when the rebuilt length disagrees.
- [ ] 4.2 Unit tests: a delta frame paints as its full snapshot would; a
      mismatched length re-reads instead of painting.

## 5. Default depth

- [ ] 5.1 `DEFAULT_TERMINAL_SCROLLBACK` becomes `HERDR_READ_LINE_CEILING`
      (1000), with the before/after payload recorded in `design.md`, and
      its tests follow. The `terminal-scrollback` spec names no default, so
      it needs no delta.

## 6. Docs

- [ ] 6.1 ADR-0004 dated amendment, in the form of the existing one.

## 7. Verify

- [ ] 7.1 Web and bridge unit tests, `pnpm -w typecheck`, `make lint`.
- [ ] 7.2 Live: with the isolated session, the terminal matches
      `pane.read` after a streaming run with deltas on, and the tier-2 and
      scrollback e2e specs pass.
