# Design — user-controlled parked columns

Investigation record for `add-parked-columns`. Every claim below is
sourced to a file in this repo or to the herdr findings already recorded
in `openspec/changes/add-pane-workdir-and-task-title/design.md`, which
was written against an installed herdr 0.8.2. Where nothing could be
verified from here, this file says so rather than guessing.

## The column model (maintainer, 2026-09-10)

The board carries two kinds of column, and every design choice below
follows from the split:

- **Agent-defined columns** — the five status columns. They are the
  natural state of the agent, derived from `agent_status`. Membership is
  not the operator's to set; it follows the agent.
- **User-defined columns** — parked columns. The operator creates,
  names and **drags cards into** them. Membership is deliberate, and a
  card leaves only under that column's **exit rule**.

The exit rules, in the operator's own examples:

| Column name | Exit rule          | Behaviour                                                                                       |
| ----------- | ------------------ | ----------------------------------------------------------------------------------------------- |
| `archived`  | `never`            | only manual movement takes a card out — status changes, work starting, and messages do not eject |
| `parking`   | `on agent activity`| the card exits when the agent activates (a bot messages it, it starts working); it stays while `unknown`, `idle` or `stopped` |

Drag into a user-defined column is the point of the feature, not an
accelerator (Q1, granted). A status column is never a drop target and
status membership is never changed by a drag.

## Finding 1 — a parked column is not a herdr concept, at any level

herdr's model is host → workspace → tab → pane. A pane belongs to
exactly one tab. There is no grouping primitive that is orthogonal to
that tree, and nothing in the tier-1/2/3 wire contract exposes one.

The board's five columns are not a herdr concept either — they are
`groupByStatus` in `apps/web/src/app/state/panes.store.ts:379`,
partitioning panes by `Pane.agent_status`, a field herdr does own. So
the board already draws a grouping that has no herdr counterpart; the
difference is that the *key* is herdr's fact.

A parked column inverts that: the grouping key is the operator's
opinion. Nothing on the wire produces it, and nothing on the wire can
be asked for it.

## Finding 2 — the three places membership could live

### herdr-side, option A: `pane.rename` / `PaneInfo.label`

Rejected. `label` is the operator's **name** for the pane, it is what
herdr's own TUI rename writes, it is rendered in herdr's sidebar, and
`add-pane-workdir-and-task-title` is in flight to use it as the card
title. Encoding a column id into it would collide with that change, be
visible as noise in herdr's own UI, and destroy the operator's name the
moment they park a card.

### herdr-side, option B: `pane.report_metadata` `tokens`

This is the honest candidate, and it was investigated properly rather
than dismissed. From the sibling change's Finding 4, verified against
herdr 0.8.2's schema:

- `PaneInfo.tokens` is `additionalProperties: {type: "string"}`,
  `maxProperties: 32`, key pattern `^[A-Za-z0-9_-]{1,32}$`.
- Writable via `pane.report_metadata` with a required `source`, an
  optional `seq`, an optional `ttl_ms` (1..=86400000 — a **ceiling**,
  and optional, so an untimed token does persist).
- Push updates exist: `Subscription::PaneUpdated` is a real requestable
  variant carrying a full `PaneInfo`, and
  `WorkspaceMetadataUpdated` exists beside it.
- herdr's changelog calls the feature "custom metadata tokens", and both
  CLI help strings call `report_metadata` **display-only**.

So `tokens["kanhrd_park"] = "<column-id>"` would work for **membership**.
It does not work for the feature:

1. **The column definitions have no home.** A parked column's name, exit
   rule and order are board-global, not pane-scoped and not
   workspace-scoped. Putting them in a workspace's `tokens` bag makes
   the board's column set depend on which workspaces happen to be open,
   and duplicates the definition across every workspace that has a
   parked card. There is no board-scoped bag on herdr because there is
   no board on herdr.
2. **Split storage is worse than either half.** With definitions local
   and membership remote, a second browser receives `kanhrd_park` values
   naming columns it has never heard of, and has to invent placeholder
   columns or silently drop the parking. Both are worse than being
   consistently local.
3. **It is a display bag being used as a store**, with `source`
   attribution designed for hooks, a 24h TTL ceiling in the same
   parameter, and a 32-entry budget shared with every other integration
   on that pane. The sibling change rejected it for the same reason on
   weaker grounds (it had a purpose-built alternative; we do not, and it
   is *still* the wrong seam).
4. **It costs real plumbing** for a feature that otherwise touches no
   wire code: a `pane.report_metadata` wire method, a capability flag, a
   dispatch case, a `pane.updated` subscription, and conflict handling
   for two clients writing the same token.

### bridge-side

Rejected on the ground the sibling change already established:
`apps/bridge/src` is config, herdr clients, HTTP and WS, with **no
storage layer**. Adding one — a path, durability, backup, multi-client
conflict resolution — to hold a per-operator view arrangement inverts
the cost of the feature. The bridge is stateless except for caches, and
this change keeps it that way.

### browser-side

Accepted. `apps/web/src/app/state/panes.store.ts:67-91` already persists
board **view state** (`Filters`: excluded hosts, hidden statuses) to
`localStorage` as `kanhrd.filters`, with a `loadFilters` /`saveFilters`
pair injected with a `Pick<Storage, …>` seam so it unit-tests without a
browser. `keyboard.service.ts:139-157` does the same for the prefix
override. A parked column is the same kind of thing as a hidden status:
a per-operator decision about how one browser draws one board.

## Storage decision

**Decision: browser `localStorage`, one key, both halves.** Column
definitions and per-pane membership live together under
`kanhrd.parked-columns`, using the store's existing
`PaneKey = \`${host}:${paneId}\`` as the membership key. Keeping them in
one document is the point: a membership entry can never reference a
column this browser does not have.

```jsonc
{
  "version": 1,
  "columns": [
    { "id": "p1", "name": "explorers", "exitRule": "never", "order": 0 },
    { "id": "p2", "name": "shells", "exitRule": "agent-activity", "order": 1 }
  ],
  "membership": { "laptop:pane-7": "p1", "prod:pane-3": "p2" }
}
```

`version` is there so a later phase that relocates membership to herdr
can migrate rather than guess. Load is defensive in the same shape
`loadFilters` already is: any parse failure, any unknown `exitRule`, any
membership entry naming an unknown column, yields the default (no
parked columns) rather than a half-applied state.

Consequences, stated rather than softened: parked columns are not shared
between browsers, not shared between devices, not visible to herdr or to
any other herdr client, and are lost with site data. Settings gets a
`clear parked columns` row so the state is not invisible. If the ask
later becomes "my parking follows me", the trigger for revisiting is a
board-scoped store — which today means the bridge growing a storage
layer, not `tokens`.

## What "activation" actually is

The operator named three rules. Mapping each onto a signal the board
actually receives:

### The signals that exist

| Signal | Where it comes from | Available for an unsubscribed card? |
| --- | --- | --- |
| `pane.agent_status_changed` | **Bridge-synthesized.** `apps/bridge/src/herdr/hosts.ts` polls `pane.list` every `AGENT_STATUS_POLL_INTERVAL_MS` = 5000 and emits an event for any pane whose `agent_status` differs from the last seen value | **Yes** — every pane on every connected host, always |
| `pane.created` / `pane.closed` / tier-3 lifecycle | herdr-native subscriptions | Yes |
| `pane.output` | **Bridge-synthesized**, `apps/bridge/src/output/poller.ts`, one poll loop per subscribed `(host, pane_id)` calling `pane.read` | **No** — only for a pane the SPA has explicitly subscribed, i.e. the open pane-detail route |

`docs/UX-GUIDELINES.md` closes the door on the third for this feature
twice: "No new per-card terminal subscription is introduced for visual
polish. A card never fetches terminal output for decoration", and the
anti-pattern "a card fetching terminal output it does not need". An exit
rule is decoration in exactly that sense. So **`pane.output` is not
available to an exit rule**, and this is a rule, not a limitation to
work around.

### Rule → signal

- **`never`** — no signal. Membership is removed only by the operator.
  Fully implementable today.
- **`on agent activity`** (the operator's "agent activation — only agent
  signal, not human typing") — the pane's `agent_status` transitions
  **into** `working` or `blocked`. This is herdr's own agent-state
  detection, arriving on the event the board already subscribes to for
  every card. Fully implementable today, with no new plumbing at all.
  Its honest ceiling is the 5s poll: a burst that starts and finishes
  inside one interval is not seen.
- **`on any activity`** (the operator's requested default) — **not
  implementable today.** See below.

### Can the bridge distinguish agent activity from human typing?

**Partly, and not in the way the ask implies. Stated plainly:**

- The board *can* isolate the agent: `agent_status` is derived by herdr
  from the agent, and human keystrokes at a shell do not move it. So
  "only agent, not human" is the rule that is **easy**, not the hard one.
- The board *cannot* observe human typing at all. Typing produces
  terminal output, and terminal output is only visible through
  `pane.read` polling, which the docs forbid per card. Even with it,
  output cannot be attributed to a source — an agent's stdout and a
  human's keystroke echo are the same bytes on the same stream. The only
  human input kanhrd could attribute is input kanhrd itself sent
  (`pane.send_text` / `pane.send_keys` through
  `apps/bridge/src/herdr/write-queue.ts`), which misses every keystroke
  typed in herdr's TUI or in a real terminal — i.e. exactly the case a
  parked file-explorer is in.

**Therefore "any signal pops it out" is deferred, not designed around.**

### The one unexplored path, and why it is a spike not a design

`HerdrPaneInfo` (`packages/schema/src/herdr.ts:85-95`) declares
`revision: number`, sourced to herdr's `PaneInfo`. If it advances on
pane output, the bridge's **existing** 5s `pane.list` poll could diff it
alongside `agent_status` and synthesize an activity event with no new
request, no new poll and no per-card subscription — which would satisfy
the "any signal" rule inside the docs' constraints.

It is not asserted, because two things are unknown from here:

1. `apps/bridge/src/herdr/project.ts` drops `revision`; nothing in the
   bridge has ever read `PaneInfo.revision`, so there is no observed
   behaviour to appeal to.
2. The sibling field is known broken. `apps/bridge/src/output/poller.ts:135`
   carries: "herdr 0.8.2 hardcodes `revision: 0` on every `pane.read`
   response (herdr `src/app/api/panes.rs:1524`), so revision-only dedup
   never fires" — the poller falls back to hashing content. Whether
   `PaneInfo.revision` shares that defect is unverified.

Phase C is therefore: read `PaneInfo.revision` across a few `pane.list`
polls against a live herdr while producing output, and only then design.
If it is also pinned at 0, `on any activity` cannot be built without
either a herdr fix or a doc amendment permitting board-wide output
polling — and the second of those should be refused.

## Pane lifecycle and host disconnect

- **Pane closed.** `pane.closed` arrives and `applyPaneClosed` drops the
  pane; the park store drops the membership entry keyed by the same
  `PaneKey`. The column stays — it is the operator's column, not the
  pane's.
- **Cascading close.** tier-3's spec is explicit that a cascading
  `tab.close` / `workspace.close` emits **no** `pane.closed` for the
  panes inside, and that "clients purge cascaded children locally". The
  park store purges on the same pass the pane map already does, keyed on
  the panes it is dropping — not by re-deriving the tree.
- **Host disconnected.** Nothing is unparked. `docs/UX-GUIDELINES.md`'s
  reliability table is binding: "existing content stays visible, marked
  with `LucideUnplug` and `stale — reconnecting`". A parked card of a
  disconnected host keeps its slot and is marked stale like any other
  card. Unparking on disconnect would silently lose the arrangement on
  every reconnect flap, which is the failure mode the table exists to
  prevent.
- **Pane reappears with the same id.** It re-enters its parked column,
  because the membership entry was never removed. This is the desired
  behaviour for a flapping host and the reason GC is event-driven rather
  than "prune anything not currently seen".
- **Membership for a pane that never returns** stays in `localStorage`
  as an inert entry. No heuristic prunes it: any "not seen for N" rule
  would eventually delete the parking of a host that was merely offline.
  The bound is the operator's `clear parked columns` action.
- **Exit fires while the pane is gone** — impossible by construction:
  the rule is evaluated on a `pane.agent_status_changed` event, which
  only exists for a live pane on a connected host.

## Where parked columns live, and URL-is-state

**Position.** Parked columns render **after** `unknown`, in the
operator's own order. The status columns keep `STATUS_COLUMN_ORDER`
(`working, blocked, idle, done, unknown`) untouched, in that order, at
the left. This follows the board's existing attention gradient: the
board is read left to right by urgency, and a parked card is by
definition the one the operator has decided not to look at.

**Filters.** Parked columns honour the same `Filters` as status columns
— an excluded host and a hidden status remove their cards from parked
columns too, and the column's count reflects the filtered collection, as
`docs/UX-GUIDELINES.md` requires ("Counts always represent the complete
filtered collection"). The alternative — parked columns ignoring
filters — makes the host chips lie.

**Scope.** A `/workspace/:id` or `/workspace/:id/tab/:id` scope applies
to parked columns identically. A parked column can therefore be empty
under a scope; it keeps its slot and shows `0`, as an empty status
column does.

**URL.** Parking stays **out** of the URL. `docs/UX-GUIDELINES.md`'s
rule is "The rail is a **navigator**, not a filter. Every **scoping**
decision is in the URL", and parking is not a scoping decision — it is a
board arrangement, in the same category as the density setting and the
persisted filter chips, neither of which is in the URL either. Putting a
per-browser column set in a link would also produce links that cannot be
honoured: the recipient has no `p1`, and inventing one from a URL would
be kanhrd creating the operator's columns for them.

The honest cost is that a shared link renders differently for the
recipient. That is Q5 in the proposal, and the precedent (filters,
density) argues for accepting it — but it is a doc-authority call, not
this change's.

## The "small tooltip UI", reconciled

The ask is a "small tooltip UI to configure per-column exit rule".
`docs/UX-GUIDELINES.md` § Visible affordances permits exactly two
patterns — always-visible controls, and a `LucideMoreHorizontal`
overflow menu that is itself visible on first render — and lists
"Hover-only reveal of an action that has no alternative path" as a
review reject. A tooltip that carries the control is the rejected
pattern.

The doc specifies those two patterns for **cards** and for **rail rows**.
It says nothing about a **column header**, because until now no column
header had an action. That gap is Q3.

Proposed, and built out of pieces the doc already sanctions:

- The parked column header renders `name`, the mono count, and the
  current rule as visible text in `--ink-mute` (`never` /
  `on agent activity`). The rule is legible without opening,
  hovering or focusing anything — the same principle as "Status is never
  colour alone".
- Beside it, a `LucideMoreHorizontal` trigger, visible on first render,
  opening a `role="menu"` with `rename column`, the exit rules as
  `role="menuitemradio"` items, and `remove column`. Opens by keyboard,
  arrow-navigates, dismisses on Escape, returns focus to the trigger —
  the contract `card.ts` already implements and can be lifted from.
- `title` on the rule text is permitted as a pointer convenience only,
  never as the sole path — the same rule the sibling change applies to
  truncated paths.

No new interaction pattern is invented. If a maintainer wants a genuine
tooltip/popover primitive in the design system, that is a doc extension
they make, not one this change writes.

## Keyboard

The app is keyboard-first, and `docs/UX-GUIDELINES.md` requires every
mouse action to have a keyboard equivalent. Phase A's path:

- **Park / unpark**: the card's existing overflow menu, which is already
  keyboard-operable (`aria-haspopup="menu"`, `role="menu"`,
  `onMenuKeydown`). `park in…` opens a submenu of parked columns plus
  `new column…`; a parked card shows `unpark`. This satisfies the rule
  on its own — it is not a fallback for drag, it is the primary path,
  and it is the only path in phase A.
- **Configure a column**: the column header's overflow menu, same
  contract.
- **Navigation**: parked columns are columns. Board arrow-key navigation
  reaches them by stable pane identity, exactly as it reaches status
  columns; no new navigation model.

**No prefix chord is added, deliberately.** `keyboard.service.ts:378-387`
records that `prefix+x` ("close current pane") is unimplemented because
"the board has no focused-pane model to act on". A `prefix+k` park
chord would hit the identical blocker, so adding one now would mean
either shipping a dead binding in the help overlay or building a
focused-pane model inside this change. `k` is free (bound keys today:
`c n p l w & x , 0-9 ? t /` and `Escape`) and is the natural reservation
if a later change adds that model.

**No global unmodified key**, per the doc's hard rule — a parked
file-explorer card is precisely the case where a bare key would be
stolen from a TUI.

## Rejected alternatives

### Reuse `pane.move` to a dedicated "parked" workspace

Rejected. It changes herdr state to change a drawing, moves the pane out
of the workspace it belongs to, is destructive-adjacent (`pane.move` can
cascade a tab or workspace closed — tier-3 spec), and cannot express
three parked columns without three workspaces. The operator asked to
tidy their board, not to reorganise their herdr.

### A sixth status, `parked`, in `AgentStatus`

Rejected. `AgentStatus` is herdr's enum
(`packages/schema/src/herdr.ts:28`), mirrored from herdr's Rust source.
Adding a member kanhrd invents would corrupt a mirrored type, break the
"status membership is herdr's fact" contract, and make one parked column
possible where the operator asked for many, named.

### Parking as a filter chip ("hide these cards")

Rejected as not the ask, and worse than the ask: a hidden card is gone,
and the operator wants their file-explorer *reachable* — parked, not
hidden. It would also collide with the existing hidden-status chips.

### Drag first, menu later — partly superseded by Q1's grant

The *ordering* stands; the framing does not. `docs/UX-GUIDELINES.md`
says "drag-drop must work or not appear", and the **unamended** docs
forbid the affordance, so until the amendment lands the correct read is
*not appear* — phase A therefore ships menu-first. But drag is not a
mere accelerator: Q1 is granted and dragging into a user-defined column
is what the feature is for. Menu-first still earns its place, because it
makes phase A complete and useful on its own and gives the keyboard path
a door that does not depend on pointer input, which is what the
accessibility requirement wanted anyway.

## Delivery order

Phase A is self-contained: SPA-only, no wire change, no dependency on
`add-l-brand-neo-shepherd-redesign` beyond the card overflow menu that
is already shipped in `card.html`. Phase B has Q1 granted (2026-09-10) and needs only the
doc amendment landed. Phase C needs a spike against a live herdr. Nothing in B or C
changes A's data model, so a slip in either does not block A.
