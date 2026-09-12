## MODIFIED Requirements

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

Banding SHALL apply the board's visibility filter under the same
attribution the ungrouped board uses: a card's column is resolved first
and that column is tested against the hidden set, so a parked card
appears in its parked column inside its own band whatever status it
carries, and hiding a column removes it from every band.

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

#### Scenario: A parked card bands under its parked column
- **WHEN** a swimlane dimension is active, a card is parked, and the status that card carries is hidden
- **THEN** the card still renders in its parked column inside its own band, and its band is not emptied by the hidden status
