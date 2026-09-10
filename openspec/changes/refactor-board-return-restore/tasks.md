## 1. Deepen the service

- [x] 1.1 Add `BoardRestorePort` and move the restore protocol
      (`startRestore`/`pumpRestore`/`tryRestore`/`finishRestore`/
      `restoreScroll`, the timer, the deadline, `RESTORE_GRACE_MS` and the
      50ms retry) out of `Board` and into `BoardReturnService`.
- [x] 1.2 Capture the board URL in the service from `Router` navigation
      events, keeping the last board-shaped one; add and export
      `isBoardUrl`.
- [x] 1.3 Drop `Board.activeUrl` and the `paramMap` subscription that fed
      it; `rememberBoard` takes geometry only.
- [x] 1.4 Keep `boardUrl()`, `returnFocusTarget` and `rememberCard`
      exactly as they were; make `take()` private (the service consumes
      its own record now).

## 2. Share the card-focus query

- [x] 2.1 Export `focusCard(root, paneKey, options?)` from
      `board/column.ts` with the `data-pane` query, the first focusable
      control and the activeElement-is-body rule.
- [x] 2.2 Use it from `Column.restoreFocus` and from the board's port.

## 3. Tests

- [x] 3.1 Move the restore-protocol suites into
      `board-return.service.spec.ts` as unit tests against a fake port
      with `jasmine.clock()`.
- [x] 3.2 Add the regression test for the remembered URL being the
      board's, not the pane's, at the service level.
- [x] 3.3 Delete the fixture-driven counterparts from `board.spec.ts`,
      leaving only what needs a real board.
- [x] 3.4 Update the `rememberBoard` setup in `pane-detail.spec.ts` and
      `not-found.spec.ts`, and give the board suites' `Router` doubles
      `url` and `events`.

## 4. Verify

- [x] 4.1 `pnpm --filter @kanhrd/web test`
- [x] 4.2 `pnpm --filter @kanhrd/web typecheck`
- [x] 4.3 `pnpm --filter @kanhrd/web build`
- [x] 4.4 `pre-commit run --files <touched>`
