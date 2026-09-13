# Tasks — add-terminal-key-bar

## 0. Decisions (ruled 2026-09-13)

- [x] 0.1 A: `^B` sends a literal `ctrl+b` to the pane and never follows
      `prefix()` (operator). Arming kanhrd's chord from a phone is a backlog
      entry.
- [x] 0.2 C: the strip is never blank and doubles as a status line
      (operator). Copy, keycap form and accessible names stay with the
      maintainer; the build shows keycaps and adds no words.
- [x] 0.3 Keycap labels are exempt from the entity-glyph ban, and
      `docs/DESIGN-SYSTEM.md` says so (operator). The three-state tokens and
      the strip height stay with the maintainer; the build uses existing
      tokens.
- [x] 0.4 A 40px strip hit area over the terminal's bottom edge (foreman).
- [x] 0.5 The row scrolls inside itself, `esc ctrl ^B tab ↑ ↓ ← → alt`
      (foreman).
- [x] 0.6 First visit expanded under `(any-pointer: coarse)` (foreman).
- [x] 0.7 Moot: no prefix chord in this change.

## 1. Model

- [x] 1.1 `KeyBarCell` union and `DEFAULT_KEY_BAR_CELLS`; the bar renders
      whatever list it is given.
- [x] 1.2 Modifier state machine (tap arms/disarms, 400 ms long-press locks,
      tap unlocks) and folding modifiers into herdr key names.
- [x] 1.3 `state/terminal-key-bar.service.ts`: expanded/collapsed under a
      `kanhrd.*` key, defensive load.

## 2. Sending

- [x] 2.1 A `keys` cell sends its sequence through `PaneTerminal`'s ordered
      `pane.send_keys` queue.
- [x] 2.2 Armed/locked modifiers apply to the next soft-keyboard character.
- [x] 2.3 The `^B` cell, per 0.1: a keys cell, `['ctrl+b']`.

## 3. Placement and space

- [x] 3.1 Fixed bar with the visualViewport transform (`resize` + `scroll`,
      plus the defensive recomputes), clamped at 0.
- [x] 3.2 `interactive-widget=resizes-content` and `viewport-fit=cover` in
      `index.html`; safe-area inset only while the keyboard is closed.
- [x] 3.3 The terminal container gives up the bar's height and the keyboard's
      occlusion; xterm refits.

## 4. Touch and focus

- [x] 4.1 `preventDefault` on `pointerdown` for every cell and the strip;
      cells act on `pointerup`, so a pan across the scrolling row sends
      nothing (see `design.md`).
- [x] 4.2 `touch-action: pan-x` and `user-select: none` on the bar.
- [x] 4.3 ARIA: `aria-pressed` on modifiers, names on glyph cells,
      `aria-expanded`/`aria-controls` on the strip. The locked description
      needs copy and is not built; a screen reader hears armed and locked
      alike.

## 5. Settings and docs

- [x] 5.1 The key bar joins the clear-local-data preview list.
- [x] 5.2 `docs/UX-GUIDELINES.md`: the bar under Mobile → Pane detail, its
      touch-target and overflow rules, and new e2e assertions.

## 6. Verify

- [x] 6.1 Unit and component tests per `design.md`.
- [x] 6.2 Mocked e2e at 390 × 844: targets, overflow, terminal box above the
      bar.
- [x] 6.3 Live e2e against the isolated session: `esc`, `↑` and armed
      `ctrl` + `←` arrive at the pane's program as `^[`, `^[[A`, `^[[1;5D`
      (`e2e/key-bar-live.spec.ts`).
- [ ] 6.4 Real device. **Record what was tested, on which device and iOS or
      Android version, and what was not.**
  - [x] Android (operator, 2026-09-13): bar placement and keys reported
        clean. Device, browser and Android version not yet recorded.
  - [ ] iPhone Safari (operator, 2026-09-13): FAILING. iOS's input
        accessory bar (AutoFill pill + dismiss button) is drawn over the key
        row; the strip is clear. iOS version not yet recorded.
  - [x] Round 1 (operator, 2026-09-13, **Chrome on iOS 26.6.2, not
        Safari**): `autocomplete="off"` does not remove the AutoFill pill
        (rejected). The key row was fully visible with the pill below it. The
        readout's bar rect lagged the placement by one render (a probe bug),
        so round 1 cannot say whether the bar was placed right. Readouts in
        `design.md`.
  - [ ] Round 2: the fixed probe (read after render, coordinate marker,
        event timeline, ruler, `?keybar-nosettle`) on iPhone **Safari** and
        Chrome, and once on Android.
  - [ ] Round 2: the fix chosen from round 1 (derived height, placement bug,
        or the documented iOS margin), verified on the same iPhone and
        re-checked on Android.
  - [ ] Not yet tested: iPhone Chrome, the installed PWA, landscape, the
        predictive-text bar, and the notched safe-area gap with the keyboard
        closed.
  - [ ] Remove `pane-detail/key-bar-probe.ts` and its hooks once the rounds
        settle.
- [x] 6.5 Web tests, `pnpm -w typecheck`, `make lint`.
