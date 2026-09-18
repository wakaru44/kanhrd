## ADDED Requirements

### Requirement: The card's rows are independent

A board card SHALL be composed as a column box of row boxes, each row
sizing only its own children. No element in one row SHALL determine the
position or the available width of an element in another row.

The card SHALL carry three rows at standard density, in this reading
order:

1. **identity** — the status dot, the card's name, and the host hanko.
   The name SHALL occupy the width its row leaves after the dot and the
   seal, and SHALL truncate only when it exceeds that width.
2. **locators** — where the pane lives. This row SHALL wrap: at most two
   locators SHALL share a line, and a locator that does not fit beside
   its neighbour SHALL take its own line rather than both being
   ellipsed. A locator that repeats a neighbour SHALL be suppressed
   rather than printed twice; specifically, the repo name SHALL NOT be
   rendered when it equals the workspace name.
3. **state** — the status word, the elapsed duration and any count, with
   the card's actions at the trailing edge of the same row.

The status word SHALL be rendered on every card, including in a status
column whose header already names that status: a card is self-describing
wherever it is drawn.

The full checkout path SHALL remain available on keyboard focus and in
full on the pane detail route.

#### Scenario: The name is not inset by another row

- **WHEN** a card renders at the minimum column width with a status word, a locator row and four actions
- **THEN** the name begins immediately after the status dot and ends at the host hanko, and neither the status word nor the action row changes where it starts or stops

#### Scenario: Two locators share a line, three do not

- **WHEN** a card has a workspace/tab locator and a checkout path that together exceed one line
- **THEN** they render on separate lines, each in full, rather than both truncating on one line

#### Scenario: A repeated locator is dropped

- **WHEN** a pane's repo name is the same word as its workspace name
- **THEN** the card prints that word once, in the workspace/tab locator, and the repo locator is absent

#### Scenario: The status word survives its own column

- **WHEN** a card renders inside the `done` status column
- **THEN** the card still renders the word `done`, and it occupies the state row rather than insetting the name above it

## MODIFIED Requirements

### Requirement: Card renders in a compact single-row variant when density warrants it
The SPA SHALL render a compact card variant when the density setting
is `compact`, or when a status column contains more than 20 cards. The
compact variant SHALL contain a status dot, agent name, host hanko,
elapsed duration, a visible status cue independent of colour, and an
overflow trigger, on a single row — one row box, sized by its own
children. Below 900px compact is mandatory.
The title may truncate; the overflow trigger, the status cue, the hanko
and the elapsed duration SHALL NOT. The full name and location SHALL be
available on keyboard focus and through pane detail, not only through a
hover tooltip.

#### Scenario: Dense lane collapses to compact cards
- **WHEN** a lane contains 25 cards under default density
- **THEN** every card in that lane renders in the single-row compact variant
