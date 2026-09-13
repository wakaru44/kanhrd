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

## iOS device rounds (task 6.4)

### What failed, 2026-09-13

- **iPhone:** with the soft keyboard up, the bar is placed above the keyboard
  and the strip's keycaps are visible. iOS Safari's own input accessory bar
  is drawn over the key row, and several cells cannot be seen or reached. That
  accessory bar is a white AutoFill pill (passwords, card and location icons)
  plus the round keyboard-dismiss button.
- **Android:** the operator reports it clean.

These are two problems, kept apart.

1. **The AutoFill pill** may be ours to remove. xterm 6.0.0 sets
   `autocapitalize`, `autocorrect` and `spellcheck` on its helper textarea but
   not `autocomplete`. What Safari honours is unverified:
   - WebKit maps an element's autocomplete `off` state to the autofill field
     name `off` ([WebKit Autofill.cpp], [WebKit aa8945d]). That does not show
     the iOS accessory bar consults it.
   - Developer reports say Safari's heuristics override `autocomplete="off"` on
     some fields ([Apple forums 764041]).
   - So `off` is an experiment, measured on the device, and not a fix
     assumed from the attribute.
2. **Apple's accessory bar itself** is not ours to remove. A web page has no
   API to hide the iOS input accessory view or its dismiss control. The fix
   is to stop colliding with it.

### Round 1 results — Chrome on iOS, not Safari

Both readouts were taken in **Chrome on iOS** (`CriOS/153.0.8010.24`,
`iPhone OS 26_6_2`). The operator's original report was most likely Chrome as
well. On iOS the accessory bar is drawn by the host app, so none of this is
yet known to hold for Safari.

| readout                    | innerHeight | vv.height | vv.offsetTop | occluded (max) | bar.top / bar.bottom | row.top | focus.bottom | autocomplete |
| -------------------------- | ----------- | --------- | ------------ | -------------- | -------------------- | ------- | ------------ | ------------ |
| 1 `&keybar-autocomplete=absent` | 745    | 434       | 0            | 311 (311)      | 369 / 434            | 390     | 879          | absent       |
| 2 default (`off`)          | 745         | 434       | 83.3         | 228 (346)      | 369 / 434            | 390     | 324          | off          |

**Rejected hypothesis: `autocomplete="off"` removes the AutoFill pill.** The
pill (passwords, card, location) looked identical with the attribute absent
and with `off`. The helper textarea is back to xterm's shipped state (no
`autocomplete`), because the one reason to set it is gone.
`?keybar-autocomplete=<value>` remains only as an experiment switch. No
further attribute experiments are planned.

**The readout lagged the placement — a probe bug, checked in code.**
- In both readouts `bar.top`/`bar.bottom` are the same numbers under two
  different `occluded`. The foreman's arithmetic showed readout 2's
  `bar.bottom` is 83.3 short of `innerHeight − occluded`, exactly
  `vv.offsetTop`.
- The round-1 `sample()` read `getBoundingClientRect()` in the same call that
  set `occluded`. The `[style.transform]` host binding only applies on the
  next change-detection pass, so the rect was always one placement behind
  the value printed beside it. Readout 2's numbers fit a bar last placed at
  `occluded` 311.
- The formula itself is consistent: `745 − (434 + 83.3) = 227.7`, which puts
  the bar's bottom at 517.3, the visual viewport's bottom.
- A second explanation was not ruled out in round 1: that iOS reports
  `getBoundingClientRect` relative to the visual viewport rather than the
  layout viewport, which alone would make `bar.bottom` 434 in both.
- **What these numbers do not show:** whether the bar was misplaced. They
  show only that the round-1 readout could not tell. Round 2's probe reads
  after render and records the coordinate space.

**What changed between the original report and round 1.** In round 1 the key
row was fully visible and the AutoFill pill sat below it, where the original
report had the pill over the row.
- Only one change between `4fdf429` and `f133c44` affects placement: a
  `focusin` listener that re-measures 350 ms after focus moves, i.e. after
  the keyboard's opening animation.
- It went in with the probe commit. It was not scoped or tested as a fix.
- The likely reading: before it, the last visualViewport event during the
  keyboard animation left a stale `occluded`, so the bar sat too low and
  the pill covered it.
- **Status:** a hypothesis. Round 2 tests it with a switch that disables
  the re-measure, so a regression is detected by measurement, not rediscovered.

### Round 2 — a probe that can answer

- **Sampled after render.** The readout is taken two animation frames after
  each placement, and prints the `transform` actually on the bar.
- **Coordinate space.** An untransformed zero-height element sits at the
  layout viewport's `bottom: 0`. If `marker.bottom` equals `innerHeight`,
  rects are layout-viewport relative. If it equals `innerHeight −
  vv.offsetTop`, they are visual-viewport relative. Its padding also measures
  `env(safe-area-inset-bottom)`.
  - In desktop Chromium, `marker.bottom` and `bar.bottom` both read 844 at
    844 × 390 (asserted in `e2e/key-bar.spec.ts`).
- **A timeline.** The last eight placements, newest first, each with the
  listener that caused it (`vv.resize`, `vv.scroll`, `window.resize`,
  `settle`, `observer`, `init`) and the numbers it used. This answers
  whether the scroll listener fires on iOS and in what order.
- **A ruler.** Ticks every 16 CSS px above the bar's bottom edge, at the
  right-hand side. Wherever Apple's bar reaches is read off a screenshot. That
  is the one measurement nothing in the API exposes, and it decides whether a
  fallback lift is measured or guessed.
- **Extra numbers:** `clientHeight`, `outerHeight`, `screen.height`, and
  whether the VirtualKeyboard API exists (expected absent: every iOS browser is
  WebKit).
- **`?keybar-nosettle=1`** turns off the re-measure after focus moves. It is
  the controlled test for what changed between the original report and
  round 1.

### What is unknown, and why this is a measurement

No primary source states whether `visualViewport.height` on iOS Safari
excludes the accessory bar or only the keys. Two things point the same way
without proving it:

- the screenshot shows the strip clear and the row covered, so the overlap is
  about one row high;
- Apple's own report of iOS 26.0–26.0.1 notes that the autofill panel was
  missing from the keyboard frame UIKit reported, fixed in 26.1
  ([Apple forums 801685]).

Neither is Safari's visual viewport, so neither is treated as fact here.

### Round 1 — a measurement build

Two URL switches, both off unless asked, both temporary
(`pane-detail/key-bar-probe.ts`):

- `?keybar-debug=1` — a readout pinned to the top of the visual viewport:
  - `innerHeight`, `visualViewport.height / offsetTop / scale` and their
    bottom;
  - the computed `occluded`, and its maximum so far;
  - the bar's and the row's top and bottom;
  - the focused element and its bottom;
  - the helper textarea's `autocomplete`, and the user agent.
- `?keybar-autocomplete=absent|<value>` — leaves the helper textarea
  unmarked, or sets it. The default in this build is `off`: harmless on
  Android, and the first thing to test on iOS.

### The fix that follows, depending on round 1

- **If `vv.bottom` equals `bar.bottom` and Apple's bar still covers the
  row:** the visual viewport does not exclude the accessory bar. The extra
  height has to come from somewhere measurable. If nothing in the readout
  moves with it, the fallback applies.
- **If `bar.bottom` sits below `vv.bottom`:** the placement math is wrong on
  iOS (`offsetTop`, scale, or the transformed containing block). That is a
  bug in our code, fixed directly.
- **The fallback, if the height cannot be derived:** while the keyboard is up
  on a browser that does not resize the layout viewport (`occluded > 0`, which
  is iOS and never Android under `interactive-widget=resizes-content`), the
  bar lifts by a fixed margin.
  - The margin is the largest accessory height measured across the rounds
    (pill, predictive text, bare dismiss row), recorded here with the device
    and iOS version it came from.
  - The gate is the layout viewport not resizing, not the user agent, so
    Android stays a no-op by construction.
  - The cost, stated rather than hidden: on an iPhone with a shorter
    accessory bar, a band of dead space opens between our bar and Apple's.

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
[WebKit Autofill.cpp]: https://github.com/WebKit/webkit/blob/main/Source/WebCore/html/Autofill.cpp
[WebKit aa8945d]: https://github.com/WebKit/WebKit/commit/aa8945d7e8f05e48e56e2a49da697d8fe0e98122
[Apple forums 764041]: https://developer.apple.com/forums/thread/764041
[Apple forums 801685]: https://developer.apple.com/forums/thread/801685

Termius iOS changelog (6.1.0 sticking modifiers, 6.3.0 Shift+Tab, 7.6.0
hide-keyboard): <https://docs.termius.com/changelog/ios>
