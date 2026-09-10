## 1. Verify the diagnosis before changing anything

- [x] 1.1 Read herdr's `ReadSource` semantics from
      `packages/schema/src/herdr.ts`: `visible` = viewport only,
      `recent` = viewport + scrollback
- [x] 1.2 Confirm the live path is `OutputPoller.poll` → `pane.read` and
      that its entry source defaults to `"visible"`, against the SPA's
      initial read at `"recent"`
- [x] 1.3 Confirm `handleOutputEvent` does an unconditional
      `term.reset(); term.write(content)`, i.e. that the history is
      discarded rather than never fetched
- [x] 1.4 Reproduce in a real browser: a viewport-only frame behind a
      `recent` initial read collapses reachable history to one screenful

## 2. Bridge — the poll reads what the client reads

- [x] 2.1 `poller.ts` — default an unspecified subscription source to
      `"recent"`, matching `HerdrHost.paneRead`'s own default; comment
      why, referencing the full-snapshot repaint
- [x] 2.2 `poller.test.ts` — a poll with no requested source reads at
      `recent`
- [x] 2.3 `poller.test.ts` — an explicitly requested `source`/`format`
      is still honoured (the cheap viewport-only stream stays available)

## 3. Client — ask for the live stream out loud

- [x] 3.1 `pane-detail.ts` — call `pane.subscribe_output` with
      `source: "recent", format: "ansi"` rather than relying on a
      default at either end
- [x] 3.2 `pane-detail.spec.ts` — update the three subscribe
      expectations to the explicit shape

## 4. Client — the repaint stops destroying the reader's place

- [x] 4.1 `pane-detail.ts` — track the last painted snapshot per pane,
      cleared on every pane load
- [x] 4.2 `pane-detail.ts` — `paint()`: append fast path when the new
      snapshot starts with the previous one (write the suffix only, no
      reset)
- [x] 4.3 `pane-detail.ts` — `paint()`: on any other snapshot, keep
      `reset(); write()` but capture `buffer.active.viewportY` before and
      restore it in `write`'s completion callback
- [x] 4.4 `pane-detail.ts` — skip the restore when the reader was at the
      bottom (`viewportY >= baseY`): following the tail is the point
- [x] 4.5 `pane-detail.spec.ts` — an append writes only the tail and
      never resets
- [x] 4.6 `pane-detail.spec.ts` — a redraw restores a scrolled-up
      reader's offset
- [x] 4.7 `pane-detail.spec.ts` — a redraw does not scroll a reader who
      was already at the bottom

## 5. Verify

- [x] 5.1 `pnpm --filter @kanhrd/bridge test`
- [x] 5.2 `pnpm --filter @kanhrd/web test`
- [x] 5.3 `pnpm -r build`
- [x] 5.4 `bash tools/lint-scss-tokens.sh`
- [x] 5.5 Drive the built bundle in a real browser: scroll up, take
      several append polls and a redraw, and measure that the viewport
      did not move and that pre-update history is still reachable
- [x] 5.6 Same run: wheel, keyboard and touch scrolling all still work,
      and a reader at the bottom still follows the tail
- [x] 5.7 Same run: measure snapshot payload bytes at 400 and 5000 lines
      and state the per-second cost at the default poll interval
