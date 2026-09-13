# Tasks — add-pane-gone-state

## 0. Maintainer decisions (recorded in `design.md`)

- [x] 0.1 Copy for the state line (and any body), recorded in
      `docs/BRAND.md`. `state.gone`; no body.
- [x] 0.2 Keep or clear the last frame, and how it is marked. Kept, dimmed
      to `--opacity-inert` (0.45) on the terminal container.
- [x] 0.3 Icon: none, or a twenty-second added to `docs/DESIGN-SYSTEM.md`
      first. `LucideSunset`, doc first.
- [x] 0.4 Actions beyond `back to the board`. None.
- [x] 0.5 Whether herdr reuses pane ids, and what a reused id does. Settled
      by citation of `herdr --skill` (ids are not reused), not by a run
      against an isolated session; no defence built.

## 1. State

- [x] 1.1 `PaneViewState` gains `gone`, derived from "seen in the store for
      a connected host, then removed" — not from absence alone.
- [x] 1.2 The template renders it in the terminal-status area; the meta
      strip no longer shows a live marker.
- [x] 1.3 `docs/UX-GUIDELINES.md` reliability-state table gains the row.

## 2. Stop watching

- [x] 2.1 Entering `gone` unsubscribes the output stream.
- [x] 2.2 `PaneTerminal` refuses to send input once its pane is gone.

## 3. Verify

- [x] 3.1 Unit tests for each scenario in the spec, including the cold deep
      link and the lost host.
- [x] 3.2 Live e2e against the isolated session: `exit` in an open pane
      reaches the gone state within one `pane.list` poll
      (`e2e/pane-gone.spec.ts`, chromium project).
- [x] 3.3 Web tests, `pnpm -w typecheck`, `make lint`.
