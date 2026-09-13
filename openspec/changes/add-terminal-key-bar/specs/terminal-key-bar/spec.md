## ADDED Requirements

### Requirement: The pane-detail view carries a key bar at the bottom of the visual viewport

The pane-detail route SHALL render a key bar fixed to the bottom of the
visual viewport: directly above the soft keyboard while it is open, and
above the bottom safe-area inset while it is closed, with no gap and no
overlap in either case. The bar SHALL remain present when the soft keyboard
is dismissed. It SHALL NOT be part of the document flow and SHALL NOT live in
the top bar.

The terminal's visible box SHALL end above the bar and above an open soft
keyboard, so the terminal's last row is never hidden behind either.

#### Scenario: The bar rides the soft keyboard

- **WHEN** the soft keyboard opens over the pane-detail view
- **THEN** the bar sits directly above the keyboard and the terminal's last visible row sits above the bar

#### Scenario: The bar outlives the keyboard

- **WHEN** the soft keyboard is dismissed
- **THEN** the bar stays at the bottom of the screen above the safe-area inset, and its keys still send

### Requirement: The key bar is its own toggle, remembered per browser

A collapsed status strip SHALL be visible at all times on the pane-detail
route. Activating it SHALL expand the row of keys; activating it again
SHALL collapse the row. The expanded or collapsed state SHALL persist in this
browser under the `kanhrd.*` namespace and SHALL be named in Settings'
clear-local-data preview. There SHALL be no other control for showing the
bar.

The strip SHALL NOT be blank: it SHALL carry approved copy at rest, and SHALL
show any armed or locked modifier, or an armed prefix, while the row is
collapsed.

#### Scenario: Expanding and remembering

- **WHEN** the operator taps the collapsed strip and reloads the page
- **THEN** the row of keys is expanded after the reload

#### Scenario: A latch is visible while collapsed

- **WHEN** `ctrl` is armed and the operator collapses the bar
- **THEN** the collapsed strip shows that `ctrl` is armed

### Requirement: Cells are data, each a sequence of key events

The bar SHALL render a list of cells supplied as data, never keys named in
its template. A key cell SHALL hold an ordered sequence of herdr key names,
and activating it SHALL send that sequence in one `pane.send_keys` through
the terminal's existing ordered send queue. v1 SHALL supply a fixed list:
`esc`, `tab`, `ctrl`, `alt`, the four arrows and a prefix cell, labelled with
text glyphs and no icons.

#### Scenario: A cell sends its sequence

- **WHEN** the operator taps the `esc` cell
- **THEN** `pane.send_keys` is sent for the pane in view with the cell's key sequence, and no `pane.send_text` is sent

#### Scenario: A composite cell sends every key in order

- **WHEN** the bar is given a cell whose sequence is `["ctrl+b", "c"]` and the operator taps it
- **THEN** one `pane.send_keys` carries `["ctrl+b", "c"]` in that order

### Requirement: Sticky modifiers latch, lock, and always show their state

`ctrl` and `alt` SHALL each be in one of three visually distinct states:
idle, armed or locked. A tap SHALL move idle to armed and armed to idle; a
long-press SHALL lock; a tap on a locked modifier SHALL return it to idle. An
armed or locked modifier SHALL apply to the next key event sent — a key cell
or a character typed on the soft keyboard — after which armed modifiers
return to idle and locked ones stay locked. A latch SHALL NOT time out.

#### Scenario: One-shot latch

- **WHEN** the operator taps `ctrl`, then types `c` on the soft keyboard
- **THEN** `pane.send_keys` carries `ctrl+c`, and `ctrl` returns to idle

#### Scenario: Locked modifier survives several keys

- **WHEN** the operator long-presses `ctrl` and then taps `↑` twice
- **THEN** two `ctrl+up` keys are sent and `ctrl` is still shown locked

#### Scenario: Modifiers compose

- **WHEN** `ctrl` and `alt` are both armed and the operator taps `←`
- **THEN** one key `ctrl+alt+left` is sent and both return to idle

### Requirement: The bar never takes focus or gestures from the terminal

Activating any cell or the strip SHALL NOT move focus away from the
terminal, so an open soft keyboard stays open. Cells SHALL act on pointer
down. A gesture that starts on the bar SHALL NOT scroll or refresh the page.
Every cell and the strip SHALL present a hit area of at least
`--touch-target-min` in both dimensions, and the row SHALL NOT widen the
page; where the cells do not fit, the row scrolls horizontally inside
itself.

#### Scenario: Tapping keeps the keyboard up

- **WHEN** the terminal is focused with the soft keyboard open and the operator taps `tab`
- **THEN** the terminal keeps focus and the keyboard stays open

#### Scenario: At 390px

- **WHEN** the pane-detail view is rendered at 390 × 844 with the row expanded
- **THEN** every cell's hit area is at least 40 × 40 CSS pixels and the document does not scroll horizontally

### Requirement: Bar keys never reach kanhrd's own shortcut handling

Keys sent from the bar SHALL go to the socket directly and SHALL NOT be
dispatched as DOM keyboard events, so kanhrd's prefix-chord handling never
intercepts a key the bar sends to a pane.

#### Scenario: A bar ctrl+b is not captured

- **WHEN** the effective prefix is `Ctrl+B` and the operator sends `ctrl` then `b` from the bar and soft keyboard
- **THEN** the pane receives `ctrl+b` and kanhrd's prefix chord is not armed
