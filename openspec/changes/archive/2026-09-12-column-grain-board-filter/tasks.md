## 1. Column identity reachable from the state layer

- [x] 1.1 Move `parkedColumnKey` from `board/column.ts` to
      `state/parked.store.ts`; re-export it from `board/column.ts` so
      existing importers are untouched.

## 2. Attribution before filtering

- [x] 2.1 `Filters.hiddenStatuses: ReadonlySet<AgentStatus>` →
      `Filters.hiddenColumns: ReadonlySet<string>`.
- [x] 2.2 Add `columnKeyOf(pane, membership, liveParkedIds)`: the parked
      key when the membership entry names a live column, else the
      `agent_status`.
- [x] 2.3 `groupIntoColumns`: resolve the column, then test it against
      `hiddenColumns`.
- [x] 2.4 `groupIntoSwimlanes`: the same test in the band pass.

## 3. Counts

- [x] 3.1 `statusCountsSignal` → `columnCountsSignal`, a
      `ReadonlyMap<string, number>` over every status column and every
      parked column, counted under `columnKeyOf`; still ignores
      `hiddenColumns`, still honours excluded hosts and the URL scope.

## 4. Chips

- [x] 4.1 `FilterBar` renders one chip per `boardColumnRefs(...)` entry;
      parked chips carry the column name, no status dot, and the ochre
      boundary.
- [x] 4.2 `PanesStore.toggleStatus` → `toggleColumn(key: string)`.

## 5. Lifecycle and persistence

- [x] 5.1 `loadFilters` reads `hiddenColumns ?? hiddenStatuses ?? []`;
      `saveFilters` writes `hiddenColumns`.
- [x] 5.2 `PanesStore` effect prunes `parked:` keys naming a column
      `ParkedStore` no longer has.

## 6. Board

- [x] 6.1 `Board.visibleColumns` filters the full ref list by key;
      delete `visibleStatuses` and the unused `isStatusHidden`.

## 7. Tests

- [x] 7.1 Parked `unknown` pane + hidden `unknown` column → still on the
      board, in its parked column (the reported defect).
- [x] 7.2 Hiding a parked column hides exactly its cards.
- [x] 7.3 Chip counts agree with the board for both kinds of column.
- [x] 7.4 Legacy `hiddenStatuses` payload loads and hides `unknown`.
- [x] 7.5 Removing / clearing parked columns strands no key.
- [x] 7.6 Swimlanes honour the same attribution.
