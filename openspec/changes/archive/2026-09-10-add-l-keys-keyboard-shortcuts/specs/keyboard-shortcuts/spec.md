## Purpose

tmux-style prefix-chord keyboard navigation for the kanhrd SPA, mirroring
herdr's own keyboard-first conventions, plus a discoverable help overlay.

## ADDED Requirements

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

#### Scenario: Ctrl+B reaches a focused terminal instead of arming the prefix
- **WHEN** a user has a pane-detail terminal focused and presses the default prefix `Ctrl+B`
- **THEN** the keystroke is sent to the terminal (verifiable via the herdr CLI showing no keyboard-service side effect) and the prefix chord does not arm

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
