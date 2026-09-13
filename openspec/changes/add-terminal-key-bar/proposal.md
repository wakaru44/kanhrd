## Why

From a phone the operator cannot send Esc, Tab, Ctrl, Alt, the arrows or the
prefix to a pane. A soft keyboard has none of them, and the pane-detail
terminal offers nothing in their place. Agent TUIs and every tmux, vim or
emacs workflow depend on exactly those keys, so on a phone the terminal is
read-only in practice.

Every mature mobile terminal answers this with an accessory row of keys, and
the surveyed apps converge on the same minimum: Esc, Tab, Ctrl, Alt and the
four arrows (Termux, Termius, Blink, Prompt, Secure ShellFish, iSH). Termius
also shows that a composite cell earns its place: 6.3.0 added a literal
Shift+Tab cell "for Claude Code and other AI tools". Survey and primary
sources: the research brief handed to this lane, _mobile terminal key bar —
research_ (2026-09-13), §§1–5; its load-bearing sources are cited in
`design.md` directly, because the brief itself is not in this repository.

## What Changes

A **key bar** on the pane-detail route, fixed to the bottom of the visual
viewport, riding on top of the soft keyboard when it is open and staying put
when it is not.

Settled by the operator, carried as requirements:

- **It is its own toggle.** A collapsed status strip is always present;
  tapping it expands the row of keys, tapping again collapses it. The
  expanded or collapsed state persists per browser under a `kanhrd.*` key and
  is listed in Settings' clear-local-data preview. No top-bar control, no
  Settings toggle, no new icon.
- **Labels are text glyphs**: `esc`, `tab`, `ctrl`, `alt` and the literal
  arrows. No lucide icon is added or reused; `LucideArrowLeft/Right/Down`
  already mean back, split-right and split-down.
- **A cell is a sequence of key events**, not a single key, from v1. v1 ships
  a fixed list of cells; a later change lets the operator edit that list
  without replacing the renderer, the state machine or the transport.
- **Keys in v1**: `esc`, `tab`, `ctrl` (sticky), `alt` (sticky), the four
  arrows, and a prefix cell. `ctrl` and the prefix cell are different things.
- **Modifiers** latch for one key on tap, lock on long-press, and show three
  visually distinct states: idle, armed, locked.

Built here, beyond the operator's list:

- Keys go out as herdr key names through the existing `pane.send_keys`
  queue. No wire change. A sticky modifier also applies to the next character
  typed on the soft keyboard.
- Tapping the bar never takes focus from the terminal, so the soft keyboard
  stays up.
- The terminal's visible box ends above the bar and above an open soft
  keyboard, so the prompt is never hidden behind either.
- The bar claims its own touch gestures, so a vertical swipe that starts on
  it cannot become pull-to-refresh.

## Rulings

- **A — the `^B` cell sends a literal `ctrl+b` to the pane** (operator).
  - It does not follow `KeyboardService.prefix()`.
  - A key sent through `pane.send_keys` reaches the pane's program, never
    herdr's prefix layer (measured, see `design.md`).
  - An operator who moved herdr's prefix freed `Ctrl+B` on purpose.
  - Arming kanhrd's own prefix chord from the bar is a separate gap, recorded
    in the backlog.
- **B — the gesture backlog item is not part of this change.** The terminal
  surface's iOS gesture fix shipped in `92eea2f` and the operator has
  confirmed it on a phone. The bar owns only its own gestures (`touch-action:
  pan-x`).
- **C — the strip is never blank.** It doubles as a status line and shows a
  latched modifier while collapsed.
  - Copy, the keycap form, accessible names, the three-state tokens and the
    strip height stay with the maintainer.
  - The build uses existing tokens and no new words; see `design.md`, _As
    built_.
- **Keycap labels are exempt** from `docs/DESIGN-SYSTEM.md`'s entity-glyph
  ban. The document now says so.
- **Foreman rulings:**
  - the row scrolls inside itself, in the order `esc ctrl ^B tab ↑ ↓ ← → alt`
    (nine cells need 424px; 374px are available at 390px);
  - a 40px strip hit area extends over the terminal's bottom edge;
  - the terminal shrinks by the bar's height plus the keyboard's occlusion;
  - the first visit is expanded under `(any-pointer: coarse)`;
  - v1 has no dismiss-keyboard cell;
  - a multi-character soft-keyboard chunk takes the modifier on its first
    character only.

## Impact

- **Affected specs:** new capability `terminal-key-bar`.
- **Affected code:** new `pane-detail/key-bar.{ts,html,scss}`,
  `pane-detail/key-bar-cells.ts` (the cell model and the v1 list),
  `state/terminal-key-bar.service.ts`, `pane-detail/pane-terminal.ts` (sticky
  modifiers on soft-keyboard input, a send path for cells),
  `pane-detail/pane-detail.{ts,html,scss}` (mounting the bar, reserving
  space),
  `settings/settings.ts` (clear-data row), `shared/copy.ts`, and
  `apps/web/src/index.html` (`interactive-widget`, `viewport-fit`).
- **Affected docs:** `docs/BRAND.md` (the clear-data row),
  `docs/UX-GUIDELINES.md` (the bar under Mobile and Pane detail, new e2e
  assertions), `docs/DESIGN-SYSTEM.md` (the keycap exemption; tokens remain
  the maintainer's).
- **No change to:** the wire, the bridge, `host-keybinds-passthrough`,
  `state/keyboard.service.ts`, or the icon list.
