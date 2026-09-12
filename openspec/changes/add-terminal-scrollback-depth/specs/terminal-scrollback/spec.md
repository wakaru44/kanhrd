## ADDED Requirements

### Requirement: The scrollback depth is requested, not inherited

The SPA SHALL send an explicit `lines` with every `pane.read` and
`pane.subscribe_output`, rather than leaving the depth to herdr's default.
The value SHALL come from one place, so the initial read and every
subsequent snapshot for the same pane request the same depth — the same
agreement `source` and `format` already hold to.

The depth SHALL be an operator preference, persisted in this browser under
the `kanhrd.*` namespace beside the terminal's other per-operator
preferences, and SHALL be clamped to a documented range whose maximum is
what herdr will actually serve.

The terminal's client-side buffer SHALL be sized from the same number, so
that the buffer and the request cannot disagree.

#### Scenario: Every request asks for the same depth

- **WHEN** a pane detail view opens and then receives three live snapshots
- **THEN** the initial read and all three snapshots carry the same `lines`, `source` and `format`

#### Scenario: The depth survives a reload

- **WHEN** the operator raises the scrollback depth and reloads the page
- **THEN** the new depth is in effect, and the open pane is re-read at that depth without a further action

### Requirement: A truncated buffer says it is truncated

When herdr reports `truncated: true` for a pane's content, the SPA SHALL
render one quiet, persistent line at the head of that pane's buffer saying
the history above it was not sent, using approved copy.

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
