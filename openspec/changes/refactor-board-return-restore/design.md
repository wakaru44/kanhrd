## Context

Coming out of a pane must land the user on the same board, same page, same
scroll offsets and same card (docs/UX-GUIDELINES.md, "Focus and terminal
input survive navigation"; "Keyboard-first"). The record has to be written
by two components that each know half of it, survive a component teardown
and remount, and be applied against a DOM that does not exist yet at mount
time — cards arrive with `pane.list`.

That is a protocol, and it was living in a component. This change moves it
behind the service that already owned the record, and records the five
decisions the move rests on.

## Goals / Non-Goals

- **Goal:** one module owns the whole round trip, testable without a DOM.
- **Goal:** make the "read the URL in `ngOnDestroy`" bug structurally
  impossible rather than commented against.
- **Non-Goal:** any change to what the user sees. Cadence, grace period,
  fallbacks and consumption semantics are preserved exactly.
- **Non-Goal:** touching `PanesStore` or `WsClient`. Neither is involved.
- **Non-Goal:** a general "view port" abstraction. There is one board and
  one implementation of this port; a second would be the moment to
  generalise, not now.

## Decisions

### 1. The view passes a port; the service never queries the document

`restore(port: BoardRestorePort)`. The port answers six questions —
current URL, the strip element, settle the pager on a page, the scrolling
element of a status column, the card keys of a status column, focus this
card — and knows nothing about retries, deadlines or records.

The service owns the protocol: the pump, the deadline, the URL match, the
scroll-before-focus order, and the rule that focus the user has already
placed is never taken away. That last rule lives inside the port's
`focusCard`, because it is a DOM fact (`document.activeElement`);
`focusCard` returns whether the card was *reached* — focused, or
deliberately left alone — and `false` only while it has not rendered,
which is the pump's cue to look again. Conflating "not rendered" with
"user has focus elsewhere" would keep the pump running for the full grace
period after the answer was already known.

Its tests drive a fake port. No fixture, no DOM, no real timers.

**Alternative rejected:** passing `ElementRef`s or the component itself.
Both put template knowledge back in the service and drag a fixture back
into its tests.

### 2. The service captures the board URL; `Board` never holds one

`BoardReturnService` injects `Router`, seeds from `Router.url` at
construction and keeps the last **board-shaped** URL from every
`NavigationEnd`. Board-shaped is the three URLs
docs/UX-GUIDELINES.md ("URL is state") calls a board: `/`,
`/workspace/:id`, `/workspace/:id/tab/:id` — one exported predicate,
`isBoardUrl`, tested directly. A URL the predicate does not recognise is
ignored: the last board URL stands, which is what a trip to a pane, to
settings, or to an unknown URL should leave behind.

`rememberBoard` therefore takes geometry only. There is no URL field on
`Board` and no way to pass one in, so the shipped bug — `Router.url` in
`ngOnDestroy` naming the route being navigated TO — cannot come back.

**Alternative rejected:** keeping `Board.activeUrl` with its warning
comment. It works and it already failed once; a comment is not a
structure.

**Consequence:** two specs outside this lane
(`pane-detail.spec.ts`, `not-found.spec.ts`) set up "the user was last on
board X" by passing `url` to `rememberBoard`. They now drive the router
instead, which is also a more honest setup.

### 3. `Card.rememberCard()` stays where it is

`Card` is the only module that knows which card was clicked, and it must
record it *before* the navigation it starts. Nothing about that changed,
so nothing about it moves.

### 4. `returnFocusTarget` stays a pure exported function

The neighbour-fallback rule (the opened card if it is still there; else
the card now standing at its index, clamped; else nothing) is pure, is
already tested as a pure function, and is the part of this protocol most
likely to be reasoned about on its own. It stays exported and stays
tested independently of the service that calls it.

### 5. One shared card-focus query

`Column.restoreFocus` (recovering focus a recycled virtual-scroll view
dropped) and the board's restore need the same three rules: the
`app-card[data-pane]` query with `CSS.escape`, the card's first
`a[href], button`, and never stealing focus the user placed. That was
written twice. It is now `focusCard(root, paneKey, options?)`, exported
from `board/column.ts` — where `mobileViewportSignal` already lives for
the same reason (`board.ts` already imports from `./column`, so the move
adds no edge to the module graph). The board passes
`{ preventScroll: true }` so restoring focus cannot undo the scroll it
just restored; the column passes nothing, as before.

## Preserved exactly

- `RESTORE_GRACE_MS` (2000ms) and the 50ms pump cadence. Both moved to
  the service; neither changed value.
- "Consumed either way" — a record is good for exactly one return, whether
  or not it could be applied.
- The CDK-virtual-scroll-viewport-vs-`.column-body` scroller lookup, which
  stays in `Board` behind `port.scroller` because it is template
  knowledge.
- A record whose URL does not match the board that came up is dropped, not
  applied.
- `boardUrl()` keeps its name, signature and meaning, and still answers
  `/` when nothing is remembered.

## Risks / Trade-offs

- **The port is an interface with one implementation.** Accepted
  deliberately: it exists to move a test surface off a fixture, not to
  anticipate a second board.
- **The service now depends on `Router`.** Every TestBed that provides a
  `Router` double must give it `url` and `events`. Three board suites and
  two service suites were updated; the cost is visible and bounded.
- **`rememberBoard`'s signature changed.** It is called from exactly one
  production site (`Board.ngOnDestroy`) plus test setup.

## Test split

Unit, against a fake port with fake timers (`board-return.service.spec.ts`):
URL match and mismatch, expiry at the deadline, retry until the target
renders, waiting through the skeleton, scroll restored before focus,
neighbour fallback, the emptied-column case, the no-card departure,
"already focused elsewhere" ending the pump, one-shot consumption, a stale
card not being inherited, the pump stopping when the board is torn down
again, and the URL regression — the board URL, not the pane URL the router
already moved to.

Fixture, against a real board (`board.spec.ts`): that the port is wired to
a real DOM at all — the two cards render, teardown records the board URL,
a real click-teardown-remount puts focus back on the real card, and focus
the user placed elsewhere in a real document is left alone.
