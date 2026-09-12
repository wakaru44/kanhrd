# Tasks — add-pane-tab-hierarchy

## 1. Copy

- [x] 1.1 `nav.tabStrip` = `tabs in this workspace` and
      `nav.tabStripItem` = `{name} — {count} cards`, lowercase and in
      herdr's vocabulary.
- [x] 1.2 Record both rows in `docs/BRAND.md`'s copy table.

## 2. The tab strip

- [x] 2.1 `pane-detail/tab-strip.{ts,html,scss}` — the tabs of the route
      pane's workspace on its host, from `PanesStore.tabsSignal`.
- [x] 2.2 Each entry is a `routerLink` to a pane of that tab, never a
      control that swaps the terminal without changing the URL.
- [x] 2.3 The current tab is marked by weight plus an `--ochre-line`
      underline and `aria-current="page"` — never colour alone.
- [x] 2.4 Roving tabindex, arrow keys, Home/End, the contract
      `card-switcher.ts` already implements.
- [x] 2.5 A workspace with one tab renders no strip: no empty rail, no
      disabled control.
- [x] 2.6 Entries scroll inside the strip; the page never scrolls
      horizontally, phone width included.

## 3. Two levels, visibly

- [x] 3.1 The tab strip sits above the card switcher; the card switcher
      keeps its own contract unchanged.
- [x] 3.2 The pane level is subordinate by type scale and indent, not by
      a second kind of chrome or a second border treatment.

## 4. The keyboard follows the view

- [x] 4.1 `KeyboardService.registerTabNavigator(handle | null)`, in the
      same seam `registerCardSwitcher` uses.
- [x] 4.2 `cycleTab` defers to the navigator when one is registered, and
      keeps today's board-scope behaviour when none is.
- [x] 4.3 Pane detail registers on mount, passes `null` on destroy.
- [x] 4.4 `prefix + n` / `prefix + p` on the pane route navigate to the
      next / previous tab's pane, wrapping.

## 5. Verify

- [x] 5.1 `pnpm --filter @kanhrd/web test`.
- [x] 5.2 `pnpm -w typecheck`.
- [x] 5.3 `pre-commit run --files <touched>`.
- [x] 5.4 `openspec validate add-pane-tab-hierarchy --strict`.
- [x] 5.5 Look at it: build the SPA and shoot the pane route against the
      mocked bridge.
