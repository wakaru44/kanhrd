# Redefine the board's visibility filter as a column filter

## Why

The board displays a card in one column and filters it by another.

`groupIntoColumns` (and `groupIntoSwimlanes`, which repeats the test)
consults `filters.hiddenStatuses` **before** it consults parked
membership:

```ts
if (filters.excludedHosts.has(pane.host) || filters.hiddenStatuses.has(pane.agent_status)) {
  continue;
}
const columnId = membership.get(paneKey(pane.host, pane.id));
```

So a card the operator parked into their own column is still filtered by
the `agent_status` it happens to carry. Park three terminal panes (all
`unknown`) into a column named `parking`, hide the `unknown` chip because
unattended terminals are not what you are watching, and `parking` empties
— the cards were never re-attributed to the column they are rendered in.

The maintainer's redefinition, quoted: *"The user columns should be part
of the 'state filters' as just another state, because what those 'states'
represent is actually the columns. They convey 2 meanings and that's
ok."*

## What Changes

- **Attribution first, filter second.** A card's column is resolved
  (parked membership if any, else `agent_status`) and *that* is tested
  against the hidden set. In `groupIntoColumns` and in
  `groupIntoSwimlanes`' band pass alike.
- **The hidden set is keyed by column, not by status.**
  `Filters.hiddenStatuses: ReadonlySet<AgentStatus>` becomes
  `Filters.hiddenColumns: ReadonlySet<string>`, keyed by the board's
  existing column identity — `BoardColumnRef.key`: the status name for a
  status column, `parked:<id>` for a parked one. No second key scheme.
- **A chip per column.** The filter bar renders a chip for every column
  the board renders, parked columns included, each toggling its own
  column. A parked column's chip carries the operator's column name.
- **Counts follow attribution.** `statusCountsSignal` becomes
  `columnCountsSignal`, keyed the same way: a parked card counts toward
  its parked column, never toward the status it carries. It still ignores
  the hidden set itself, so a hidden column keeps reporting what is in
  it.
- **Persistence migrates by reading, not by rewriting.** A stored
  `hiddenStatuses: ["unknown"]` loads as `hiddenColumns: {"unknown"}` —
  bare status names are already valid column keys. Saves write
  `hiddenColumns`.
- **No stranded keys.** Removing a parked column, or clearing them all,
  drops its key from the hidden set.

Out of scope, deliberately: whether an *empty* column auto-hides. Today's
rule stands — a visible column with no cards renders its header and a
mono `0`.

## Impact

- Affected specs: `board-parked-columns` (the filter clause of "A parked
  card leaves its status column"), `board-swimlanes` (bands honour the
  same attribution).
- Affected code: `apps/web/src/app/state/panes.store.ts`,
  `apps/web/src/app/board/filter-bar.{ts,html,scss}`,
  `apps/web/src/app/board/board.ts`,
  `apps/web/src/app/board/column.ts` (re-export of `parkedColumnKey`,
  which moves to `state/parked.store.ts` so the store can key by it
  without importing a component).
- No wire method, event kind or bridge capability changes. Nothing
  reaches herdr.
