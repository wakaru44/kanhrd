# Design — column-grain board filter

Decisions taken by this lane, with the reasoning, since the lane ran
unattended.

## 1. The key is `BoardColumnRef.key`, unchanged

`board/column.ts` already defines one identity per column — the status
name, or `parked:<id>` from `parkedColumnKey` — and the mobile pager, the
status switcher and the `tabpanel` ids are all built from it. The hidden
set reuses it verbatim. Two consequences fall out for free:

- A stored `hiddenStatuses: ["unknown"]` is *already* a set of valid
  column keys, so the migration is a read, not a data transform.
- `parked:` can never collide with a status name, so one flat
  `Set<string>` needs no tagging.

`parkedColumnKey` **moves** from `board/column.ts` to
`state/parked.store.ts`, and `column.ts` re-exports it so every existing
importer is untouched. Reason: `panes.store.ts` must key by it, and
`board/column.ts` is an Angular component module — importing it into the
store would drag the `Column` component, `COPY` and the CDK into the
state layer. `parked.store.ts` is where parked-column identity belongs
and the store already depends on it.

## 2. `Filters.hiddenStatuses` is renamed, not widened in place

The field is `hiddenColumns: ReadonlySet<string>`. Naming it for what it
now means is the whole point of the redefinition; a `hiddenStatuses`
field holding `parked:p1` would be a lie in every call site that reads
it. The type widens `AgentStatus` → `string` because a parked column's
key is not a status.

## 3. Persistence: read both, write one

`StoredFilters` gains `hiddenColumns?: string[]` and keeps
`hiddenStatuses?: AgentStatus[]` as a **read-only legacy field**.
`loadFilters` takes `hiddenColumns ?? hiddenStatuses ?? []`; `saveFilters`
writes `hiddenColumns` only. So:

- an old payload loads and hides exactly what it hid before;
- the first save after that rewrites the key in the new shape;
- a payload carrying both (impossible in practice, possible by hand)
  prefers the new field rather than merging.

No version bump: `kanhrd.filters` has never carried one, and the
defensive `try/catch → defaultFilters()` already covers a payload this
code cannot read. Adding a version now would only invalidate the very
payloads the migration exists to preserve.

## 4. Stranded keys are pruned centrally, not at each call site

`ParkedStore.removeColumn` and `ParkedStore.clear` are two of the ways a
parked column can stop existing; a third is `loadParked` dropping a
malformed column at startup. Rather than teach each of them about
`Filters` (the parked store holds no filter state and should not), the
panes store carries one effect: any `parked:` key in `hiddenColumns`
whose column is not in `ParkedStore.columns()` is dropped. One rule, one
place, and it covers the startup case the call-site fix would have
missed.

Status keys are never pruned — `STATUS_COLUMN_ORDER` is fixed, and a
hidden status must survive a reload.

## 5. Counts are a map, not a `Record<AgentStatus, number>`

`columnCountsSignal` returns `ReadonlyMap<string, number>` with an entry
for every status column and every parked column (`0` included), because
the key space is now open. It keeps the property its doc comment
promised: it honours host exclusion and the URL scope but **ignores**
`hiddenColumns`, so a hidden column still reports what is in it — the
reason the chip keeps its count while struck through.

A parked card counts toward its parked column only. If it counted toward
both, the chips would sum to more than the board renders.

## 6. Attribution respects the *known* parked columns

A membership entry naming a column the board does not have is already
ignored by the grouping pass (the card falls back to its status column).
Attribution follows that exactly: `columnKeyOf` returns `parked:<id>`
only when the id is in the live column set, otherwise the status name. A
card can therefore never be filtered by a key nothing on the board can
toggle.

## 7. Chip order and the parked chip's appearance

Chips render in `boardColumnRefs` order — the five statuses in
`STATUS_COLUMN_ORDER`, then the parked columns in their own order — the
same order the board draws its columns and the switcher draws its
segments, so the chip row reads as the board's table of contents.

A status chip keeps its `--status-*` dot. A parked chip carries **no**
dot: the dot's colours are herdr's five statuses, and re-using any of
them (or the grey `--status-unknown` default) would claim a parked column
has a status. It is distinguished instead by its `parked-chip` class,
which renders the ochre boundary the design system already uses for "the
operator chose this" (`--ochre-line`, as on the selected group-by chip) —
not colour alone, since the name in the chip is the operator's own word
and no status is ever named that.

No new copy string: the chip's label is the column's name, which the
operator supplied.

## 8. `Board.visibleStatuses` and `Board.isStatusHidden` are deleted

`visibleStatuses` existed only to feed `boardColumnRefs`; the board now
builds the full ref list and filters it by key, which is the one place
that has to know about hiding. `isStatusHidden` had no caller left at
all.
