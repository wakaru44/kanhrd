## ADDED Requirements

### Requirement: The board groups cards into swimlanes by a chosen dimension
The board SHALL support grouping cards into horizontal swimlanes by one
of: none, host, working directory, or tab. `none` SHALL be the default
and SHALL render the board exactly as it renders today.

Each swimlane SHALL contain the full set of visible status columns.
Status columns SHALL remain the vertical axis and SHALL keep their
order, their filter behaviour and their empty slots within every
swimlane.

Grouping SHALL be a browser-held board arrangement. It SHALL NOT call
any wire method, alter any pane's workspace, tab or status, or persist
to herdr.

#### Scenario: Grouping by working directory
- **WHEN** the operator groups by working directory and cards span three checkouts
- **THEN** the board renders three bands, each showing every visible status column, and each card appears in the band matching its checkout

#### Scenario: Status keeps its meaning
- **WHEN** a swimlane dimension is active
- **THEN** a blocked card is in the blocked column of its own band, and no card changes column because of its band

#### Scenario: Turning grouping off
- **WHEN** the operator sets grouping to none
- **THEN** the board renders a single set of status columns, identical to the board before this feature

### Requirement: Swimlane membership is derived, never assigned
A card's swimlane SHALL be derived from the pane's own data for the
chosen dimension. The board SHALL NOT offer to move a card between
swimlanes, and SHALL expose no drag handle, grab cursor or drop target
on a swimlane.

Moving a pane between hosts, workspaces or tabs is a lifecycle
operation with its own capability requirements and is out of scope.

#### Scenario: No drag affordance on a band
- **WHEN** the pointer or keyboard focuses a card in a grouped board
- **THEN** nothing implies the card can be dragged to another band

### Requirement: The grouping choice persists and is reachable
The chosen dimension SHALL persist in the browser under kanhrd's
existing settings key, SHALL survive reload, and SHALL be clearable by
the Settings screen's clear-local-data action along with every other
kanhrd key.

The control SHALL be reachable from the board, not only from Settings —
the operator changes it while reading the board.

#### Scenario: The choice survives a reload
- **WHEN** the operator groups by host and reloads
- **THEN** the board comes back grouped by host

#### Scenario: Clearing local data
- **WHEN** the operator clears local data
- **THEN** grouping returns to none along with the other reset preferences
