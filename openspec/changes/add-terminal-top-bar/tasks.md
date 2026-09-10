## 0. Maintainer decisions (before any code)

- [ ] 0.1 D1 — `docs/UX-GUIDELINES.md` § Mobile → Pane detail currently
      forbids a pane switcher below 900px. Confirm desktop-only, or
      amend the paragraph. The spec as written is desktop-only; a change
      of answer changes task 3.5 and one spec scenario
- [ ] 0.2 D2 — approve `nav.cardSwitcher` / `nav.cardSwitcherItem` for
      `docs/BRAND.md`'s approved-copy table, or supply substitutes.
      Until approved they live in a component-local `SWITCHER_COPY`
- [ ] 0.3 D3 — confirm that `Ctrl+Alt+[` / `Ctrl+Alt+]` for
      previous / next sibling are **not** wanted in this lane
- [ ] 0.4 D4 — confirm no new lucide icon is added to the pinned set

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
      with no additional bridge request; a pane in another lane or on
      another pen is excluded; a lane of one yields an empty switcher
      input

## 2. The switcher component

- [ ] 2.1 `pane-detail/card-switcher.ts` — a presentational component
      taking the sibling list and the current pane key, emitting nothing
      (entries are `routerLink`s). Modelled on
      `board/status-switcher.ts`: inputs in, no owned selection state
- [ ] 2.2 Same file — `SWITCHER_COPY`, typed and `as const`, with the
      comment naming the `copy.ts` keys it is destined for, exactly as
      `CARD_COPY` in `board/card.ts` does
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
      renders for a lane of one

## 3. Wiring it into the header

- [ ] 3.1 `pane-detail.html` — breadcrumb `field / lane` between the
      back control and the title, in `--ink-mute`; the back control
      stays the first focusable element
- [ ] 3.2 `pane-detail.html` — render `<app-card-switcher>` only when
      the lane holds more than one card
- [ ] 3.3 `pane-detail.scss` — header rules for the breadcrumb and the
      switcher slot. Keep the edit confined to `.detail-header`; the
      concurrent edge-padding lane owns `.pane-detail` /
      `.terminal-container` padding — take theirs on any `padding`
      conflict (see design.md, "Concurrent edit")
- [ ] 3.4 `pane-detail.scss` — below `--breakpoint-mobile`: breadcrumb
      collapses to the lane name, switcher is not rendered
- [ ] 3.5 `pane-detail.spec.ts` — the terminal refits when the header
      gains the switcher row and the prompt stays reachable; at a
      390px-wide viewport no switcher renders and
      `documentElement.scrollWidth <= clientWidth`

## 4. Keyboard

- [ ] 4.1 `keyboard.service.ts` — a single named constant enumerating
      the direct chords recognized despite a focused input, holding
      exactly `Ctrl+Alt+O` → `focus-card-switcher`, with a comment
      stating that every entry is a key the pane can no longer receive
- [ ] 4.2 `keyboard.service.ts` — in `handleKeydown`, check that list
      *before* the `isTextInputFocused` early return; skip any chord
      equal to the effective prefix; act only when the action reports
      itself available, and otherwise call neither `preventDefault()`
      nor `stopPropagation()`
- [ ] 4.3 `keyboard.service.ts` — add the `focus-card-switcher` action
      with the chord binding `prefix + o` and the direct binding
      `Ctrl+Alt+O`, category `Navigation`, so both appear in the help
      overlay
- [ ] 4.4 `keyboard.service.ts` — dispatch: focus the switcher's current
      entry when pane detail is showing a lane with more than one card;
      no-op otherwise
- [ ] 4.5 `keyboard.service.spec.ts` — a focused-input `Ctrl+Alt+K` is
      passed through untouched; `Ctrl+Alt+O` with the switcher available
      is recognized and stops propagation; `Ctrl+Alt+O` with no switcher
      is passed through; a prefix of `Ctrl+Alt+O` arms the chord instead
- [ ] 4.6 `keyboard-help-overlay.spec.ts` — both bindings are listed
      under Navigation

## 5. Verification

- [ ] 5.1 `openspec validate add-terminal-top-bar --strict`
- [ ] 5.2 `pnpm --filter @kanhrd/web test`
- [ ] 5.3 `pnpm --filter @kanhrd/web build`
- [ ] 5.4 `bash tools/lint-scss-tokens.sh`
- [ ] 5.5 `pre-commit run --all-files`
- [ ] 5.6 Playwright `mobile` project (390 × 844): the detail route
      renders no switcher, the back control is visible without
      scrolling, and the page does not scroll horizontally
- [ ] 5.7 Against a private herdr fixture (never the operator's socket —
      `HERDR_SOCKET_PATH=/tmp/...`), open a lane with two panes and
      confirm `Ctrl+Alt+O` from inside a running program focuses the
      switcher while the same program still receives `Ctrl+Alt+K`
