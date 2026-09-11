## ADDED Requirements

### Requirement: The board groups cards into swimlanes by a chosen dimension
The board SHALL support grouping cards into horizontal swimlanes by one
of: none, host, repository, checkout path, or tab. `none` SHALL be the
default and SHALL render the board exactly as it renders today.

Repository and checkout path SHALL both be offered, from
`Pane.project.repo_name` and `Pane.project.checkout_path`. They are not
interchangeable: grouping by repository holds linked worktrees of one
repo together, while grouping by checkout path separates them, and both
layouts are in real use.

Each swimlane SHALL contain the full set of visible columns — status
columns and any user-created parked columns alike. Columns are the
vertical axis and swimlanes the horizontal one; a band cuts across every
column rather than replacing any of them.

Status columns SHALL keep their order, their filter behaviour and their
empty slots within every swimlane. A swimlane holding no cards in any
column SHALL NOT be rendered.

Grouping SHALL be a browser-held board arrangement. It SHALL NOT call
any wire method, alter any pane's workspace, tab or status, or persist
to herdr.

#### Scenario: Grouping by checkout path
- **WHEN** the operator groups by checkout path and cards span three checkouts of one repository
- **THEN** the board renders three bands, each showing every visible column, and each card appears in the band matching its checkout

#### Scenario: Grouping by repository
- **WHEN** the operator groups by repository and those same three checkouts are linked worktrees of one repo
- **THEN** the board renders one band containing all of their cards

#### Scenario: An empty band
- **WHEN** filters leave a band with no cards in any column
- **THEN** that band is not rendered, and the remaining bands close up

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

#### Scenario: A parked column inside a band
- **WHEN** a parked column exists and a swimlane dimension is active
- **THEN** the parked column appears in every rendered band, beside the status columns, and parking a card changes its column without changing its band

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
