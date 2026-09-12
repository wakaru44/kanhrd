## ADDED Requirements

### Requirement: Every created pane, tab and workspace has a chosen destination

The SPA SHALL send a destination with every creation it requests, rather
than letting herdr resolve it from whatever is focused on the host.

`pane.split` SHALL carry the `workspace_id` of the board's active scope,
and `target_pane_id` when the operator asked from a surface that names one
(a card's menu, or a tab row). `tab.create` SHALL carry its
`workspace_id`. When the board has no scope and more than one host can
create, the SPA SHALL ask the operator for the destination rather than
selecting the first capable host in configuration order.

A tab's overflow menu SHALL offer creating a card in that tab, and SHALL
NOT ask for a destination: the row it belongs to is the destination.

#### Scenario: A new card lands in the workspace on screen

- **WHEN** the board is scoped to a workspace and the operator creates a card from the `+` menu
- **THEN** `pane.split` carries that workspace's id, and the card appears in that workspace rather than wherever the host's focus was

#### Scenario: An ambiguous destination is asked for, not guessed

- **WHEN** the board has no scope, two hosts report `paneCreate`, and the operator creates a card
- **THEN** the operator is asked which host and workspace, and no request is sent until they choose

#### Scenario: Creating from a tab row needs no picker

- **WHEN** the operator selects `new card in this tab` in a tab's overflow menu
- **THEN** a card is created in that tab, with no destination prompt

### Requirement: A pane can be moved to another tab or workspace

Where `BridgeCapabilities.paneMove` is true, the SPA SHALL offer moving a
pane to the three destinations herdr's `PaneMoveDestination` union defines:
an existing tab, a new tab, or a new workspace. Where it is false, the
SPA SHALL NOT render the action at all — not disabled, not hidden behind a
failure.

A move's result SHALL be applied in full, including its cascade: moving the
last pane out of a tab closes that tab, and possibly its workspace. The SPA
SHALL reuse the local purge it already performs for `tab.closed` and
`workspace.closed` rather than implementing a second reconciliation.

A result of `changed: false` SHALL be reported to the operator with
herdr's own reason (`same_tab`, `zoomed_tab`), and SHALL NOT be presented
as a completed move. A failed move SHALL post a toast quoting herdr's
message, as every other lifecycle failure does.

Moving a pane SHALL NOT change its `agent_status`, and SHALL NOT be
offered as a way to change it.

#### Scenario: Moving the last pane out of a tab

- **WHEN** the operator moves the only pane of a tab into another workspace and herdr returns `closed_tab_id`
- **THEN** the card appears under its new workspace, the emptied tab disappears from the rail, and no stale tab row is left behind

#### Scenario: A move that herdr refused

- **WHEN** `pane.move` returns `changed: false` with `reason: "zoomed_tab"`
- **THEN** the operator is told the move did not happen and why, and the card stays where it was

#### Scenario: No move affordance without the capability

- **WHEN** a card's host reports `paneMove: false`
- **THEN** that card offers no move control in any menu

### Requirement: The card's actions are named, and the destructive one is confirmed

A card's action row SHALL carry four controls, each with a text label in
its accessible name: **move**, **split**, **rest** and the overflow menu.

- `move` and `split` SHALL open menus rather than acting immediately,
  because each has more than one destination and neither has a safe
  default worth guessing.
- `rest` SHALL open the existing confirmation dialog before closing the
  pane. The word SHALL be the product's own (`rest`), not an unlabelled
  glyph.
- The overflow menu SHALL carry every action the row offers, each with its
  label, plus rename. An action reachable only as an unlabelled icon SHALL
  NOT exist.

Every control SHALL be visible on first render and SHALL NOT be revealed
on hover. The inline row is NOT held to `--touch-target-min`: it renders
at pointer width, and `docs/UX-GUIDELINES.md`'s 40 × 40 rule names card
overflow triggers and items in an open overflow menu, which it still
governs. The compact card SHALL keep exactly one visible trigger, as it
does today — and that trigger, with every item of the menu it opens, does
meet `--touch-target-min`. See `design.md` for the measurements this was
decided on.

Moving a pane and parking a card SHALL NOT share a menu. `move to` is a
herdr operation: it reparents the pane, can close the tab it left, and is
visible to every other herdr client. `park in` is browser-local: it groups
a card in a column held in this browser's storage, changes nothing on the
host, and requires no capability. The move control SHALL offer herdr
destinations only, and parking SHALL remain in the card's overflow menu.

#### Scenario: The destructive action says what it is

- **WHEN** a card renders its action row
- **THEN** the closing control is labelled with the product's own word for it and opens a confirmation, rather than being an unlabelled glyph that acts immediately

#### Scenario: Parking is not offered as a move

- **WHEN** the operator opens a card's move menu on a board that has parked columns
- **THEN** the menu lists only herdr destinations — another tab, a new tab, a new workspace — and no parked column appears in it

#### Scenario: Parking stays reachable, and stays local

- **WHEN** a card's host reports `paneMove: false`
- **THEN** the card offers no move control, and `park in…` is still available in its overflow menu
