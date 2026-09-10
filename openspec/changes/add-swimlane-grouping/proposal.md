## Why

The board answers one question well: *what needs attention?* Status
columns put blocked and working where the eye lands first.

It answers a second question badly: *whose work is this?* On a single
host with one workspace that question does not arise. Across several
hosts, or one host with checkouts of three different repositories, every
card lands in the same five columns and the operator reads the
`workspace / tab` path on each card to reconstruct the grouping by eye.

Kanban has a name and a shape for this. A **swimlane** is a horizontal
band that cuts the columns, grouping cards by a chosen dimension while
the columns keep their meaning. Trello, Jira and Wekan all work this
way, and the operator arrives already knowing how to read one.

This also puts the word `lane` to work. The vocabulary change
(`rename-vocabulary-to-herdr-terms`) reserves it for exactly this and
ships no feature using it; this is that feature.

## What Changes

- A board setting chooses the swimlane dimension: **none** (today's
  board, and the default), **host**, **repository**, **checkout path**,
  or **tab**.
- With a dimension chosen, the board renders one horizontal band per
  distinct value, in a defined order, each band containing the full set
  of status columns.
- Status columns remain the vertical axis and keep their meaning,
  ordering and filter behaviour. Swimlanes group; they do not reclassify.
- The setting is a board arrangement held in the browser, like the
  filters and the density setting. It changes nothing on herdr and adds
  no wire method.

```
group by: working directory

                working      blocked      idle
  ┌─ ~/kanhrd ──────────────────────────────────────┐
  │               [card]                     [card] │
  │               [card]                            │
  └─────────────────────────────────────────────────┘
  ┌─ ~/herdr ───────────────────────────────────────┐
  │               [card]      [card]                │
  └─────────────────────────────────────────────────┘
```

## Maintainer decisions — resolved 2026-09-10

Do not re-ask these.

**Q1 — group by repository or by checkout path? Both.** Grouping by
repository keeps linked worktrees of one repo together, which is the
point of having the repo name at all. But the operator's own layout is
`../services` as the working root with checkouts at
`../services/aservice`, where the checkout path is the meaningful
grouping and the repository is not. Both are already on `Pane.project`
(`repo_name`, `checkout_path`), so this is one extra enum value and one
extra label resolver — a setting, not a design fork. Ship both.

**Q4 — how do swimlanes compose with `add-parked-columns`? They are
orthogonal, and there was no real conflict.** A parked column is a
*column*: it sits on the vertical axis beside the status columns and
behaves like one. A swimlane is a *band*: it sits on the horizontal axis
and cuts across every column, parked or status. A card's band is derived
from its data; its column is either derived from `agent_status` or set
by the operator parking it. The two axes never contend for the same
card, so each feature can be built without waiting on the other.

The only real interaction is that a parked column appears **in every
band**, exactly as a status column does — a band renders the full set of
visible columns, and "parked" is one of them.

**Q2 — an empty band is hidden.** Status columns keep their slots so
neighbours do not jump horizontally; that reasoning does not carry to
bands, where an empty band is dead vertical space between two populated
ones. A band with no cards in any column is not rendered.

**Q3 — mobile: the pager pages within the current band.** Swimlanes stay
below 900px rather than becoming desktop-only, because grouping by host
matters most on the screen with the least room. The band is chosen
first, then the existing one-column-per-screen pager operates inside it.

**Q5 — one virtual scroller per column per band.** The existing
threshold (virtualize above 50 cards in a column) applies per column per
band, which is the correct granularity: a band's column is the scrolling
region. Bands multiply the scrollers, so verify the count stays sane at
the documented fixture size before shipping.

## Impact

- Affected specs: `board-swimlanes` (new); interacts with
  `tier-1-kanban`'s board layout and with `board-parked-columns`.
- Affected code: `apps/web/src/app/board/**`,
  `apps/web/src/app/state/settings.service.ts`, the Settings screen.
- No bridge, wire, schema or capability change.

## Status

**Proposal.** Every gate question is answered, so this is implementable
whenever it is scheduled. It does not block and is not blocked by
`add-parked-columns`: the two features occupy different axes.
