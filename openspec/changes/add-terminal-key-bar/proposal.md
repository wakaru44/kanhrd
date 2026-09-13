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

## Recommendations for the operator (A, B, C)

These are recommendations. Nothing is built until they are ruled on.

**A — the prefix cell.** Measured against an isolated herdr session: a key
sent through `pane.send_keys` reaches the program running in the pane as
bytes (`ctrl+b` arrives as `002`). It never reaches herdr's own prefix layer,
which lives in herdr's interactive client. So a cell that "sends the herdr
prefix" to a pane does nothing herdr-ish. It is a `^B` for whatever runs in
the pane.

The prefix actions the operator knows from herdr (next tab, next card, and
so on) exist in kanhrd as `KeyboardService`'s prefix chord. On a phone that
chord cannot be reached at all today: with the terminal focused,
`handleKeydown` treats every key as typing and disarms the chord.

- **Recommended: the prefix cell arms kanhrd's prefix chord, and labels
  itself from `KeyboardService.prefix()`.** An operator who rebound the prefix
  in herdr or in Settings sees and gets their own. The next key, from the bar
  or the soft keyboard, runs the matching kanhrd shortcut and sends nothing to
  the pane.
- Alternative: a fixed cell that sends `ctrl+b` to the pane, for tmux or a
  nested herdr running inside it. It must not follow `prefix()`: an operator
  who moved herdr to `Ctrl+Space` to free `Ctrl+B` for tmux would get the
  wrong key. In v1 this is still two taps (`ctrl` then `b`), and it is the
  first cell a later editable-list change would offer.
- **Open for the operator:** which of the two the prefix cell is.
- **Captured by kanhrd?** No, in either case. Bar keys go straight to the
  socket and never become a DOM `KeyboardEvent`, so `KeyboardService` never
  sees one. `host-keybinds-passthrough` needs no change.

**B — the gesture backlog item stays a separate change.** "Mobile terminal
scroll and gesture ownership" is about the terminal surface. It already has
the iOS-correct mechanism the research recommends: `touch-action: pan-x
pinch-zoom` on `.terminal-container`, and touch handlers that spend the
vertical axis on `scrollLines` and `preventDefault` the gesture (`92eea2f`,
covered by `terminal-scrollback`'s _Every scroll path keeps working_). What
that item still lacks is verification on a real device (Chrome and Safari on
iPhone, installed PWA), which that commit says is outstanding. The bar owns
only its own strip's gestures. Folding the two together would tie a
verification task to a feature build.

**C — the collapsed strip.** It should never be blank: a blank strip is an
affordance nobody can find (`docs/UX-GUIDELINES.md`, _Visible affordances_).

- **Recommended:** at rest, a short label saying it holds keys.
- While a modifier is armed or locked, or the prefix chord is armed, the
  strip shows that state instead, so a latch is visible with the bar
  collapsed. That is exactly the invisible state Termius 6.1.0 had to fix.
- **Copy:** none is authored here. The label, the state wording and every
  accessible name are for `docs/BRAND.md`.
- **Tokens:** the idle, armed and locked treatments have none in
  `docs/DESIGN-SYSTEM.md`, and neither does the strip's height. Both are for
  the maintainer.

## Conflicts the operator's decisions run into

Flagged here because the build cannot honour both sides at once.

1. **The strip versus the touch target.** A 16–20px strip is under
   `--touch-target-min` (40px), and the operator ruled this a touch surface.
   - **Recommended:** the strip draws at 16–20px, but its hit area is 40px
     tall and extends up over the terminal's bottom edge.
   - **Cost:** about 20px of the terminal's bottom edge stops taking taps and
     swipes.
2. **The row at 390px.** Nine cells of 40px with `--sp-2` between them need
   424px. Eight need 376px. The 390px reference width leaves 374px inside
   `--sp-2` gutters, so neither fits. `alt` does not fit; even without it the
   row is 2px over.
   - **Recommended:** the expanded row scrolls horizontally inside itself,
     never the page — the card switcher's precedent on this route
     (`docs/UX-GUIDELINES.md`, _Pane detail_).
   - **Order:** `esc`, `ctrl`, prefix, `tab`, `↑`, `↓`, `←`, `→`, `alt`. The
     least-used key goes off the end.
3. **Glyph labels versus the icon rule.** `docs/DESIGN-SYSTEM.md` bans
   entity glyphs as UI chrome, and its lint gate checks a listed set. The
   arrows are not in that set. A keycap label is arguably not chrome, but the
   document should say so rather than leave it to a reader. That is a
   maintainer edit.

## Impact

- **Affected specs:** new capability `terminal-key-bar`.
- **Affected code:** new `pane-detail/key-bar.{ts,html,scss}`,
  `pane-detail/key-bar-cells.ts` (the cell model and the v1 list),
  `state/terminal-key-bar.service.ts`, `pane-detail/pane-terminal.ts` (sticky
  modifiers on soft-keyboard input, a send path for cells),
  `pane-detail/pane-detail.{ts,html,scss}` (mounting the bar, reserving
  space), `state/keyboard.service.ts` (a way to arm the prefix chord from the
  bar and run the next key through it, if recommendation A is taken),
  `settings/settings.ts` (clear-data row), `shared/copy.ts`, and
  `apps/web/src/index.html` (`interactive-widget`, `viewport-fit`).
- **Affected docs:** `docs/BRAND.md` (rows once the copy is approved),
  `docs/UX-GUIDELINES.md` (the bar under Mobile and Pane detail, new e2e
  assertions), `docs/DESIGN-SYSTEM.md` (tokens and the glyph note, by the
  maintainer).
- **No change to:** the wire, the bridge, `host-keybinds-passthrough`, or the
  icon list.
