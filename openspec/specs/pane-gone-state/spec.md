# pane-gone-state Specification

## Purpose
TBD - created by archiving change add-pane-gone-state. Update Purpose after archive.
## Requirements
### Requirement: Pane detail says when its session has ended

The pane detail view SHALL enter a **gone** state when the pane it shows
was present in the store for a connected host and is then removed — by a
`pane.closed` from herdr or the one the bridge synthesizes from `pane.list`
reconciliation. The view SHALL NOT report `live` or `stale` for that pane
afterwards, and SHALL render the state with approved copy and a way back
to the board.

A pane that has not yet been discovered SHALL NOT be treated as gone, and a
pane whose host is disconnected SHALL remain `unavailable`.

#### Scenario: A pane that ends while open is reported gone

- **WHEN** a pane is open in the detail view and its `pane.closed` arrives
- **THEN** the view leaves `live`, shows the gone state with a back control, and offers no retry

#### Scenario: A cold deep link is not gone

- **WHEN** the detail view is opened by URL before the store has listed that host's panes
- **THEN** the view shows `loading`, not the gone state

#### Scenario: A lost host is not a lost pane

- **WHEN** the pane's host disconnects and its panes leave the store
- **THEN** the view shows `unavailable`, not the gone state

### Requirement: A gone pane is no longer watched or written to

On entering the gone state the view SHALL unsubscribe its `pane.output`
stream, so the bridge stops polling the pane, and SHALL NOT send
`pane.send_text` or `pane.send_keys` for it.

#### Scenario: The poll loop ends

- **WHEN** the view enters the gone state
- **THEN** it sends `pane.unsubscribe_output` for its subscription

#### Scenario: Typing does nothing on the wire

- **WHEN** the operator types into the terminal in the gone state
- **THEN** no `pane.send_text` or `pane.send_keys` request is sent

