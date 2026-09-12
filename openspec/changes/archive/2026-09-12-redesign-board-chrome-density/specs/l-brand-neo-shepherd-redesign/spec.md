## MODIFIED Requirements

### Requirement: Board composition communicates attention before decoration
The board SHALL use unfilled status columns with hairline headings,
mono tabular counts, and stable column positions. Blocked SHALL receive
the strongest status emphasis, working the next; other statuses use
quiet labels and small indicators. Colour SHALL NOT fill whole columns
or create five equally prominent summary badges. Existing user status
visibility preferences SHALL remain effective.

The shell SHALL use the available viewport width. Column minimum width
SHALL be 260px; when columns do not fit, the board region SHALL scroll
horizontally instead of shrinking cards or overflowing the whole page.
Below 900px the rail becomes a drawer and the board becomes a
one-column-per-screen pager as specified in the mobile board requirement
below. Empty columns retain their horizontal slot and header; only
their empty body collapses. Settings and long explanatory copy SHALL
use a readable content width rather than stretching across the board.

The board's own chrome SHALL NOT crowd out the cards. The filter bar
SHALL be laid out as a wrapping row of chip GROUPS, each group itself a
wrapping row of chips, so that the groups share one line wherever the
viewport allows and wrap as units when it does not. The bar SHALL NOT
reserve a fixed row per group. No media query SHALL be required to
achieve this: the composition is the behaviour.

Above 1440px the chrome preceding the first card SHALL occupy no more
than a third of the viewport height with no scope active.

Each chip group SHALL carry a visible label naming what its chips are,
and that label SHALL be the group's accessible name. A chip SHALL NOT be
left to distinguish itself from a chip of another kind by position alone:
a host chip and a column chip are otherwise identical controls.

Filter chips SHALL remain visible controls. They SHALL NOT be collapsed
into an overflow menu, a disclosure or a hover-only surface to save
space, and a column's chip SHALL keep its card count.

#### Scenario: Small laptop
- **WHEN** the populated board renders at 1280×800 with the rail open
- **THEN** column headings and the first card row are visible without vertical scrolling, and horizontal overflow is confined to the board

#### Scenario: A column becomes empty
- **WHEN** the final card leaves a status column
- **THEN** its header and zero count remain in the same position, and neighbouring columns do not jump

#### Scenario: The groups share a line, then wrap as units

- **WHEN** the board renders at 1600px wide, then at 1280px, then at 390px
- **THEN** the filter groups sit on one line, then wrap onto two, then stack with chips wrapping inside their own group, and the page never scrolls horizontally

#### Scenario: A host chip is tellable from a column chip

- **WHEN** the filter bar renders with the host and column groups sharing a line
- **THEN** each group is preceded by a label naming it, and that label is the group's accessible name
