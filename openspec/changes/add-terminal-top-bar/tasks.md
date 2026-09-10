## 0. Maintainer decisions

Answered 2026-09-10 unless marked open. See `design.md` § "Maintainer
decisions" for the reasoning; do not re-ask.

- [x] 0.1 D1 — **amend the doc; the switcher renders at every width,
      phone width included.** The maintainer's reading: forbidding pane
      switchers on mobile (and probably on the web too) makes no sense;
      that paragraph is overblown feedback from the early MVP, not the
      MLP being built now, and a pane switcher is wanted in the web
      terminal view for panels in the same view. A maintainer amends
      `docs/UX-GUIDELINES.md` § Mobile → Pane detail to permit a
      route-navigator strip
- [x] 0.2 D2 — **strings approved as written, but they stay OUT of
      `docs/BRAND.md`'s approved-copy table for now.** `nav.cardSwitcher`
      = `cards in this tab`, `nav.cardSwitcherItem` = `{name} — {status}`
      go into `shared/copy.ts` under `nav`, beside the existing
      `nav.statusSwitcher` / `nav.statusSwitcherItem` (`copy.ts:125-126`)
      whose shape they mirror. **No component-local copy constant**: the
      pending-copy pattern this change originally cited was removed in
      commit `f173992` ("give every user-facing string one home in
      copy.ts"), which folded `CARD_COPY` and four siblings back into
      `copy.ts`. Do **not** add `docs/BRAND.md` table rows and do **not**
      re-ask; a maintainer promotes them if and when the table grows
- [x] 0.3 D3 — **postponed. Not in this change.** The maintainer's
      reasoning: the keyboard experience should be familiar and
      equivalent to herdr — herdr's hierarchy and bindings triumph for
      keyboard navigation — and a pair of chords whose only job is
      "jump to the next busy thing" is of dubious value once the
      herdr-equivalent tab and pane movements work. Do not re-ask.
      Two follow-ups this raised are recorded in `design.md`
      § "Maintainer decisions" under D3 and are **not** this change's
      to answer
- [x] 0.4 D4 — **the pinned set gains one glyph:
      `LucideGalleryHorizontal`**, a leading marker on the switcher
      strip. Switcher entries themselves keep the CSS status dot plus
      the card name (no per-entry icon), and the breadcrumb separator
      stays the textual `/` the board card's `path()` already uses.
      Verified present in `@lucide/angular@1.43.0`. **A second glyph,
      `LucideSquareSplitHorizontal`, joins it** for the next-card button
      (task 3.6) — a window divided into two panes, for "hop to the
      other card sharing this tab". The pinned set goes from eighteen
      to twenty. Two edits are the maintainer's, not this change's: the
      rows in `docs/DESIGN-SYSTEM.md`'s pinned icon table
      naming `LucideGalleryHorizontal`, its selector
      `svg[lucideGalleryHorizontal]`, and the use "card switcher on the
      terminal bar", plus the count in the
      surrounding prose if it names eighteen. This change adds the
      re-export in `apps/web/src/app/shared/icons.ts`

## 1. Sibling derivation (no wire change)

- [ ] 1.1 `pane-detail.ts` — a `siblings` computed over
      `PanesStore.panesSignal`: same `host`, same `tab.id` as the route
      pane, in store iteration order, current pane included
- [ ] 1.2 `pane-detail.ts` — extract the display-name precedence used by
      the header title into one exported helper, so the title and the
      switcher entries can never disagree. Note in its doc comment that
      `add-pane-workdir-and-task-title` extends this precedence with
      `label` and that this is the single place to change
- [ ] 1.3 `pane-detail.spec.ts` — siblings are derived from the store
      with no additional bridge request; a pane in another change or on
      another host is excluded; a tab of one yields an empty switcher
      input

## 2. The switcher component

- [ ] 2.0 `apps/web/src/app/shared/icons.ts` — add
      `LucideGalleryHorizontal` and `LucideSquareSplitHorizontal` to the
      import block and the `export` block, keeping both alphabetical,
      with the existing file comment convention. The
      `docs/DESIGN-SYSTEM.md` pinned-table rows are the maintainer's
      edit (task 0.4), not this change's

- [ ] 2.1 `pane-detail/card-switcher.ts` — a presentational component
      taking the sibling list and the current pane key, emitting nothing
      (entries are `routerLink`s). Modelled on
      `board/status-switcher.ts`: inputs in, no owned selection state
- [ ] 2.2 `shared/copy.ts` — add `nav.cardSwitcher` = `cards in this
      tab`, `nav.cardSwitcherItem` = `{name} — {status}` and
      `nav.nextCard` = `next card in this tab` beside the
      existing `nav.statusSwitcher` / `nav.statusSwitcherItem`, whose
      `{}`-interpolation shape (`fill`) they mirror. No component-local
      copy constant — see task 0.2
- [ ] 2.3 `card-switcher.html` — one `<a routerLink>` per sibling with a
      status dot, the display name, `aria-current="page"` on the current
      one, and an accessible name carrying name plus status word
- [ ] 2.4 `card-switcher.ts` — keyboard: `ArrowLeft` / `ArrowRight` /
      `Home` / `End` move focus only (roving `tabindex`), `Enter` /
      `Space` navigate, `Escape` returns focus to the terminal.
      Nothing global is registered
- [ ] 2.5 `card-switcher.scss` — tokens only; selection is `--fw-semi`
      plus a 2px `--ochre-line` underline; `overflow-x: auto` on the
      strip; entries meet `--touch-target-min` with `--sp-2` separation
      under `pointer: coarse`; `scroll-into-view` for the current entry
      uses `behavior: 'auto'` under `prefers-reduced-motion: reduce`
- [ ] 2.6 `card-switcher.spec.ts` — renders one entry per sibling;
      marks the current one; arrow keys move focus without navigating;
      `Enter` navigates; `Escape` restores terminal focus; no entry
      renders for a tab of one

## 3. Wiring it into the header

- [ ] 3.1 `pane-detail.html` — breadcrumb `workspace / tab` between the
      back control and the title, in `--ink-mute`; the back control
      stays the first focusable element
- [ ] 3.2 `pane-detail.html` — render `<app-card-switcher>` only when
      the tab holds more than one card
- [ ] 3.3 `pane-detail.scss` — header rules for the breadcrumb and the
      switcher slot. Keep the edit confined to `.detail-header`; the
      concurrent edge-padding tab owns `.pane-detail` /
      `.terminal-container` padding — take theirs on any `padding`
      conflict (see design.md, "Concurrent edit")
- [ ] 3.4 `pane-detail.scss` — below `--breakpoint-mobile`: breadcrumb
      collapses to the tab name; the switcher **still renders** as the
      same horizontally scrolling strip, with the back control first and
      visible without scrolling, entries at `--touch-target-min`
      separated by `--sp-2`, and `overflow-x` on the strip so the page
      itself never scrolls horizontally
- [ ] 3.5 `pane-detail.spec.ts` — the terminal refits when the header
      gains the switcher row and the prompt stays reachable; at a
      390px-wide viewport the switcher renders and
      `documentElement.scrollWidth <= clientWidth`
- [ ] 3.6 `pane-detail.html` / `.ts` — the **next-card button**:
      `LucideSquareSplitHorizontal`, accessible name `nav.nextCard`,
      rendered only when the tab holds more than one card, dispatching
      the same `next-sibling-card` action as `prefix + o` (one shared
      handler, never a second implementation of "which card is next").
      It does not open, focus or scroll the switcher. Placement: the
      title row, after the back control — the one detail a maintainer
      may want to move, since the strip already occupies its own row
- [ ] 3.7 `pane-detail.spec.ts` — the button is absent in a tab of one,
      routes to the sibling in a tab of two, and lands where two
      `prefix + o` presses land in a tab of three; it meets
      `--touch-target-min` at 390px

## 4. Keyboard

Two actions, per D3's follow-up: `prefix + o` keeps herdr's meaning
(next pane) and `prefix + i` / `Ctrl+Alt+I` opens the switcher.

- [ ] 4.1 `keyboard.service.ts` — a single named constant enumerating
      the direct chords recognized despite a focused input, holding
      exactly `Ctrl+Alt+I` → `focus-card-switcher`, with a comment
      stating that every entry is a key the pane can no longer receive
- [ ] 4.2 `keyboard.service.ts` — in `handleKeydown`, check that list
      *before* the `isTextInputFocused` early return; skip any chord
      equal to the effective prefix; act only when the action reports
      itself available, and otherwise call neither `preventDefault()`
      nor `stopPropagation()`
- [ ] 4.3 `keyboard.service.ts` — add the `focus-card-switcher` action
      with the chord binding `prefix + i` and the direct binding
      `Ctrl+Alt+I`, category `Navigation`, so both appear in the help
      overlay
- [ ] 4.4 `keyboard.service.ts` — add the `next-sibling-card` action,
      chord-only on `prefix + o`, category `Navigation`, sitting beside
      the existing `next-tab` / `prev-tab` / `last-tab` entries it is
      the pane-level counterpart to. Chord-only, so it takes no key
      from the pane
- [ ] 4.5 `keyboard.service.ts` — dispatch: `focus-card-switcher`
      focuses the switcher's current entry when pane detail is showing
      a tab with more than one card; `next-sibling-card` routes to the
      next sibling in store order, wrapping past the last; both no-op
      in a tab of one
- [ ] 4.6 `keyboard.service.spec.ts` — a focused-input `Ctrl+Alt+K` is
      passed through untouched; `Ctrl+Alt+I` with the switcher available
      is recognized and stops propagation; `Ctrl+Alt+I` with no switcher
      is passed through; a prefix of `Ctrl+Alt+I` arms the chord instead
- [ ] 4.7 `keyboard.service.spec.ts` — `prefix + o` routes to the next
      sibling, wraps from last to first, and is a no-op in a tab of one
- [ ] 4.8 `keyboard-help-overlay.spec.ts` — all three bindings are
      listed under Navigation

## 5. Verification

- [ ] 5.1 `openspec validate add-terminal-top-bar --strict`
- [ ] 5.2 `pnpm --filter @kanhrd/web test`
- [ ] 5.3 `pnpm --filter @kanhrd/web build`
- [ ] 5.4 `bash tools/lint-scss-tokens.sh`
- [ ] 5.5 `pre-commit run --all-files`
- [ ] 5.6 Playwright `mobile` project (390 × 844): the detail route
      renders the switcher, the back control is visible without
      scrolling, every entry meets `--touch-target-min`, and the page
      does not scroll horizontally
- [ ] 5.7 Against a private herdr fixture (never the operator's socket —
      `HERDR_SOCKET_PATH=/tmp/...`), open a tab with two panes and
      confirm `Ctrl+Alt+I` from inside a running program focuses the
      switcher while the same program still receives `Ctrl+Alt+K`
