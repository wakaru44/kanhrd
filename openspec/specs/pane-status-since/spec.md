# pane-status-since Specification

## Purpose
TBD - created by archiving change add-pane-status-since. Update Purpose after archive.
## Requirements
### Requirement: The bridge observes when a pane entered its current status
The bridge SHALL record, per host and per pane, the time at which it
first observed that pane holding its current `agent_status`. It SHALL
re-stamp that time whenever it detects a transition, using the same
diff it already performs to synthesize `pane.agent_status_changed`.

The record SHALL be dropped when the pane disappears from `pane.list`,
and SHALL NOT be persisted across bridge restarts.

#### Scenario: A pane changes status
- **WHEN** the bridge's poll finds a pane whose `agent_status` differs from the last observed value
- **THEN** it stamps that pane's observation time to now, and the synthesized `pane.agent_status_changed` carries the same value

#### Scenario: A pane holds its status across polls
- **WHEN** successive polls report the same `agent_status` for a pane
- **THEN** its observation time is left untouched, so the duration grows

#### Scenario: A pane disappears and returns
- **WHEN** a pane leaves `pane.list` and a pane with the same id appears in a later poll
- **THEN** its observation time is stamped fresh rather than resumed from before it vanished

### Requirement: `status_since` travels on the wire as an optional field
`Pane` SHALL carry an optional `status_since` field holding epoch
milliseconds on the bridge's clock. The bridge SHALL omit the field
entirely when it cannot vouch for the value — including for panes it
found already in their current status at startup, before it has observed
any transition for them.

Omission SHALL be represented by the field's absence, never by `0`,
`null`, or the current time.

#### Scenario: The bridge has observed a transition
- **WHEN** a client reads a pane the bridge has watched change status
- **THEN** `status_since` is present and equals the bridge's observation time for that status

#### Scenario: The bridge just started
- **WHEN** a client reads a pane that was already in its current status when the bridge connected to its host
- **THEN** `status_since` is absent from the payload

#### Scenario: An older bridge
- **WHEN** the SPA receives a `Pane` from a bridge that does not implement this change
- **THEN** the field is absent and the SPA behaves exactly as it does for a bridge that cannot vouch for a value

### Requirement: The card shows a real duration or none at all
A card SHALL derive its elapsed readout from `status_since` and SHALL
NOT derive it from component construction, mount, or render time. The
readout SHALL be stable across board navigation, page reload, density
changes and virtual-scroll recycling for as long as the pane holds its
status and the bridge stays up.

When `status_since` is absent the card SHALL render no duration. It MUST
NOT substitute a zero, a placeholder, or a client-side approximation.

#### Scenario: Two cards, two ages
- **WHEN** the board shows a pane that entered `working` an hour ago beside one that entered `working` a minute ago
- **THEN** their readouts differ and reflect those ages

#### Scenario: Leaving and returning to the board
- **WHEN** a user opens a pane and returns to the board without the pane's status changing
- **THEN** that card's readout has advanced by the time spent away, and has not reset

#### Scenario: A reload
- **WHEN** the user reloads the SPA
- **THEN** each card's readout continues from the bridge's observation, not from the reload

#### Scenario: The bridge cannot vouch
- **WHEN** a pane arrives without `status_since`
- **THEN** the card's meta row renders no duration and the rest of the row is unaffected

### Requirement: The readout is never presented as herdr-authoritative
Copy, tooltips, accessible names and documentation describing the
readout SHALL describe it as the bridge's observation, and SHALL NOT
imply herdr reports it or that it survives a bridge restart.
`docs/DESIGN-SYSTEM.md` and `docs/UX-GUIDELINES.md` SHALL be corrected
where they currently claim more than the implementation delivers.

#### Scenario: A contributor reads the design system
- **WHEN** a contributor looks up the card's meta row
- **THEN** it states that elapsed is the bridge's observation, resets on bridge restart, and is accurate to one poll interval

