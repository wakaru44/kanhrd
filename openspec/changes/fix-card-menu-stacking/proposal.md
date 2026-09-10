## Why

Opening a card's overflow menu draws the menu **underneath the next
card's inline action buttons**. The last menu row — `rest`, the
destructive one — is the row that collides.

Measured on the live board at 1560x1000, dark theme:

- open menu box: `top 330, bottom 447`
- next card's `.actions-inline` box: `top 411, bottom 437`
- `overlaps: true`
- `document.elementFromPoint()` at the centre of the overlap returns a
  node that is **not inside the menu**

So the next card's buttons do not merely look wrong on top of the menu,
they take the clicks. A user aiming at `rest` in the menu can hit the
neighbouring card's split or close icon instead. The functionality is
duplicated (the same actions sit inline on the card), which is why this
has been survivable rather than dangerous — but the two controls it can
land on are a split and a session close, so it is one mis-aim away from
being destructive.

### Root cause

`.card-actions` sets `position: relative; z-index: 1` (`card.scss:225-228`),
which creates a **stacking context**. The menu's own `z-index: 2`
(`card.scss:274-278`) is therefore scoped *inside* that context: it can
only stack against its siblings within the same card's `.card-actions`.

Against the *next* card, the comparison is between the two
`.card-actions` elements — both `z-index: 1`, and the later one wins on
document order. Raising the menu's z-index cannot fix this; the number
is being compared in the wrong context.

### The second problem in the same place

`.column-body` sets `overflow-y: auto` (`column.scss:53`). An absolutely
positioned menu is clipped by that scroll container, so the last card in
a column has its menu cut off at the column's bottom edge regardless of
stacking. This is a different failure with the same cause — the menu is
positioned in normal flow inside a scrolling, stacking-context-forming
ancestor — and fixing only the z-index would leave it.

Both are addressed here because shipping the first alone produces a menu
that is correctly on top and still truncated.

## What Changes

- The card lifts its own stacking while its menu is open, so the open
  card outranks its neighbours instead of losing to document order.
- The menu escapes `.column-body`'s clip. `@angular/cdk` is already a
  dependency and `Overlay` with a connected position strategy is the
  sanctioned tool; the menu keeps its current DOM contract (`role="menu"`,
  `role="menuitem"`, arrow navigation, Escape, focus return) so nothing
  in `card.spec.ts` about keyboard behaviour changes meaning.
- No copy, token, capability or wire change.

## Impact

- Affected specs: `board-card-actions` (new capability covering the
  card's action affordances, which tier-3 introduced and the redesign
  restyled without ever owning their stacking).
- Affected code: `apps/web/src/app/board/card.ts`, `card.html`,
  `card.scss`; possibly `column.scss`.
- Affected tests: `apps/web/src/app/board/card.spec.ts` gains stacking
  and clipping assertions. `e2e/mobile.spec.ts` assertion [5][6]
  (overflow reachable without hover, items tappable) must keep passing.
