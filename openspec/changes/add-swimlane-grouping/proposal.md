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
  board, and the default), **host**, **working directory**, or **tab**.
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

## Open questions for the maintainer

Deliberately unanswered — each one changes the design materially.

1. **Working directory from where?** `Pane.project` carries
   `repo_name`, `checkout_path` and `is_linked_worktree`, and there is
   an in-flight `pane-workdir-and-task-title` capability. Grouping by
   repository is not the same as grouping by checkout path, and linked
   worktrees make them diverge exactly where it matters.
2. **What happens to an empty band?** Status columns keep empty slots so
   neighbours do not jump. A swimlane with no cards in any column is a
   band of five empty columns — probably hidden, but that is a decision.
3. **Mobile.** The board below 900px is a one-column-per-screen pager.
   Swimlanes on top of paging is a second axis on a screen that already
   struggles with one. Options: swimlanes desktop-only, or the pager
   pages within the current band.
4. **Interaction with `add-parked-columns`.** That in-flight change adds
   user-created columns holding manually placed cards. A parked card
   inside a swimlane belongs to a band by its host/workdir/tab and to a
   column by the operator's choice — do parked columns appear in every
   band, in one band, or outside the swimlane structure entirely? These
   two features must be designed against each other before either
   ships, and this proposal does not assume which lands first.
5. **Virtualization.** Columns virtualize above 50 cards. Bands multiply
   the number of independent scrollers, and the current
   `cdk-virtual-scroll-viewport` per column assumes one scroll context
   per status.

## Impact

- Affected specs: `board-swimlanes` (new); interacts with
  `tier-1-kanban`'s board layout and with `board-parked-columns`.
- Affected code: `apps/web/src/app/board/**`,
  `apps/web/src/app/state/settings.service.ts`, the Settings screen.
- No bridge, wire, schema or capability change.

## Status

**Proposal only.** Not scheduled, not scoped for implementation, and
open questions 1 and 4 are blocking. Written now so the vocabulary
change has a real referent for `lane`, and so the parked-columns work
can be designed with this in view rather than around it.
