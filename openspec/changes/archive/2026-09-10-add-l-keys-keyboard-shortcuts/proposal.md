## Why

kanhrd had no keyboard-driven navigation — every action required a mouse.
herdr itself is tmux-style and keyboard-first; kanhrd's users are the same
audience. This is a retroactive OpenSpec record of the L-KEYS lane, written
after the fact because the work landed without a proposal. Commit: `f234ec2`
(`keyboard`).

## What Changes

- Add `KeyboardService`: a two-stage prefix-chord model (default prefix
  `Ctrl+B`, tmux convention) — press the prefix, release, then press the
  action key within a 2s timeout. Bindings: `c` (new pane), `n`/`p` (next/
  prev tab), `l` (last tab), `w` (open/focus rail), `&`/`x` (close tab/pane,
  documented no-op for `x` today — see Non-goals), `,` (rename tab), `0`-`9`
  (jump to tab N). `?` and `Escape` are non-chord (standalone).
- Add a keyboard help overlay (`app-keyboard-help-overlay`) opened by `?`,
  grouped into Navigation / Lifecycle / View / Help categories, closed by
  `Escape`.
- Add a Keyboard section to Settings for rebinding the prefix (only the
  prefix is user-rebindable; individual action keys are fixed), persisted
  to `localStorage['kanhrd.keyboard']`.
- Suppress shortcut handling while any input (including xterm.js's hidden
  `.xterm-helper-textarea`) has focus, so `Ctrl+B` reaches a focused
  terminal instead of arming the prefix chord.

## Non-goals

- `prefix+x` (close current pane) is a documented no-op: the kanban board
  renders every pane simultaneously with no single "focused pane" concept
  to act on, unlike herdr's own single-pane TUI view. Wiring it up needs a
  focused-pane concept that doesn't exist in the SPA yet.

## Capabilities

### New Capabilities
- `keyboard-shortcuts`: tmux-style prefix-chord keyboard navigation and a
  discoverable help overlay, client-side only, no bridge or wire changes.

### Modified Capabilities
(none)

## Impact

- Affected code: `apps/web/src/app/state/keyboard.service.ts`,
  `apps/web/src/app/shared/keyboard-help-overlay.*`,
  `apps/web/src/app/settings/**` (Keyboard section),
  `apps/web/src/app/app.ts`/`app.html`, `apps/web/src/app/board/board.ts`,
  `apps/web/src/app/rail/rail.ts`.
- Affected systems: none — client-side only.
- Tests: `apps/web/src/app/state/keyboard.service.spec.ts`,
  `apps/web/src/app/shared/keyboard-help-overlay.spec.ts`,
  `apps/web/e2e/keyboard.spec.ts`.
