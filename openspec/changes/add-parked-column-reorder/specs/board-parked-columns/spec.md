## MODIFIED Requirements

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

## ADDED Requirements

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
