# Tasks — add-terminal-key-bar

## 0. Blocked on operator and maintainer decisions

- [ ] 0.1 A: the prefix cell arms kanhrd's prefix chord (recommended) or
      sends a fixed `ctrl+b` to the pane.
- [ ] 0.2 C: copy for the strip at rest, its armed/locked state, every
      accessible name, the prefix keycap form, and the clear-data row —
      recorded in `docs/BRAND.md`.
- [ ] 0.3 Design tokens for idle / armed / locked and for the strip's height,
      in `docs/DESIGN-SYSTEM.md`, plus a note that keycap glyph labels are not
      the prohibited entity glyphs.
- [ ] 0.4 The strip's 40px hit area extending over the terminal's bottom edge.
- [ ] 0.5 The expanded row scrolls horizontally at narrow widths, in the
      order `esc ctrl prefix tab ↑ ↓ ← → alt`.
- [ ] 0.6 First-visit state: expanded under `(any-pointer: coarse)`, else
      collapsed.
- [ ] 0.7 A chord armed from the bar has no timeout.

## 1. Model

- [ ] 1.1 `KeyBarCell` union and `DEFAULT_KEY_BAR_CELLS`; the bar renders
      whatever list it is given.
- [ ] 1.2 Modifier state machine (tap arms/disarms, 400 ms long-press locks,
      tap unlocks) and folding modifiers into herdr key names.
- [ ] 1.3 `state/terminal-key-bar.service.ts`: expanded/collapsed under a
      `kanhrd.*` key, defensive load.

## 2. Sending

- [ ] 2.1 A `keys` cell sends its sequence through `PaneTerminal`'s ordered
      `pane.send_keys` queue.
- [ ] 2.2 Armed/locked modifiers apply to the next soft-keyboard character.
- [ ] 2.3 The prefix cell, per 0.1, including a keydown-free path into
      `KeyboardService`'s chord.

## 3. Placement and space

- [ ] 3.1 Fixed bar with the visualViewport transform (`resize` + `scroll`,
      plus the defensive recomputes), clamped at 0.
- [ ] 3.2 `interactive-widget=resizes-content` and `viewport-fit=cover` in
      `index.html`; safe-area inset only while the keyboard is closed.
- [ ] 3.3 The terminal container gives up the bar's height and the keyboard's
      occlusion; xterm refits.

## 4. Touch and focus

- [ ] 4.1 `preventDefault` on `pointerdown` for every cell and the strip;
      cells act on `pointerdown`.
- [ ] 4.2 `touch-action: pan-x` and `user-select: none` on the bar.
- [ ] 4.3 ARIA: `aria-pressed` and a locked description on modifiers, names
      on glyph cells, `aria-expanded`/`aria-controls` on the strip.

## 5. Settings and docs

- [ ] 5.1 The key bar joins the clear-local-data preview list.
- [ ] 5.2 `docs/UX-GUIDELINES.md`: the bar under Mobile → Pane detail, its
      touch-target and overflow rules, and new e2e assertions.

## 6. Verify

- [ ] 6.1 Unit and component tests per `design.md`.
- [ ] 6.2 Mocked e2e at 390 × 844: targets, overflow, terminal box above the
      bar.
- [ ] 6.3 Live e2e against the isolated session: `esc`, an arrow and
      `ctrl` + `c` arrive at the pane.
- [ ] 6.4 Real device — iPhone Safari, iPhone Chrome, installed PWA:
      keyboard-pinned position, safe-area gap, focus retained, no
      pull-to-refresh from the bar. Recorded with what was and was not tested.
- [ ] 6.5 Web tests, `pnpm -w typecheck`, `make lint`.
