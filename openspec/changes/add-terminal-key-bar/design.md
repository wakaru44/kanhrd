# Design — add-terminal-key-bar

## What herdr accepts, measured

Against a throwaway `kanhrd-test-*` session (herdr 0.8.2), `herdr pane
send-keys` into a pane running `od -c`:

| sent         | the pane's program received |
| ------------ | --------------------------- |
| `ctrl+b`     | `002`                       |
| `alt+x`      | `033 x`                     |
| `shift+tab`  | `033 [ Z`                   |
| `esc`        | `033`                       |
| `tab`        | `\t`                        |
| `up`, `left` | `033 [ A`, `033 [ D`        |
| `ctrl+alt+b` | `033 002`                   |

Three consequences:

- Modifiers compose in the key name. A cell or a latch never needs byte
  sequences, and DECCKM application-cursor mode stays herdr's problem.
- `key-mapping.ts` already sends `Escape`, `Up` and so on. herdr accepts both
  spellings (its help: "`esc` as the canonical Escape key name; `escape` is
  also accepted").
- A key sent this way goes to the program in the pane, not to herdr's
  keybinding layer. That is the fact behind recommendation A in the proposal.

## The cell model — built for v2 from v1

```ts
/** Every cell is data. The template renders a list of these; it never names a key. */
type KeyBarCell =
  | { kind: 'keys'; id: string; label: string; keys: readonly string[] } // a sequence of herdr key names
  | { kind: 'modifier'; id: string; label: string; modifier: 'ctrl' | 'alt' };

export const DEFAULT_KEY_BAR_CELLS: readonly KeyBarCell[] = [ /* v1's fixed list */ ];
```

- A `keys` cell holds a sequence. v1's cells are all one key long. A composite
  such as `['ctrl+b', 'c']` is the same shape. Sending a `keys` cell is one
  `pane.send_keys` with the whole array, through `PaneTerminal`'s existing
  ordered queue.
- The bar component takes `cells: readonly KeyBarCell[]` as an input and
  renders it with `@for`. v1 passes `DEFAULT_KEY_BAR_CELLS`. v2 passes a
  stored, operator-edited list and adds an editor. Renderer, state machine
  and transport stay as they are.
- `id` is stable, so a v2 list can be persisted and reordered, and tests
  address cells by id, not by label.
- The model lives in `pane-detail/key-bar-cells.ts`; the bar is
  `pane-detail/key-bar.ts`.

## Modifier state machine

Per modifier: `idle → armed` on tap; `armed → idle` on tap; `idle | armed →
locked` on long-press; `locked → idle` on tap. This is Termux's model
([ExtraKeysView.java], [TerminalExtraKeys.java]).

- **Long-press threshold:** 400 ms, Termux's fallback.
- **When a key event goes out** (a `keys` cell, or a character typed on the
  soft keyboard), every armed or locked modifier is folded into the first key
  name of that event.
  - Tokens are ordered `ctrl+alt+…`, de-duplicated against modifiers the name
    already carries.
  - Afterwards armed modifiers return to idle; locked ones stay locked.
- **No timeout on a latch.** A timed latch misfires while the operator reads
  the screen between taps (research §5).
- **Soft-keyboard text.** A single character becomes the key name
  `ctrl+<char>`, so it goes through `pane.send_keys` instead of
  `pane.send_text`. A multi-character chunk (a paste, an autocorrect
  replacement) takes the modifier on its first character only; the rest goes
  as text. Rare, and stated rather than guessed.
- **Where the state lives:** a small state object owned by `PaneDetail` and
  handed to both the bar (to render it) and `PaneTerminal` (to fold it into
  outgoing input). It is not a root service: it is view state, and leaving the
  pane resets it to idle.

## The `^B` cell — a literal Ctrl+B, and why it does not follow the prefix

Operator ruling, 2026-09-13. The cell is `{ kind: 'keys', label: '^B',
keys: ['ctrl+b'] }`. It sends Ctrl+B to whatever runs in the pane — tmux,
vim, readline — and it deliberately does **not** follow
`KeyboardService.prefix()`.

Read this before "fixing" it to follow the prefix:

- `pane.send_keys` reaches the pane's program, never herdr's own prefix
  layer (measured above), so a cell that "sends the herdr prefix" cannot do
  anything herdr-ish. It can only ever be a key for the program inside.
- An operator who moved herdr's prefix — to `Ctrl+Space`, say — usually did
  so to free `Ctrl+B` for tmux running inside a pane. A cell that followed
  `prefix()` would send `Ctrl+Space` to that tmux, and take away exactly the
  key they moved out of the way.

kanhrd's own prefix shortcuts (next tab, next card, …) are a different
thing. They are unreachable on a phone today, which is a real gap. It is
recorded in `openspec/incoming/backlog.md` (_kanhrd's prefix shortcuts are
unreachable from a phone_), and the bar is the natural surface for it. It is
not this cell.

## Placement — the visual viewport

`position: fixed; bottom: 0` resolves against the layout viewport, which does
not shrink for the soft keyboard on iOS Safari, nor on Chrome Android since
108 ([MDN VisualViewport], [Chrome viewport-resize-behavior]). So:

- **Transform, not `bottom`.** The bar stays `position: fixed; bottom: 0` and
  takes `translateY(-occluded)`, where `occluded = max(0, innerHeight −
  (visualViewport.height + visualViewport.offsetTop))`. It is recomputed on
  `visualViewport` `resize` **and** `scroll`: iOS slides the layout viewport,
  changing `offsetTop` without changing `height`.
  - Also recomputed on `focusout`, on window `resize`, and on one delayed
    animation frame, and clamped at 0. That covers the reported (not
    primary-sourced) `offsetTop` that fails to return to 0 after dismissal.
- **`interactive-widget=resizes-content`** is added to the viewport meta.
  - Chrome Android 108+ honours it, and the formula then computes 0.
  - iOS ignores it, where the formula does the work ([MDN viewport meta],
    [WebKit standards-positions #65]).
  - Minimum iOS for the transform path: 13 ([WebKit 198347]).
- **Safe area.** `viewport-fit=cover` is added.
  - Keyboard closed: the bar pads by `env(safe-area-inset-bottom)`.
  - Keyboard open (`occluded > 0`): the padding is 0. Otherwise the inset is
    counted twice and a dead gap opens between bar and keyboard.
  - No source documents the inset while the keyboard is up, so this is a
    device-verification task, not an assumption (research §6.5;
    [WebKit 192564]).
  - Landscape: `env(safe-area-inset-left/right)` join the side gutters.
- **Reserving space.**
  - `PaneDetail` publishes the bar's current height, plus `occluded`, as a CSS
    custom property. `.terminal-container` gives up that much at its bottom.
  - The existing `ResizeObserver` refits xterm, which is client-side only.
    `pane.resize` stays unsupported and the pane keeps its own size.
  - Fewer rows scroll the viewport to the tail, so the prompt shows above the
    bar and above the keyboard.
- **The bar persists** whether the soft keyboard is up or not. Termux, Prompt
  and iSH decouple the two; Termius 7.6.0 and ShellFish put a dismiss-keyboard
  control on the bar (research §6.7). With the keyboard down, the operator
  still has Esc and the arrows. A dismiss-keyboard cell is not in v1: it is
  not in the operator's key set. It is a natural v2 cell.

## Focus and touch

- **`preventDefault()` on `pointerdown`,** on every bar button and on the
  strip. Focus is pointerdown's default action, and by `click` it has already
  moved and the keyboard has dismissed ([MDN HTMLElement.focus()]).
- **Cells act on `pointerup`, not `pointerdown`.** The proposal said
  pointerdown. The build changed it because the row scrolls horizontally at
  phone width: a pan that starts on a key would otherwise send that key. A
  pan fires `pointercancel`, which drops the press. Focus is still protected,
  because it is the `pointerdown` default that is cancelled.
- **Keyboard activation:** a `click` with `detail === 0` activates a key or
  the strip, so the bar works without a pointer. A pointer's own trailing
  `click` (`detail >= 1`) is ignored, since `pointerup` already acted.
- **Every button is `type="button"`** and keeps its tab stop. `tabindex="-1"`
  is not the fix and would cost keyboard access.
- **The bar is `touch-action: pan-x`.**
  - It keeps horizontal scrolling of an overflowing row.
  - A vertical drag started on the bar is never handed to the page. Otherwise
    that drag could still become pull-to-refresh, and `overscroll-behavior`
    on a non-scroll-container is inert ([MDN overscroll-behavior],
    [MDN touch-action]).
  - It does not use `manipulation`, which would re-enable vertical panning.
- **`user-select: none`,** so repeated taps never start a selection.
- **Scope:** the terminal surface's own gesture handling is untouched (see B
  in the proposal).

## Accessibility

- **Modifier cells:** `aria-pressed="true"` when armed or locked, plus an
  accessible description that distinguishes locked. The wording is copy.
- **Arrow cells:** an accessible name, since `↑` is not one.
- **The strip:** a `button` with `aria-expanded` and `aria-controls` naming
  the row.
- **Visibility:** the state is visible without hover in every case.

## Showing the bar

- **Where:** the bar renders on the pane-detail route at every width. Nothing
  detects "mobile": `pointer` and `hover` report wrongly on iOS Safari, some
  Android phones, ChromeOS and Windows ([browser-compat-data #24451]).
- **First visit, before anything is stored** — recommended: expanded when
  `(any-pointer: coarse)` matches, collapsed otherwise. Only a guess at the
  starting position; the strip is the real control. Open for the maintainer.

## Testing

- **Unit:**
  - the modifier state machine, including the long-press threshold;
  - folding modifiers into key names and soft-keyboard characters;
  - the cell list rendering as data;
  - prefix label derivation;
  - the `occluded` formula with injected viewport numbers;
  - persistence and the clear-data row.
- **Component:** tapping a cell calls `pane.send_keys` with the cell's
  sequence, and focus stays on xterm's textarea.
- **e2e, mocked (`viewport-matrix`):**
  - at 390 × 844 every cell and the strip's hit area are at least 40 × 40;
  - the row scrolls inside itself;
  - the document never scrolls horizontally;
  - the terminal box ends above the bar.
- **e2e, live against the isolated session:** `esc`, an arrow and armed
  `ctrl` + `c` arrive at the pane.
- **Real device, recorded honestly:** iPhone Safari, iPhone Chrome and the
  installed PWA — the keyboard-pinned position, the safe-area gap, focus
  retention. Playwright cannot raise a soft keyboard.

## As built — provisional choices awaiting the maintainer

The operator ruled that copy, the keycap form, accessible names, the
three-state tokens and the strip height stay with the maintainer. The build
needed something in each place, so it uses what already exists and invents
no words and no tokens:

- **Strip at rest:** the row's own keycaps, `esc ctrl ^B tab ↑ ↓ ← → alt`,
  in `--font-mono` `--fs-caption` `--ink-mute`. It is not blank and it is
  not a sentence. A maintainer-approved label can replace it in one place.
- **Strip while latched:** the latched modifiers' keycaps, in their armed or
  locked treatment.
- **Accessible names:** a glyph key is named by the herdr key names it sends
  (`up`, `ctrl+b`); modifiers use their visible text. `aria-pressed` is true
  for both armed and locked, so a screen reader cannot yet tell the two
  apart. That gap needs copy.
- **Tokens:** the strip height is `--sp-5`.
  - idle — the secondary button (`--paper-raised`, `--ink`, `--elev-3`)
  - armed — `--fw-semi` with a 2px `--ochre-line` underline, the switcher's
    selected treatment
  - locked — armed plus the `--ochre-tint` wash
  - The three differ in weight, underline and wash, not in colour alone.
- **Clear-data row:** `settings.clearTerminalKeyBar` = `terminal key bar`.
  It follows the list's approved noun-phrase pattern and is registered in
  `docs/BRAND.md`.
- **The strip's hit area:** a `::before` 40px tall, anchored to the strip's
  bottom, reaching up over the terminal. **Cost:** roughly the terminal's
  bottom 20px no longer takes taps or swipes. The operator set the visual
  height and the guidelines set the hit area; the two are different
  measurements (foreman ruling).
- **`z-index: 30`:** above the terminal and the board chrome, below the
  drawer (40/50) and modals (1000).

## Sources

[ExtraKeysView.java]: https://github.com/termux/termux-app/blob/master/termux-shared/src/main/java/com/termux/shared/termux/extrakeys/ExtraKeysView.java
[TerminalExtraKeys.java]: https://github.com/termux/termux-app/blob/master/termux-shared/src/main/java/com/termux/shared/termux/terminal/io/TerminalExtraKeys.java
[MDN VisualViewport]: https://developer.mozilla.org/en-US/docs/Web/API/VisualViewport
[Chrome viewport-resize-behavior]: https://developer.chrome.com/blog/viewport-resize-behavior
[MDN viewport meta]: https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/meta/name/viewport
[WebKit standards-positions #65]: https://github.com/WebKit/standards-positions/issues/65
[WebKit 198347]: https://bugs.webkit.org/show_bug.cgi?id=198347
[WebKit 192564]: https://bugs.webkit.org/show_bug.cgi?id=192564
[MDN HTMLElement.focus()]: https://developer.mozilla.org/en-US/docs/Web/API/HTMLElement/focus
[MDN overscroll-behavior]: https://developer.mozilla.org/en-US/docs/Web/CSS/overscroll-behavior
[MDN touch-action]: https://developer.mozilla.org/en-US/docs/Web/CSS/touch-action
[browser-compat-data #24451]: https://github.com/mdn/browser-compat-data/issues/24451

Termius iOS changelog (6.1.0 sticking modifiers, 6.3.0 Shift+Tab, 7.6.0
hide-keyboard): <https://docs.termius.com/changelog/ios>
