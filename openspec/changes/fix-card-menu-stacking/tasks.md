## 1. Stacking

- [x] 1.1 Lift the card's stacking while its menu is open — `Card`
      already exposes `menuOpen()` and a host binding, so a host class
      plus `:host(.menu-open) { position: relative; z-index: N }` is the
      minimal change. Do not raise `.overflow-menu`'s own `z-index`:
      the number is compared in the wrong stacking context and raising
      it cannot work.

      Done by 2.1 instead, not by a host class: once the menu is portalled
      into the CDK overlay container it is no longer inside any card's
      `.card-actions`, so there is nothing left for a neighbour to outrank.
      A `:host(.menu-open) { z-index }` on top of that would be dead code.
      `.card-actions` keeps its `z-index: 1` — it still has to sit above
      the stretched link overlay — but it no longer contains the menu.
- [x] 1.2 Component test: with a menu open, `elementFromPoint` at the
      centre of the overlap with the next card's `.actions-inline`
      returns a node inside the menu. This is the assertion that would
      have caught the bug; write it before the fix and watch it fail.

## 2. Clipping

- [x] 2.1 Move the menu into a CDK `Overlay` with a connected position
      strategy anchored to the trigger, so `.column-body`'s
      `overflow-y: auto` cannot clip it. `@angular/cdk` is already a
      dependency — do not add one.
- [x] 2.2 Close or reposition the menu on column scroll; a detached menu
      floating over unrelated cards is worse than the clip it replaces.
- [x] 2.3 Component test: open the menu from the last card of a scrolled
      column and assert every item is inside the viewport.

## 3. Contract preservation

- [x] 3.1 Re-run `card.spec.ts` in full: `role="menu"`/`menuitem`,
      arrow/Home/End, Escape returning focus to the trigger,
      `aria-expanded`, and focus moving into the menu on open all keep
      their current meaning. Update the tests' *queries* if the overlay
      moves the DOM, never their *assertions*.
- [x] 3.2 Verify the document-click-to-dismiss path still works once the
      menu is outside the card's subtree — `onDocumentClick` tests
      containment against `.card-actions`, which an overlay breaks.

## 4. Verification

- [x] 4.1 `pnpm --filter @kanhrd/web test`
- [x] 4.2 `pnpm --filter @kanhrd/web build`
- [x] 4.3 `bash tools/lint-scss-tokens.sh`
- [ ] 4.4 NOT DONE — needs the operator's live board (a running herdr).
      The two hit-test specs above cover the same two failures in karma:
      before the fix, `elementFromPoint` at the overlap returned the
      neighbour's control and 2 of 4 menu items were unhittable at the end
      of a scrolling container; after it, both pass.
      Original wording: Manual: reproduce the original report — open the menu on a card
      with a card below it and confirm the last item is both visible and
      clickable.
