# terminal-scrollback Specification

## Purpose
A pane's history is only useful if a reader can hold their place in it.
This capability governs how the pane detail view renders the live snapshot
stream so that scrollback painted before an update is still there after it,
and so that a reader scrolled up to read a long table is not returned to
the bottom several times a second by the update mechanism itself.
## Requirements
### Requirement: The live stream and the first paint describe the same pane

Pane detail SHALL request the same `source` and `format` for
`pane.subscribe_output` as it does for the initial `pane.read`, and SHALL
state both explicitly rather than relying on a default at either end. A
live stream narrower than the first paint destroys, on its first frame,
the history the first paint delivered.

#### Scenario: Subscription mirrors the initial read
- **WHEN** pane detail loads a pane
- **THEN** its `pane.read` and its `pane.subscribe_output` both carry `source: "recent"` and `format: "ansi"`

### Requirement: History survives live updates

Scrollback rendered for a pane SHALL remain reachable after any number of
subsequent snapshots for that pane. Rendering a snapshot SHALL NOT clear
content that the snapshot itself still contains.

#### Scenario: Pre-update history is still reachable after several updates
- **WHEN** a pane's history has been painted, and several appending snapshots then arrive
- **THEN** the reader can still scroll back to the first line painted before those updates

#### Scenario: An append is written as an append
- **WHEN** a snapshot begins with the previously rendered snapshot
- **THEN** only the appended remainder is written, and the terminal is not reset

### Requirement: A scrolled-up reader keeps their place

An arriving snapshot SHALL NOT move the viewport of a reader who is
scrolled up. A reader at the tail SHALL continue to follow the tail — that
is what being at the tail means, and freezing them there would hide live
output.

#### Scenario: Appends do not move a scrolled-up reader
- **WHEN** the reader is scrolled up and appending snapshots arrive
- **THEN** the lines on screen are unchanged

#### Scenario: A redraw restores the reader's offset
- **WHEN** the reader is scrolled up and a redraw snapshot arrives
- **THEN** the terminal is repainted and the viewport is returned to the offset it held before the repaint

#### Scenario: A redraw never blanks the screen
- **WHEN** a redraw snapshot arrives
- **THEN** the clear is delivered inside the write (RIS, `\x1bc`) rather than by `Terminal.reset()`, so no composited frame shows an empty terminal

#### Scenario: A reader at the tail follows the tail
- **WHEN** the reader is at the tail and any snapshot arrives
- **THEN** the viewport shows the newest content, without a scroll restore

### Requirement: Every scroll path keeps working

Wheel, keyboard and touch scrolling of the terminal SHALL all remain
functional alongside the above, and the touch handler SHALL keep claiming
the gesture at both scroll boundaries so a swipe past the top of the
scrollback does not become page overscroll.

#### Scenario: All three input paths scroll the buffer
- **WHEN** the reader scrolls the terminal with the wheel, with the keyboard, or by dragging with one finger
- **THEN** the viewport moves through the pane's history in each case

#### Scenario: A swipe past the boundary does not scroll the page
- **WHEN** a one-finger drag continues past the top of the scrollback
- **THEN** the terminal keeps the gesture and the page does not scroll

