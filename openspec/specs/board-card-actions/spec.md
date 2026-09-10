# board-card-actions Specification

## Purpose
TBD - created by archiving change fix-card-menu-stacking. Update Purpose after archive.
## Requirements
### Requirement: An open card menu is above every other card
When a card's overflow menu is open, the menu SHALL paint above every
other card on the board and above every other card's action controls,
regardless of document order. The topmost element at any point inside
the menu's box SHALL be the menu or one of its descendants.

A card's action controls MUST NOT create a stacking context that traps
its own menu below a sibling card.

#### Scenario: The menu overlaps the next card
- **WHEN** a card's overflow menu is open and its box overlaps the next card's inline action buttons
- **THEN** `document.elementFromPoint()` at any point in the overlap returns the menu or a descendant of it, and a click there activates the menu item under the pointer

#### Scenario: The last menu item is reachable
- **WHEN** the menu's final item (`rest`) renders over a neighbouring card
- **THEN** clicking it opens the close confirmation for the menu's own card, never the neighbour's

### Requirement: An open card menu is not clipped by its column
The overflow menu SHALL be fully visible when opened from any card,
including the last card in a status column and a card in a virtualized
column. The column's vertical scroll container MUST NOT clip it.

#### Scenario: The last card in a scrolling column
- **WHEN** the overflow menu is opened from the last card in a column whose body is scrolled to its end
- **THEN** every menu item is within the viewport and hit-testable, and the menu is not cut off at the column's bottom edge

#### Scenario: The menu follows its trigger
- **WHEN** the column's card list scrolls while a menu is open
- **THEN** the menu stays anchored to its trigger or closes, and never detaches to float over unrelated content

### Requirement: The menu's keyboard and screen-reader contract is unchanged
Relocating the menu in the DOM SHALL preserve its existing behaviour:
`role="menu"` with `role="menuitem"` children, arrow/Home/End
navigation, Escape dismissal returning focus to the trigger, and the
trigger's `aria-expanded` reflecting the open state. Focus SHALL move
into the menu on open.

#### Scenario: Escape from a relocated menu
- **WHEN** a user opens a card menu with the keyboard and presses Escape
- **THEN** the menu closes, focus returns to that card's overflow trigger, and the card's pane is not opened

