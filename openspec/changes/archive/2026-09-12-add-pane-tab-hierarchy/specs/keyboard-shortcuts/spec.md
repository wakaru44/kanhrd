## ADDED Requirements

### Requirement: Tab movement acts on the view the operator is in

`prefix + n` and `prefix + p` SHALL move between tabs in whatever view is
on screen, and SHALL always change something the operator can see.

- On the board, they SHALL move the board's scope to the next or previous
  tab, as today.
- On the pane detail route, they SHALL navigate to a pane of the next or
  previous tab in the route pane's workspace, wrapping at both ends. They
  SHALL NOT merely move the board's scope while leaving the terminal on
  screen unchanged.

Both bindings SHALL have the same implementation as the visible tab strip
they mirror: the view SHALL register its navigator with the keyboard
service, in the same seam the card switcher already uses, so that "which
tab is next" is answered once rather than in two places that can drift.

When no view has registered a navigator, the keys SHALL keep the board's
behaviour rather than doing nothing.

#### Scenario: The keys move the terminal, not an invisible filter

- **WHEN** the operator presses `prefix + n` while looking at a pane in a workspace with three tabs
- **THEN** the route becomes a pane of the next tab, and the tab strip marks that tab as current

#### Scenario: The board keeps its meaning

- **WHEN** the operator presses `prefix + n` on the board
- **THEN** the board's scope moves to the next tab, exactly as before

#### Scenario: Mouse and keyboard agree

- **WHEN** the operator selects the next tab in the strip with the pointer, and then presses `prefix + p`
- **THEN** they arrive back where they started, because both paths use the same navigator
