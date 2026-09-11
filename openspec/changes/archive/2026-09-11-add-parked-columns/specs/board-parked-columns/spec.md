## Purpose

Lets an operator park a card out of the status columns into a
user-named column that the card leaves under a per-column rule. Parking
is a board arrangement held in the browser: it changes nothing on herdr,
adds no wire method, and never alters a pane's workspace, tab or status.

## Vocabulary

User-facing copy says **host**, **workspace**, **tab** and **card** (the
board's representation of a pane) — the same words the wire, API, schema
and code use. A herdr-derived board grouping is a **status column**; a
user-created one is a **parked column**.

## ADDED Requirements

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
  items, and remove.
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

### Requirement: No drag affordance ships until the design docs permit one

While `docs/UX-GUIDELINES.md` forbids a drag affordance on the board,
the SPA SHALL NOT render a drag handle, enable `cdkDrag`, apply
`cursor: grab`, or expose a drop target on any status column or parked
column. The existing E2E assertion that no board element carries an
enabled `cdkDrag`, a drag handle, or `cursor: grab` SHALL continue to
pass.

Drag-and-drop parking SHALL be implemented only after a maintainer
amends `docs/UX-GUIDELINES.md` and `docs/DESIGN-SYSTEM.md` to define
which drag affordances the board permits, and SHALL then satisfy
"drag-drop must work or not appear": a status column SHALL remain a
non-drop-target whose membership is never changed by a drag.

#### Scenario: The shipped board is drag-free

- **WHEN** the board renders with parked columns present
- **THEN** no element carries an enabled `cdkDrag`, a drag handle, or `cursor: grab`, and every parking action remains reachable through the overflow menus

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
