# keyboard-shortcuts Specification

## Purpose
tmux-style prefix-chord keyboard navigation for the kanhrd SPA, mirroring
herdr's own keyboard-first conventions, plus a discoverable help overlay.
## Requirements
### Requirement: Prefix chord gates all bound actions
The SPA SHALL require a configurable prefix key (default `Ctrl+B`) pressed
and released before an action key is recognized, within a 2 second window.
Only `?` (help) and `Escape` (close overlay/menu) SHALL be recognized
without the prefix.

#### Scenario: Action key alone does nothing
- **WHEN** a user presses `n` without first pressing the prefix
- **THEN** no bound action fires

#### Scenario: Chord times out
- **WHEN** a user presses the prefix and waits longer than 2 seconds before pressing an action key
- **THEN** the chord is no longer armed and the action key is not recognized as part of a chord

### Requirement: Shortcuts are suppressed while an input has focus
The SPA SHALL NOT intercept the prefix or any bound action key while a
focusable input element, including xterm.js's hidden helper textarea, has
focus. Keystrokes SHALL reach the focused element unmodified.

There SHALL be exactly one exception: a short, explicitly enumerated list
of **direct chords** that are recognized even while an input has focus.
The list SHALL live in a single named constant in `KeyboardService`, so
that every key kanhrd takes away from a running program can be read, and
removed, in one place. A chord SHALL only be added to that list when the
action it triggers is unreachable any other way from inside a live
terminal.

Every chord on that list SHALL use the `Ctrl+Alt` modifier family, which
herdr's own keyboard documentation identifies as the one family
terminals, macOS option-composition and desktop environments leave free,
and SHALL avoid the chords herdr publishes as taken
(`Ctrl+Alt+` arrows, `t`, `l`, `a`, `s`, `u`, `F1`–`F12`).

At the introduction of this exception the list holds exactly one entry:
`Ctrl+Alt+I`, which focuses the pane-detail card switcher (see the
`terminal-top-bar` capability).

The effective prefix SHALL always win: if the effective prefix — whether
the user's override or the herdr-mirrored default — equals a chord on the
list, that chord SHALL NOT be recognized and the keystroke SHALL arm the
prefix instead.

A listed chord SHALL only be acted on when its action is actually
available in the current view. When it is not, the SPA SHALL call neither
`preventDefault()` nor `stopPropagation()`, so the keystroke reaches the
focused element unmodified — the same treatment any unrecognized key
gets.

Listed chords SHALL appear in the keyboard help overlay alongside every
other binding, so a key the terminal no longer receives is discoverable
rather than folklore.

#### Scenario: Ctrl+B reaches a focused terminal instead of arming the prefix
- **WHEN** a user has a pane-detail terminal focused and presses the default prefix `Ctrl+B`
- **THEN** the keystroke is sent to the terminal (verifiable via the herdr CLI showing no keyboard-service side effect) and the prefix chord does not arm

#### Scenario: An unlisted chord still reaches a focused terminal
- **WHEN** a user has a pane-detail terminal focused and presses a
  `Ctrl+Alt` chord that is not on the list, such as `Ctrl+Alt+K`
- **THEN** the keystroke is sent to the terminal and no kanhrd action
  fires

#### Scenario: A listed chord is recognized despite the focused terminal
- **WHEN** a user has a pane-detail terminal focused, the card switcher
  is available, and the user presses `Ctrl+Alt+I`
- **THEN** the switcher takes focus, the keystroke is not sent to the
  pane, and both `preventDefault()` and `stopPropagation()` are called

#### Scenario: A listed chord whose action is unavailable is passed through
- **WHEN** a user has a pane-detail terminal focused on a card that is
  the only pane in its tab, and presses `Ctrl+Alt+I`
- **THEN** the keystroke is sent to the terminal, and neither
  `preventDefault()` nor `stopPropagation()` is called

#### Scenario: The prefix outranks a listed chord
- **WHEN** the effective prefix is `Ctrl+Alt+I` and the user presses it
  with no input focused
- **THEN** the prefix chord arms and the switcher is not focused

### Requirement: Help overlay is reachable without the prefix
The SPA SHALL open a keyboard help overlay, grouped by category
(Navigation, Lifecycle, View, Help), when `?` is pressed outside a focused
input, and SHALL close it on `Escape`.

#### Scenario: Help overlay lists all current bindings by category
- **WHEN** a user presses `?`
- **THEN** the overlay opens and shows every bound action grouped under its category

### Requirement: Prefix key is user-rebindable and persists
The SPA SHALL let a user change the prefix key in Settings and SHALL
persist that choice to `localStorage['kanhrd.keyboard']`, surviving a
reload. Individual action-key bindings are not rebindable in this
capability.

#### Scenario: Rebound prefix survives reload
- **WHEN** a user sets a new prefix in Settings and reloads the page
- **THEN** the new prefix, not `Ctrl+B`, is required to arm the chord

### Requirement: Prefix and bound action keys win over page-level capture-phase interception
The SPA SHALL attach its global keydown handling in the **capture phase**
at `window` (the highest node in the document tree), not the bubble phase,
so that the prefix keystroke and any bound action key it recognizes are
seen before a page-level script or browser extension's own capture-phase
listener attached at `document` or a descendant node can consume it. When
the handler recognizes and acts on a key (arms the prefix, or dispatches a
bound chord/non-chord action) it SHALL call both `preventDefault()` and
`stopPropagation()` on that event. When it does not recognize a key, it
SHALL call neither, leaving the event completely untouched for the page,
the focused element, or an extension to handle normally.

#### Scenario: The prefix wins over a capture-phase extension listener that binds the same key
- **WHEN** a browser extension (e.g. one binding `Ctrl+B` to a scroll
  command) has installed a `document`-level (or lower) capture-phase
  keydown listener that calls `stopPropagation()` on a matching key
- **AND** the user presses the configured prefix (default `Ctrl+B`) with no
  input focused
- **THEN** the SPA's `window`-level capture-phase listener still arms the
  prefix chord, because capture-phase dispatch runs `window` before
  `document` regardless of which listener was registered first

#### Scenario: Unrecognized keys are left completely alone
- **WHEN** the user presses a key that is neither the prefix, an armed
  chord's bound action key, nor a bare `?`/`Escape`
- **THEN** the SPA calls neither `preventDefault()` nor `stopPropagation()`
  on that keydown, so it still reaches the focused element, the page, and
  any browser extension unmodified

#### Scenario: A focused terminal is unaffected by the capture-phase change
- **WHEN** a pane-detail terminal (xterm.js) has focus and the user presses
  the prefix
- **THEN** the SPA's capture-phase handler recognizes the focused input via
  `isTextInputFocused` and returns without calling `preventDefault()` or
  `stopPropagation()`, so xterm.js's own listener on the terminal element
  still receives the raw keystroke exactly as before this change

