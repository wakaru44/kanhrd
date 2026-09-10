# domain-vocabulary Specification

## Purpose
TBD - created by archiving change rename-vocabulary-to-herdr-terms. Update Purpose after archive.
## Requirements
### Requirement: herdr's domain objects use herdr's names everywhere
User-facing copy SHALL name a herdr host a **host**, a herdr workspace a
**workspace**, and a herdr tab a **tab**. The words **pen**, **field**
and **lane** SHALL NOT appear in copy as names for those objects.

This applies to visible text, accessible names, titles, placeholders and
help content alike. Wire messages, TypeScript identifiers, capability
names and quoted herdr errors already use these terms and are unchanged.

#### Scenario: A filter chip
- **WHEN** the board renders a host filter chip
- **THEN** its accessible label is prefixed `host: `

#### Scenario: A lifecycle confirmation
- **WHEN** a user closes a workspace
- **THEN** the prompt and body name it a workspace, and no string in that dialog says field

#### Scenario: A quoted error no longer mixes vocabularies
- **WHEN** an error toast quotes a herdr response mentioning `tab`
- **THEN** the framing copy and the quoted portion use the same word for the same object

### Requirement: The board's own furniture keeps kanban's names
Objects the board invents SHALL keep kanban vocabulary, because they
name things herdr has no concept of:

- a **card** is the board's representation of a pane;
- a **status column** is a grouping derived from `agent_status`;
- a **swimlane** (short form **lane**) is a horizontal band grouping
  cards by a chosen dimension.

`lane` SHALL refer to a swimlane and to nothing else. It SHALL NOT be
used for a tab in copy, help text, comments, specs or documentation.

#### Scenario: A contributor looks up "lane"
- **WHEN** a contributor searches the design documents for `lane`
- **THEN** every occurrence describes a swimlane, and the tab meaning appears only in the history of the rename

#### Scenario: The board still says card
- **WHEN** the board renders a pane
- **THEN** it is called a card, and the glossary states that a card is a pane

### Requirement: The glossary states the mapping once
`docs/BRAND.md` SHALL carry a vocabulary table giving, for each object,
the word the UI uses and the herdr concept behind it — host, workspace,
tab, card (pane), status column, swimlane. `docs/CONTEXT.md` SHALL
reference it rather than restating it.

The table SHALL state the rule plainly: herdr's objects use herdr's
words, the board's own furniture uses kanban's words.

#### Scenario: A herdr user meets the board
- **WHEN** a user who knows herdr opens the design documents
- **THEN** one table tells them a card is a pane and that host, workspace and tab mean what they already mean

### Requirement: Voice is unchanged by the rename
The rename SHALL change nouns only. Register, casing, punctuation,
care-verb usage and the approved-copy table's non-noun content SHALL be
preserved. No string SHALL be re-worded, softened, expanded or shortened
while being renamed.

#### Scenario: A care prompt survives intact
- **WHEN** the close-pane confirmation is renamed
- **THEN** it still reads `let this one rest?` with the same body, because it names no domain object

#### Scenario: A reviewer diffs the change
- **WHEN** a reviewer reads the copy diff
- **THEN** every changed string differs from its predecessor only in the noun naming a host, workspace or tab

