## MODIFIED Requirements

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
`Ctrl+Alt+O`, which focuses the pane-detail card switcher (see the
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
  is available, and the user presses `Ctrl+Alt+O`
- **THEN** the switcher takes focus, the keystroke is not sent to the
  pane, and both `preventDefault()` and `stopPropagation()` are called

#### Scenario: A listed chord whose action is unavailable is passed through
- **WHEN** a user has a pane-detail terminal focused on a card that is
  the only pane in its lane, and presses `Ctrl+Alt+O`
- **THEN** the keystroke is sent to the terminal, and neither
  `preventDefault()` nor `stopPropagation()` is called

#### Scenario: The prefix outranks a listed chord
- **WHEN** the effective prefix is `Ctrl+Alt+O` and the user presses it
  with no input focused
- **THEN** the prefix chord arms and the switcher is not focused
