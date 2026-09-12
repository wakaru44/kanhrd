# board-parked-columns Specification

## Purpose
Lets an operator park a card out of the status columns into a
user-named column that the card leaves under a per-column rule. Parking
is a board arrangement held in the browser: it changes nothing on herdr,
adds no wire method, and never alters a pane's workspace, tab or status.
## Requirements
### Requirement: Parking never mutates herdr

Parking, unparking, creating, renaming, reordering and removing a parked
column SHALL be browser-local operations. The SPA SHALL NOT call
`pane.move`, `pane.rename`, `pane.report_metadata`, or any other
mutating wire method as part of any of them, and SHALL NOT introduce a
new wire method, event kind, or `BridgeCapabilities` flag for this
capability.

A parked pane's `workspace`, `tab`, `agent_status` and every other
projected field SHALL be identical to those of an unparked pane, and the
card SHALL continue to render its status word and status dot.

#### Scenario: Parking a card sends nothing to the bridge

- **WHEN** the operator parks a card into a parked column
- **THEN** no request frame is sent to the bridge, no herdr call is made, and the pane's `workspace.id`, `tab.id` and `agent_status` are unchanged

#### Scenario: A parked card still reports its status

- **WHEN** a parked pane's `agent_status` is `blocked`
- **THEN** the card in the parked column renders the `blocked` status word and dot, exactly as it would in the `blocked` status column

### Requirement: Parked columns and membership persist in browser storage

The SPA SHALL persist parked-column definitions and per-pane membership
together in `localStorage` under the single key
`kanhrd.parked-columns`, as a versioned document holding `columns`
(`id`, `name`, `exitRule`, `order`) and `membership` keyed by the
existing `PaneKey` (`` `${host}:${paneId}` ``).

Loading SHALL be defensive in the same manner as the shipped
`loadFilters`: an absent key, unparsable JSON, an unknown `version`, an
unknown `exitRule`, or a membership entry naming a column that is not in
`columns` SHALL yield the empty default (no parked columns) or drop the
offending entry, never a partially applied state or a thrown error.

The SPA SHALL expose a `clear parked columns` action in Settings that
removes the key and returns every parked card to its status column.

#### Scenario: Parking survives a reload

- **WHEN** the operator parks two cards into a parked column and reloads the page
- **THEN** the parked column and both cards' membership are restored from `localStorage`

#### Scenario: Corrupt storage degrades to no parked columns

- **WHEN** `kanhrd.parked-columns` contains invalid JSON or an unrecognised `version`
- **THEN** the board renders the five status columns with every card in them, and no error reaches the user beyond the board being unarranged

#### Scenario: A membership entry naming an unknown column is dropped

- **WHEN** the stored `membership` references a column id absent from `columns`
- **THEN** that entry is discarded on load and its pane renders in its status column

#### Scenario: Parking is per-browser and the product says so

- **WHEN** the operator opens the same board in a second browser or on a second device
- **THEN** no parked column appears there, and Settings' `clear parked columns` row states that parked columns are stored in this browser only

### Requirement: A parked card leaves its status column

A pane with a membership entry SHALL be grouped into its parked column
and SHALL NOT appear in any status column. A pane without one SHALL be
grouped by `agent_status` exactly as today.

Parked columns SHALL render to the right of the status columns, after
`unknown`, ordered by their `order` field. `STATUS_COLUMN_ORDER` and the
status columns' own rendering SHALL be unchanged.

The `order` field SHALL be the operator's, not only the creation order: it
SHALL be changeable after creation, and every surface that draws the
columns — the desktop strip, the mobile pager, the switcher and every
swimlane band — SHALL draw the one changed order. Changing it SHALL
remain browser-local and SHALL NOT move a card between columns, alter any
membership entry, or change a column's id or its `parked:<id>` key.

Parked columns SHALL honour the board's active `Filters` (excluded hosts,
hidden statuses) and the active URL scope identically to status columns,
and their card count SHALL reflect the filtered collection.

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

#### Scenario: A reordered column keeps its cards and its key

- **WHEN** the operator moves a parked column holding two cards one place to the left
- **THEN** both cards are still in that column, its id and its `parked:<id>` filter key are unchanged, and no herdr call is made

#### Scenario: A parked card is not hidden by the status it carries

- **WHEN** three panes with `agent_status: "unknown"` are parked into a column and the operator hides the `unknown` column
- **THEN** the `unknown` status column is removed from the board and all three cards remain in their parked column

#### Scenario: Hiding a parked column hides exactly its cards

- **WHEN** the operator hides a parked column holding cards of mixed statuses
- **THEN** that column and only that column is removed from the board, and no status column gains or loses a card

### Requirement: Per-column exit rules are driven only by agent status

Each parked column SHALL carry exactly one `exitRule`. Two rules SHALL
be implemented:

- `never` — membership is removed only by an explicit operator action.
- `agent-activity` — membership is removed when the pane's
  `agent_status` transitions **into** `working` or `blocked`, as
  reported by the `pane.agent_status_changed` event the board already
  subscribes to.

Exit-rule evaluation SHALL use no signal other than
`pane.agent_status_changed`. The SPA SHALL NOT open a
`pane.subscribe_output` subscription, call `pane.read`, or otherwise
fetch terminal content for any card in order to evaluate an exit rule.

A rule change SHALL take effect from the next event onward and SHALL NOT
retroactively unpark cards.

#### Scenario: Agent activity pops a card out

- **WHEN** a card parked in an `agent-activity` column has its `agent_status` change from `idle` to `working`
- **THEN** its membership entry is removed and the card renders in the `working` status column

#### Scenario: A transition out of working does not pop a card out

- **WHEN** a card parked in an `agent-activity` column has its `agent_status` change from `working` to `done`
- **THEN** it stays parked, because the transition is not into `working` or `blocked`

#### Scenario: `never` ignores every status change

- **WHEN** a card parked in a `never` column transitions from `idle` to `blocked`
- **THEN** it stays parked and its card renders the `blocked` status word inside the parked column

#### Scenario: No card subscribes to output for a rule

- **WHEN** any number of cards are parked under any rules
- **THEN** the SPA has opened no `pane.subscribe_output` subscription other than the one belonging to an open pane-detail route

### Requirement: A parked card survives disconnect and is released only on close

A membership entry SHALL be removed when its pane is closed — on
`pane.closed`, and on the local purge of cascaded children following
`tab.closed` or `workspace.closed`, which tier-3 does not emit
`pane.closed` frames for.

A membership entry SHALL NOT be removed because its host disconnected,
because its pane is temporarily absent from a `pane.list` snapshot, or
on any elapsed-time or last-seen heuristic. A parked card belonging to a
disconnected host SHALL keep its slot in its parked column and be marked
stale in the same way a card in a status column is.

Removing a parked column SHALL return its cards to their status columns
and SHALL NOT close, move or otherwise affect any pane.

#### Scenario: Closing a parked pane releases its entry

- **WHEN** a parked pane is closed and `pane.closed` arrives
- **THEN** its membership entry is removed, the card disappears, and the parked column remains

#### Scenario: A cascading workspace close releases its parked panes

- **WHEN** a `workspace.closed` event arrives for a workspace containing parked panes, with no `pane.closed` frames for them
- **THEN** the membership entries for every pane the SPA had associated with that workspace are purged locally

#### Scenario: A disconnected host does not unpark anything

- **WHEN** a host holding parked cards disconnects and later reconnects
- **THEN** those cards stay in their parked columns throughout, marked stale while the host is unreachable

#### Scenario: Removing a column returns its cards

- **WHEN** the operator removes a parked column holding three cards
- **THEN** all three render in the status columns matching their current `agent_status`, and no herdr call is made

### Requirement: Parked-column controls are visible and keyboard-operable

Every parking action SHALL be reachable without hover and without a
pointer:

- Park and unpark SHALL be items in the card's existing visible
  `LucideMoreHorizontal` overflow menu — `park in…` (listing the parked
  columns plus a `new column…` item) for an unparked card, and `unpark`
  for a parked one.
- A parked column's header SHALL render its name, its mono count, and
  its current exit rule as **visible text**, plus a
  `LucideMoreHorizontal` trigger visible on first render opening a
  `role="menu"` with rename, the exit rules as `role="menuitemradio"`
  items, `move column left`, `move column right`, and remove.
- Both menus SHALL open by keyboard, navigate with arrow keys, dismiss
  with Escape, and return focus to their trigger without opening the
  pane — the contract the shipped card menu already implements.
- Board arrow-key navigation SHALL reach parked columns using stable
  pane identity, exactly as it reaches status columns.

The exit rule SHALL NOT be presented only in a tooltip, only on hover,
or only on focus. `title` MAY be used as a pointer convenience beside
the visible text, never as its only presentation.

No new global unmodified key binding SHALL be introduced, and no prefix
chord SHALL be added for parking while the board has no focused-card
model (the same blocker recorded for the unimplemented `prefix+x`).

#### Scenario: Parking without a pointer

- **WHEN** the operator tabs to a card, opens its overflow menu with the keyboard, and selects `park in…` then a column
- **THEN** the card is parked, and focus returns to the overflow trigger

#### Scenario: The exit rule is legible without interaction

- **WHEN** the board renders a parked column with rule `agent-activity`
- **THEN** the column header shows that rule as visible text, with no hover, focus or menu interaction required to read it

#### Scenario: Changing the rule by keyboard

- **WHEN** the operator opens a parked column's header menu by keyboard and selects the `never` rule item
- **THEN** the column's rule becomes `never`, the header text updates, the menu closes, and focus returns to the trigger

#### Scenario: Reordering by keyboard

- **WHEN** the operator opens the second parked column's header menu by keyboard and selects `move column left`
- **THEN** that column and the one to its left exchange places on every strip on the board, the menu closes, and focus returns to the trigger

### Requirement: No drag affordance ships until the design docs permit one

The board SHALL carry only the drag affordances the design docs permit,
and each SHALL be gated on actually working:

- Parking a card by dragging it into a user-defined column (maintainer
  decision Q1, `docs/UX-GUIDELINES.md` § "Status membership").
- Reordering the operator's own columns by dragging one by its header,
  as specified in "Parked columns are reorderable by keyboard and by
  drag".

On a board with no user-defined column there SHALL be nothing to drag
and nothing to drop into, and every `cdkDrag` and every `cdkDropList`
SHALL be inert (`.cdk-drag-disabled` / `.cdk-drop-list-disabled`), with
no drag handle and no `cursor: grab` anywhere. The existing E2E
assertion to that effect SHALL continue to pass.

No drag SHALL make a status column a drop target, a reorder target or a
reorder source, and no drag SHALL change a card's status or call
`pane.move`. Any further drag affordance SHALL be specified before it
ships, and SHALL satisfy "drag-drop must work or not appear": a pointer
gesture with no keyboard equivalent in approved copy SHALL NOT ship.

#### Scenario: The shipped board is drag-free

- **WHEN** the board renders with no user-defined column present
- **THEN** no element carries an enabled `cdkDrag`, an enabled drag handle, or `cursor: grab`, and every parking action remains reachable through the overflow menus

### Requirement: An unimplementable exit rule is not offered

The exit-rule menu SHALL offer only rules the board can actually
enforce. An "on any activity" rule — the operator's originally requested
default — SHALL NOT appear in the UI while the only signal that could
back it is unavailable: `pane.output` is per-subscription and forbidden
for cards by `docs/UX-GUIDELINES.md`, and `HerdrPaneInfo.revision` is
unverified and known to be pinned at `0` on the sibling `pane.read`
response in herdr 0.8.2.

The product SHALL NOT describe `agent-activity` as covering human input.
The SPA cannot observe human typing at all: terminal bytes are not
attributable to a source, and the only input kanhrd could attribute is
input it sent itself, which misses every keystroke typed in herdr's TUI
or a real terminal.

#### Scenario: The rule list is honest

- **WHEN** the operator opens a parked column's exit-rule menu
- **THEN** exactly two rules are offered, `never` and `on agent activity`, with no disabled, greyed or "coming soon" third entry

#### Scenario: An "any activity" rule requires evidence first

- **WHEN** a later change proposes an "on any activity" rule
- **THEN** it first establishes, against a live herdr, that `PaneInfo.revision` advances on pane output across successive `pane.list` responses, and implements the rule by diffing that value on the bridge's existing agent-status poll rather than by adding any per-card output subscription

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

### Requirement: Parked columns are reorderable by keyboard and by drag

The SPA SHALL let the operator change the left-to-right position of a
parked column, by keyboard and by pointer, writing only the `order`
field of the existing `kanhrd.parked-columns` document.

The keyboard path SHALL be two items in the parked column's existing
header menu, labelled with the approved copy `move column left` and
`move column right`. Each item SHALL be present at every viewport width.
An item SHALL be marked `aria-disabled` when there is no visible parked
column in that direction, and SHALL NOT be hidden and SHALL NOT be
silently enabled-but-inert. It SHALL remain focusable, so that arrow
navigation within the menu is never trapped on it, and activating it
SHALL do nothing at all — no move, no error, and not even a menu
dismissal. An enabled item SHALL move the column
past any column the filter bar has hidden, so that activating it always
changes what the operator can see.

The pointer path SHALL be a horizontal drag of the column by its header:

- Only a parked column SHALL be a drag source. A status column's drag
  SHALL be disabled and its header SHALL carry no drag handle.
- A status column SHALL NOT be a reorder target: a dragged column SHALL
  NOT come to rest anywhere left of the first parked column, and the
  status columns' relative order SHALL remain `STATUS_COLUMN_ORDER`.
- The drag SHALL NOT appear below `--breakpoint-mobile`, where the board
  is a one-column-per-screen pager, nor on a board with fewer than two
  parked columns. The menu items SHALL remain available in both cases.
- A drop SHALL be interpreted against the columns actually on screen and
  applied to the full stored order, so a hidden column between two
  visible ones SHALL NOT shift the result.

A reorder in any swimlane band SHALL apply to the whole board, because
there is one `order` and every band renders it. A reorder SHALL NOT
reorder, hide, show or renumber a status column, SHALL NOT move a card,
and SHALL NOT send anything to the bridge.

The column-reorder drop list and the per-column card drop lists SHALL
remain unconnected: neither SHALL be a member of the other's
`cdkDropListGroup` and neither SHALL name the other in
`cdkDropListConnectedTo`, so a card SHALL NOT be droppable onto the
column strip and a column SHALL NOT be droppable into a column's card
list. A parked column SHALL accept a dropped item as a card only when
the dragged item carries a pane.

#### Scenario: Moving a column by keyboard

- **WHEN** the operator selects `move column right` on the first of three parked columns
- **THEN** it renders second, the other two keep their relative order, and the stored `order` values are a dense sequence reflecting the new arrangement

#### Scenario: The ends are honest

- **WHEN** the operator opens the header menu of the leftmost parked column
- **THEN** `move column left` is present and marked `aria-disabled`, `move column right` is enabled, and activating the disabled item moves nothing, raises no error and leaves the menu open

#### Scenario: A hidden neighbour is stepped over

- **WHEN** the operator has hidden the middle of three parked columns with its filter chip and selects `move column right` on the first
- **THEN** the moved column renders to the right of the hidden column's position, the hidden column stays hidden and keeps its `parked:<id>` key and chip, and the visible arrangement has changed

#### Scenario: A status column is not a reorder target

- **WHEN** a parked column is dragged left across the status columns and released over `working`
- **THEN** it comes to rest as the leftmost parked column, no status column changes position, and no card changes status

#### Scenario: A status column is not a reorder source

- **WHEN** the board renders with two parked columns above the mobile breakpoint
- **THEN** each parked column's header is a drag handle, no status column's header is a handle or carries `cursor: grab`, and every status column's `cdkDrag` is inert

#### Scenario: The phone keeps the keyboard path only

- **WHEN** the board renders below `--breakpoint-mobile` with two parked columns
- **THEN** no column is draggable and the column strip's reorder list is inert, while both `move column` items remain in each parked column's header menu

#### Scenario: A reorder in a band reorders the board

- **WHEN** the operator reorders two parked columns from inside one swimlane band
- **THEN** every band and the board's own strip draw the new order

#### Scenario: The two drags do not collide

- **WHEN** a card is dragged from a status column into a parked column while the board also permits column reordering
- **THEN** the card is parked exactly as before, the column order is unchanged, and no column drag starts from the pointer press on the card

