# Tasks — add-pane-gone-state

## 0. Blocked on maintainer decisions

- [ ] 0.1 Copy for the state line (and any body), recorded in
      `docs/BRAND.md`.
- [ ] 0.2 Keep or clear the last frame, and how it is marked.
- [ ] 0.3 Icon: none, or a twenty-first added to `docs/DESIGN-SYSTEM.md`
      first.
- [ ] 0.4 Actions beyond `back to the board`.
- [ ] 0.5 Verify whether herdr reuses pane ids, against an isolated
      `kanhrd-test-*` session, and decide what a reused id does.

## 1. State

- [ ] 1.1 `PaneViewState` gains `gone`, derived from "seen in the store for
      a connected host, then removed" — not from absence alone.
- [ ] 1.2 The template renders it in the terminal-status area; the meta
      strip no longer shows a live marker.
- [ ] 1.3 `docs/UX-GUIDELINES.md` reliability-state table gains the row.

## 2. Stop watching

- [ ] 2.1 Entering `gone` unsubscribes the output stream.
- [ ] 2.2 `PaneTerminal` refuses to send input once its pane is gone.

## 3. Verify

- [ ] 3.1 Unit tests for each scenario in the spec, including the cold deep
      link and the lost host.
- [ ] 3.2 Live e2e against the isolated session: `exit` in an open pane
      reaches the gone state within one `pane.list` poll.
- [ ] 3.3 Web tests, `pnpm -w typecheck`, `make lint`.
