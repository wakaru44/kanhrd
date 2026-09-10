## Why

`BoardReturnService` was a five-method mailbox over two fields. The
behaviour it exists for — putting the user back where they were when they
come out of a pane — lived in `Board`: `startRestore`, `pumpRestore`,
`tryRestore`, `finishRestore`, `restoreScroll`, `columnScroller`, a
`restoreTimer`, a `restoreDeadline`, a `pendingReturn` field and
`RESTORE_GRACE_MS`. About 110 lines of protocol in a component that is
already the board's pager, its scope resolver and its create menu.

Two consequences, both paid for already:

1. **The protocol could only be tested through a fixture.** Every rule in
   it — the URL match, the grace deadline, the 50ms retry cadence, scroll
   before focus, the neighbour fallback, one-shot consumption — was
   asserted by mounting two real boards, clicking a real card and waiting
   on real timers. Slow, and only ever able to cover the cases a fixture
   can be driven into.
2. **`Board` held a URL, and holding a URL is the trap.** The board's only
   chance to hand its URL over is `ngOnDestroy`, and by then `Router.url`
   already names the route being navigated TO. That bug shipped: every
   departure remembered the pane's own URL, so the pane's "back to the
   board" control pointed at the page the user was already on and the
   first click did nothing. The fix at the time was a second field
   (`activeUrl`) and a comment warning the next person off — a trap with a
   sign on it, not a removed trap.

## What Changes

- `BoardReturnService` owns the whole round trip: the record, the URL it
  belongs to, the retry pump, the grace deadline, the URL match, the
  scroll-before-focus order and one-shot consumption.
- The view hands over a small port (`BoardRestorePort`) carrying only what
  a template knows: which element scrolls what, how a card is queried, and
  what a horizontal offset means to the pager.
- The service captures the board URL itself from `Router` navigation
  events, keeping the last board-shaped one. `Board` no longer holds a URL
  at all, so the trap cannot be reintroduced; `rememberBoard` takes only
  geometry.
- `Column.restoreFocus` and the board's focus restore share one
  implementation of the card-focus query instead of hand-rolling the same
  `data-pane` + `CSS.escape` + activeElement-is-body rules twice.
- The restore-protocol suites move to `board-return.service.spec.ts` as
  unit tests against a fake port with fake timers. `board.spec.ts` keeps
  only what needs a real board.

**No user-visible behaviour changes.** Same cadence, same grace period,
same fallbacks, same consumption rule.

## Impact

- Affected specs: none. This is a module boundary move; every requirement
  in `openspec/specs/` that describes the return trip still describes it
  exactly, and no delta is proposed.
- Affected code: `apps/web/src/app/state/board-return.service.ts`,
  `apps/web/src/app/board/board.ts`, `apps/web/src/app/board/column.ts`.
- Affected tests: `board-return.service.spec.ts` (grows the protocol
  suites), `board.spec.ts` (shrinks to the fixture-only cases),
  `pane-detail.spec.ts` and `not-found.spec.ts` (their `rememberBoard`
  setup drops the `url` field it can no longer pass).
