# Design — add-pane-destinations

## The inline card action row stays at 26 × 26, below the touch target

The card's inline action controls measure **26 × 26 CSS pixels**.
`--touch-target-min` is **40 × 40**. The row therefore does not meet the
touch-target minimum, and that is a decision, not an oversight.

It was taken by the maintainer with the measurements in hand:

- the controls are 26 × 26 today, and have been through the whole
  redesign;
- `--touch-target-min` is 40 × 40;
- a card is 260px wide, and the action row shares its line with the status
  label and the meta chips (agent identity, elapsed, line count);
- four 40px controls plus their gaps come to roughly 184px on that line.

The rule they measure against does not currently cover these controls.
`docs/UX-GUIDELINES.md` names **card overflow triggers** and **every item
in an open overflow menu** as needing 40 × 40. Inline card actions are not
in that list. So this is an amendment to this change's own delta rather
than an exception carved out of the design system: the delta's
`board-card-actions` requirement drops the touch-target clause for the
inline row and keeps the two affordance clauses, which are what actually
changed in this redesign — every control is visible on first render and
none is revealed on hover.

**The cost lands on touch users specifically.** The board renders these
same cards on a phone (`apps/web/e2e/mobile.spec.ts` asserts the mobile
board in full), so a 26px target is a 26px target under a thumb. What
softens it, and the reason the shape survives review: below
`--breakpoint-mobile` a card renders its compact variant, where the inline
row folds into the single overflow trigger, and that trigger and every
item in the menu it opens DO meet 40 × 40. The 26px controls are the
pointer-width row.

Anyone finding a 26px target and reaching for a bug report should read
this paragraph first: it was chosen, with the numbers above on the table,
not missed. What would change the answer is evidence from the compact
variant — a touch user reaching a 26px control on a phone rather than the
40px trigger — because that would mean the mitigation above does not hold,
which is a different fact from the one this decision was made on.

## One destination list, three depths

`shared/destination-picker` is a single list used by the board's `+` menu
and by a card's move menu. It takes a `level` — `host`, `workspace` or
`tab` — because a creation is only ever as specific as the thing it
creates: a workspace lands on a host, a tab lands in a workspace, a pane
lands in a tab. A move lands in a tab too.

Two consequences worth stating, because both are load-bearing:

**A tab destination carries a pane already in that tab.** `pane.split`
narrows to a workspace with `workspace_id` and no further; without a
`target_pane_id` to point at, herdr resolves the tab itself from whatever
is focused. That is the original defect. A tab destination that does not
carry a pane cannot honour itself.

**The list renders inside the menu that opened it**, as a `role="group"`
of menu items, not as a second popover. `park in…` established that shape
and the reason is the keyboard: one menu means one arrow/Home/End/Escape
contract and one trigger owning the focus return. A nested popover needs
a second of each and buys nothing.

## Asking only when there is a question

The `+` menu asks for a destination when the board has no scope AND the
creation has more than one place it could land. The count comes from the
same `destinationsFor` the picker renders, so the decision to ask and the
list that appears cannot disagree.

A single candidate is not a question. On the common single-host,
single-workspace board nothing changes: the menu still acts on the first
press. The configuration-order fallback survives only for that case, named
`unscopedHost()` for what it is.
