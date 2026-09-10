## Why

`PaneDetail` was a component with a terminal inside it, and the terminal
was most of the component. Of its 657 lines, the route, the header, the
meta strip and the rename flow accounted for well under a third; the rest
was the xterm instance, the `FitAddon` convergence loop, a `ResizeObserver`,
four touch listeners with a sub-row carry, the `pane.read` /
`pane.subscribe_output` lifecycle with its stale-route guards, the snapshot
painter from commit `29acdc1`, and the promise chain that keeps keystrokes
in order. Nine private fields existed only to hold that machinery.

Two consequences, both already paid for:

1. **None of it could be tested without a fixture.** Append-vs-redraw,
   viewport anchoring, the send queue's ordering guarantee, the fit
   convergence, the state ladder — every one of them was asserted by
   mounting a component, providing four services through TestBed and
   pumping change detection, because that was the only way to reach the
   code. The assertions were about a terminal; the setup was about Angular.

2. **The reliability ladder mixed two different kinds of knowledge.** Five
   of the six `PaneViewState` values are facts about the terminal's own
   data flow (has content landed, is the read still in flight, is the
   subscription confirmed). The sixth, `unavailable`, is a fact about the
   pane's host that the terminal has no business knowing. They were
   computed in one place, so neither could be reasoned about alone.

## What Changes

- New `apps/web/src/app/pane-detail/pane-terminal.ts`: `PaneTerminal`, a
  plain class — not `@Injectable`, not a component, no DI. Its
  collaborators arrive through the constructor
  (`new PaneTerminal({ ws, terminalTheme, terminalFontSize, toast })`).
- `attach(el)` owns everything DOM-and-terminal: xterm construction, the
  `FitAddon`, the `ResizeObserver` convergence loop, all four touch
  listeners, the input pipe and the `pane.output` subscription.
- `state()` exposes `"loading" | "live" | "stale" | "failed" | "empty"`
  alongside `revision()`, `lastPollAt()` and `failureReason()`. The five
  flags behind that ladder (`hasContent`, `frameReceived`, `loading`,
  `failure`, `subscribed`) become private.
- `PaneDetail` keeps zero terminal-shaped fields. It overlays the one state
  the terminal cannot know: `viewState = hostInSight() ? term.state() :
  "unavailable"`.
- `send(data)` is public and shares the classification and the ordered
  queue with `onData`, so the terminal top bar in
  `openspec/changes/add-terminal-top-bar/` has one path to call rather than
  a second one to build.
- `pane-terminal.spec.ts` tests all of the above as plain unit tests — no
  TestBed, no fixture, a fake `WsClient` and a real `<div>`. The
  fixture-driven counterparts are deleted from `pane-detail.spec.ts`, which
  keeps only route-driven pane switching, the header and meta strip, the
  back paths, the template's rendering of each state and the `unavailable`
  overlay.

**No user-visible behaviour changes.** Same wire calls with the same
parameters, same copy, same painting rules, same ordering guarantee, same
precedence in the state ladder — including the deliberate "loading stays
true across the subscribe round-trip" suppression of a one-frame `stale`
flash.

## Impact

- Affected specs: none. This is a module boundary move; every requirement
  in `openspec/specs/` that describes the pane detail view still describes
  it exactly, and no delta is proposed.
- Affected code: `apps/web/src/app/pane-detail/pane-terminal.ts` (new),
  `apps/web/src/app/pane-detail/pane-detail.ts` (657 → 256 lines).
  `key-mapping.ts` is unchanged.
- Affected tests: `pane-terminal.spec.ts` (new, 845 lines),
  `pane-detail.spec.ts` (950 → 511 lines).
- Not affected: the template, the stylesheet, the wire surface, the bridge,
  `docs/CONTEXT.md` (a domain glossary — `PaneTerminal` is implementation,
  not domain vocabulary).
