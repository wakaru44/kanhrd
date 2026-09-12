## MODIFIED Requirements

### Requirement: A parked card leaves its status column

A pane with a membership entry SHALL be grouped into its parked column
and SHALL NOT appear in any status column. A pane without one SHALL be
grouped by `agent_status` exactly as today.

Parked columns SHALL render to the right of the status columns, after
`unknown`, ordered by their `order` field. `STATUS_COLUMN_ORDER` and the
status columns' own rendering SHALL be unchanged.

The board SHALL resolve a card's column **before** it applies the
visibility filter, and SHALL test that column — never the card's
`agent_status` — against the hidden set. A parked card SHALL therefore be
hidden only when its own parked column is hidden, and SHALL remain on the
board when the status it carries is hidden. A membership entry naming a
column the board does not have SHALL leave the card in its status
column, filtered as a status-column card.

Parked columns SHALL honour the board's excluded hosts and the active
URL scope identically to status columns, and their card count SHALL
reflect the filtered collection.

An empty parked column SHALL keep its horizontal slot and its header
with a mono `0`, with no prose and no illustration — the same treatment
an empty status column receives.

#### Scenario: A parked card appears exactly once

- **WHEN** a pane with `agent_status: "idle"` is parked
- **THEN** it renders in its parked column and no longer renders in the `idle` column, and the `idle` column's count decreases by one

#### Scenario: Parked columns respect the host filter

- **WHEN** the operator excludes a host whose cards include a parked card
- **THEN** that card is removed from its parked column and the parked column's count decreases accordingly

#### Scenario: An empty parked column keeps its slot

- **WHEN** the last card leaves a parked column
- **THEN** the column keeps its position and header and renders the count `0`, and the neighbouring columns do not move

#### Scenario: A parked card is not hidden by the status it carries

- **WHEN** three panes with `agent_status: "unknown"` are parked into a column and the operator hides the `unknown` column
- **THEN** the `unknown` status column is removed from the board and all three cards remain in their parked column

#### Scenario: Hiding a parked column hides exactly its cards

- **WHEN** the operator hides a parked column holding cards of mixed statuses
- **THEN** that column and only that column is removed from the board, and no status column gains or loses a card

## ADDED Requirements

### Requirement: The board's visibility filter hides columns, not statuses

The board's visibility filter SHALL be keyed by column: the same identity
the board, the mobile pager and the status switcher already use — the
status name for a status column, `parked:<id>` for a parked column. It
SHALL NOT be keyed by `agent_status`.

The filter bar SHALL render one chip per column the board renders,
parked columns included, in the board's own column order. Each chip
SHALL toggle its own column and no other. A parked column's chip SHALL be
labelled with the operator's column name and SHALL NOT display a status
dot, since a parked column has no status.

Each chip SHALL carry its column's card count. Counts SHALL be computed
under the same attribution the board uses — a parked card counts toward
its parked column and toward no status column — and SHALL honour excluded
hosts and the URL scope while deliberately ignoring the hidden set, so a
hidden column keeps reporting what is in it.

The hidden set SHALL persist in `localStorage` under the existing
`kanhrd.filters` key as `hiddenColumns`. A payload written before this
change, carrying `hiddenStatuses`, SHALL load without error and SHALL
hide exactly the status columns it named; the next save SHALL rewrite it
under `hiddenColumns`.

When a parked column ceases to exist — removed by the operator, cleared
by Settings' `clear parked columns`, or dropped on load as malformed —
its key SHALL be removed from the hidden set, so no stranded key can
hide a later column.

#### Scenario: A chip per column

- **WHEN** the operator has created two parked columns
- **THEN** the filter bar renders seven chips — the five status columns in `STATUS_COLUMN_ORDER` followed by the two parked columns in their own order — each labelled and counted

#### Scenario: Chip counts agree with the board

- **WHEN** a card is parked out of the `idle` column into a parked column
- **THEN** the `idle` chip's count decreases by one and the parked column's chip count increases by one, matching the counts the two columns render

#### Scenario: A stored status filter still hides its column

- **WHEN** `kanhrd.filters` holds `{"excludedHosts":[],"hiddenStatuses":["unknown"]}` and the board loads
- **THEN** the `unknown` status column is hidden and every other column is shown

#### Scenario: Removing a parked column leaves no stranded key

- **WHEN** the operator hides a parked column and then removes that column
- **THEN** the hidden set no longer names it, and a parked column created afterwards is visible

#### Scenario: Clearing parked columns clears their hidden keys

- **WHEN** the operator hides two parked columns and then uses Settings' `clear parked columns`
- **THEN** the hidden set retains only status-column keys
