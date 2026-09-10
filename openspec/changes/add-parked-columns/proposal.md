## Why

The board's five columns are derived from `agent_status` and nothing
else. That is correct for agents the operator is tending, and wrong for
the terminals they are not: a file-explorer pane, a `tail -f`, an ad-hoc
shell. Those sit in `idle` or `unknown` forever, pushing real cards down
and adding noise to the one thing the board exists for — knowing which
agents need attention (`docs/UX-GUIDELINES.md`, "The core loop").

The operator's ask is a **parked column**: a user-named column that a
card is put into deliberately, and that the card leaves under a rule the
operator picks per column — on activity, never, or only on agent
activity.

Two things about this feature are not what they look like, and both were
established by investigation rather than assumed:

1. **It is not a `pane.move`.** Parking changes nothing on herdr. The
   pane stays in its tab and workspace, keeps its `agent_status`, and
   keeps running. Parking is a **board arrangement** — the same class of
   thing as the filter chips and the density setting, not the same class
   of thing as a lifecycle operation. `pane.move` from tier-3 is
   available and is the wrong tool: its destination is a tab or a
   workspace (`openspec/specs/tier-3-lifecycle/spec.md`), and using it
   would move the operator's file-explorer out of the field it belongs
   to in order to change where kanhrd draws it.

2. **The board's docs currently forbid the interaction the ask names.**
   `docs/UX-GUIDELINES.md` lists "Any drag affordance on a status column"
   as a review reject, its E2E assertion 22 reads "**No element in the
   board** carries `cdkDrag` enabled, a drag handle, or `cursor: grab`",
   and `apps/web/src/app/board/column.ts` carries a comment saying the
   disabled `cdkDropList`/`cdkDrag` scaffold "is gone with the 'park
   column' idea it was reserved for — the docs now forbid the affordance
   outright." This change does not overrule that. It ships the
   menu-and-keyboard path, which the docs already sanction, and holds
   drag behind an explicit maintainer amendment (see **Open questions**,
   Q1). `docs/UX-GUIDELINES.md` also says "drag-drop must work or not
   appear" — under the current docs, the honest reading is *not appear*.

## What Changes

### Phase A — parked columns, no drag, no new wire method

- **A board-local park store** (`apps/web/src/app/state/parked.store.ts`)
  holding user-defined columns (`id`, `name`, `exitRule`, `order`) and
  per-pane membership keyed by the store's existing `PaneKey`
  (`${host}:${paneId}`), persisted to `localStorage` under
  `kanhrd.parked-columns` — the same mechanism, and the same honesty
  ceiling, as the already-shipped `kanhrd.filters` and
  `kanhrd.keyboard`. `design.md` records why herdr-side and bridge-side
  persistence were investigated and rejected.
- **A parked card leaves its status column.** `columnsSignal` gains a
  parked partition: a pane with a membership entry is grouped into its
  parked column instead of into `groupByStatus`. Its `agent_status` is
  unchanged and still rendered on the card.
- **Parked columns render to the right of `unknown`**, in the operator's
  order, using the existing `Column` component with a different header.
  They keep their slot when empty and show a mono `0`, exactly as an
  empty status column does.
- **The column header carries the rule as visible text** (`never` /
  `on agent activity`) plus a `LucideMoreHorizontal` overflow trigger —
  the documented visible-affordance pattern — opening rename column /
  exit rule / remove column. Not a tooltip. See **Open questions**, Q3.
- **Park and unpark are card overflow-menu items.** `card.html` already
  ships a keyboard-reachable `role="menu"`; parking adds `park in…`
  (listing the parked columns plus `new column…`) and, for a parked
  card, `unpark`. This is the whole keyboard path in phase A, and it is
  sufficient: menus open, navigate and dismiss by keyboard under
  `docs/UX-GUIDELINES.md`.
- **Two exit rules ship**: `never` (manual removal only) and
  `on agent activity` (the pane's `agent_status` transitions into
  `working` or `blocked`). Both are driven by the
  `pane.agent_status_changed` event the bridge already synthesizes from
  its 5s `pane.list` poll. No new subscription, no new poll, no per-card
  terminal read.
- **Lifecycle**: a membership entry is dropped on `pane.closed` and on
  the local purge that follows `tab.closed` / `workspace.closed`
  (tier-3's "clients purge cascaded children locally"). A **disconnected
  pen does not unpark anything** — its cards stay parked and stale, per
  the reliability-states table.
- **Settings** gains a `clear parked columns` row, so browser-local state
  has a visible way out.

### Phase B — drag and drop (gated on Q1)

`@angular/cdk/drag-drop` is already a dependency. Dragging a card from a
status column into a parked column, and reordering parked columns, land
only after a maintainer amends `docs/UX-GUIDELINES.md` and
`docs/DESIGN-SYSTEM.md` to permit a drag **source** on a status column
while keeping status columns non-drop-targets. Until then no drag
handle, no `cursor: grab`, and assertion 22 stays true.

### Phase C — an `on any activity` rule (gated on Q2)

The operator's default rule was "any signal pops it out". The bridge
cannot observe that today for an unsubscribed card, and the one field
that could (`HerdrPaneInfo.revision`) is unverified and known-broken on
the sibling `pane.read` path in herdr 0.8.2. Phase C is a spike plus, if
it holds, a revision diff on the existing 5s poll. `design.md` § "What
'activation' actually is" has the evidence.

## Impact

- `apps/web/src/app/state/parked.store.ts` — **new**. Column
  definitions, membership, persistence, exit-rule evaluation.
- `apps/web/src/app/state/panes.store.ts` — `columnsSignal` partitions
  parked panes out of `groupByStatus`; the `pane.closed` /
  `workspace.closed` / `tab.closed` handling notifies the park store.
- `apps/web/src/app/board/board.{ts,html,scss}` — render parked columns
  after the status columns; include them in the mobile pager and the
  status switcher.
- `apps/web/src/app/board/column.{ts,html,scss}` — a parked variant of
  the header (name, count, rule text, overflow trigger). The status
  variant is untouched and stays drag-free.
- `apps/web/src/app/board/card.{ts,html}` — `park in…` / `unpark` menu
  items. **Overlaps `add-pane-workdir-and-task-title`** — see below.
- `apps/web/src/app/settings/**` — `clear parked columns`.
- `apps/web/src/app/shared/copy.ts` — pending; `docs/BRAND.md`'s
  approved-copy table has no `park.*` rows (Q4).
- **No change to `packages/schema`, `apps/bridge`, or any wire method.**
  Nothing about this feature reaches herdr.

### Overlap with `add-pane-workdir-and-task-title` (live, unimplemented)

Both changes edit `card.ts` / `card.html` and both add items to the same
card overflow menu. They do not contradict, and neither blocks the other:

- That change adds a **rename** menu item and a `pane.rename` round trip
  to herdr; this one adds **park / unpark** items that never leave the
  browser. Different actions, same `role="menu"` container.
- That change adds `Pane.label` and `Pane.project` and changes the card's
  **title precedence**. This change reads no card field except
  `agent_status`, `host` and `id`, so a richer `Pane` changes nothing
  here.
- Its non-goal "**No new browser storage.** No `kanhrd.*` key is added"
  is scoped to that change's own storage question (a task title, which
  herdr can hold). It is not a project-wide ban — `kanhrd.filters` and
  `kanhrd.keyboard` already exist — and a parked column is not a thing
  herdr can hold. `design.md` argues this explicitly rather than
  assuming it.
- Merge order is free. Whichever lands second adds its menu items beside
  the other's. If both are in flight, the second should expect a
  conflict in `card.html`'s `<div class="overflow-menu">` block and
  nowhere else.
- That change's non-goal "**No status-column, drag or lifecycle
  change**" remains true of this one too in phase A.

## Non-goals

- **No `pane.move`, no herdr mutation of any kind.** Parking is a view
  arrangement. A parked pane's workspace, tab and status are untouched.
- **No new bridge state, no new wire method, no new capability flag.**
- **No change to the status columns**: same five, same order, same
  read-only semantics, no drag affordance in phase A.
- **No sharing across devices, browsers or operators.** Parked columns
  are per-browser. Stated plainly in the spec and surfaced in Settings.
- **No parked column in the URL.** Parking is arrangement, not scope; see
  `design.md` § "Where parked columns live" and Q5.
- **No per-card terminal subscription.** `docs/UX-GUIDELINES.md` forbids
  a card fetching terminal output for decoration; an exit rule is
  decoration.
- **No auto-parking.** No heuristic that parks a card because it has no
  agent, or because it is idle, or because of its command. The operator
  parks; kanhrd never does.
- **No nesting, no per-parked-column filters, no cross-pen grouping
  rules.**

## Open questions — maintainer decisions required

These are design-authority calls. Per `CLAUDE.md`, the lane flags them
rather than inventing an answer.

- **Q1 (blocking phase B). Does a status column get a drag *source*
  affordance?** The docs forbid it three times over (UX anti-pattern
  list, DESIGN-SYSTEM § Status column, E2E assertion 22) and `column.ts`
  records the park idea as the reason the drag scaffold was deleted. The
  operator's ask is explicitly drag-and-drop. Recommended amendment:
  narrow the rule from "no drag affordance on a status column" to "a
  status column is never a **drop target** and status membership is
  never changed by drag"; permit a card to be a drag source **only when
  at least one parked column exists**, so a board with no parked columns
  is byte-for-byte the board the docs describe today; amend assertion 22
  to scope to drop targets and to boards without parked columns.
  **Until a maintainer makes this edit, phase B does not start.**
- **Q2 (blocking phase C). Is the default exit rule `on agent activity`?**
  The operator asked for "on activation (default) — any signal pops it
  out", and any-signal is not observable today (`design.md`). Recommended:
  `on agent activity` is the default in phase A, and the default is
  revisited only if phase C's spike shows `PaneInfo.revision` advances.
- **Q3. Is the column-header overflow menu the accepted substitute for
  the requested "small tooltip UI"?** `docs/UX-GUIDELINES.md` forbids
  hover-only affordances, so a hover tooltip carrying the control is not
  available; the doc has no pattern for a *column header* menu, only for
  cards and rail rows. Recommended: reuse the card/rail overflow pattern
  verbatim on the column header, and render the current rule as visible
  text beside the count so the rule is legible without opening anything.
- **Q4. Copy.** `docs/BRAND.md`'s approved-copy table has no rows for
  parked columns. Proposed strings, following the voice rules (lowercase,
  no exclamation, care verbs reserved for lifecycle — parking is not a
  lifecycle end, so no care verb): `card.park` = `park in…`,
  `card.unpark` = `unpark`, `park.newColumn` = `new column…`,
  `park.defaultName` = `parked`, `park.rule.never` = `never`,
  `park.rule.agentActivity` = `on agent activity`,
  `park.removeColumn` = `remove column`,
  `park.removeColumnBody` = `the cards go back to their status columns.
  nothing on the pen changes.`, `settings.clearParked` =
  `clear parked columns`. A maintainer approves or replaces these and
  adds them to the table; until then they follow `card.ts`'s existing
  `CARD_COPY` pending-copy precedent.
- **Q5. Is a browser-local board arrangement in tension with "URL is
  state"?** The doc's rule is about **scope**, and parking is not scope,
  so the proposal keeps parking out of the URL. But it means a shared
  link renders differently for the recipient, which is the outcome that
  rule exists to prevent. Recommended: accept it, and say so in the doc
  — density and filters already have the same property.
- **Q6. Mobile.** A parked column becomes another page in the pager and
  another segment in the status switcher, whose spec says "one segment
  per **visible status**". Recommended: parked columns page and switch
  identically, with the column's name as the segment label; a maintainer
  confirms the switcher's contract widens from "status" to "column".
