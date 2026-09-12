# terminal-scrollback Specification

## Purpose
A pane's history is only useful if a reader can hold their place in it.
This capability governs how the pane detail view renders the live snapshot
stream so that scrollback painted before an update is still there after it,
and so that a reader scrolled up to read a long table is not returned to
the bottom several times a second by the update mechanism itself.
## Requirements
### Requirement: The live stream and the first paint describe the same pane

Pane detail SHALL request the same `source`, `format` and `lines` for
`pane.subscribe_output` as it does for the initial `pane.read`, and SHALL
state all three explicitly rather than relying on a default at either end.
A live stream narrower than the first paint destroys, on its first frame,
the history the first paint delivered — the hazard `packages/schema/src/wire.ts`
records above `pane.subscribe_output` for `source`, and which a narrower
`lines` reproduces exactly: herdr's default depth is 80 lines, so a stream
that names no `lines` cuts a deeper first paint back to 80 on its first
push.

#### Scenario: Subscription mirrors the initial read

- **WHEN** pane detail loads a pane
- **THEN** its `pane.read` and its `pane.subscribe_output` both carry `source: "recent"`, `format: "ansi"` and the same `lines`

#### Scenario: Every request asks for the same depth

- **WHEN** a pane detail view opens and then receives three live snapshots
- **THEN** the initial read and the subscription behind all three snapshots carry the same `lines`, `source` and `format`

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

### Requirement: The scrollback depth is the operator's, bounded by herdr

The depth SHALL be an operator preference, persisted in this browser under
the `kanhrd.*` namespace beside the terminal's other per-operator
preferences, and applied to every terminal. It SHALL be offered as a small
set of steps whose maximum is what herdr will actually serve — 1000 lines
on herdr 0.8.2, measured — and SHALL NOT offer a depth herdr does not send.
A stored value outside the steps SHALL fall back to the default rather than
throw.

Changing the depth SHALL re-read the open pane at the new depth, without a
reload.

#### Scenario: The depth survives a reload

- **WHEN** the operator changes the scrollback depth and reloads the page
- **THEN** the new depth is in effect, and the open pane is read at that depth without a further action

#### Scenario: Changing the depth re-reads the open pane

- **WHEN** a pane is open and the operator changes the depth in settings
- **THEN** the pane is read again and re-subscribed at the new depth

#### Scenario: The maximum is herdr's ceiling

- **WHEN** the operator opens the depth control
- **THEN** no step exceeds the ceiling herdr serves

### Requirement: Settings exposes the depth beside text size

The Settings screen's `terminal` section SHALL contain a labelled
scrollback row beside the text-size row, built the same way: one
`.segment` per step inside a labelled `.segmented` group, each exposing its
selection through `aria-pressed`, meeting the same 40 × 40 coarse-pointer
minimum and stacking below 900px like every other `.setting-row`.

A note under the row SHALL state herdr's ceiling, with the number filled
in from the constant that caps the steps rather than written into the copy.
The "clear local data" preview list SHALL name the scrollback depth.

#### Scenario: Choosing a depth

- **WHEN** the operator taps the `1000` segment
- **THEN** that segment reports `aria-pressed="true"`, the text-size selection is unchanged, and the depth becomes 1000

#### Scenario: The note follows the ceiling

- **WHEN** the Settings screen renders
- **THEN** the note under the scrollback row carries the ceiling constant's value, not a placeholder

### Requirement: A truncated buffer says it is truncated

When herdr reports `truncated: true` for a pane's content — on the initial
`pane.read` or on any `pane.output` — the SPA SHALL render one quiet,
persistent line at the head of that pane's buffer naming herdr, the number
of lines it sent, and that the history above was not sent, using approved
copy. Below herdr's ceiling the line MAY point at the depth setting; at the
ceiling it SHALL NOT, because no setting recovers that history.

The line SHALL be re-rendered with every full repaint of the buffer, so a
redraw never drops it while the content is still truncated.

It SHALL NOT be a toast: truncation is a state of what is on screen, not an
event. It SHALL NOT be silent: a buffer cut short SHALL NOT be
indistinguishable from a short session. The line SHALL disappear when a
later complete snapshot replaces the truncated one.

#### Scenario: The reader is told the top is missing

- **WHEN** a pane holds more history than the requested depth and herdr replies `truncated: true`
- **THEN** the head of the buffer carries a line saying so, and no toast is posted

#### Scenario: A short session says nothing

- **WHEN** a pane's whole history fits within the requested depth
- **THEN** no truncation line is rendered

#### Scenario: At the ceiling, the line does not point at settings

- **WHEN** the depth is herdr's ceiling and herdr replies `truncated: true`
- **THEN** the line states how many lines herdr sent, and does not suggest raising the depth

#### Scenario: A redraw keeps the line

- **WHEN** a truncated buffer is repainted in full by a redraw snapshot that is still truncated
- **THEN** the line is still the first line of the buffer

