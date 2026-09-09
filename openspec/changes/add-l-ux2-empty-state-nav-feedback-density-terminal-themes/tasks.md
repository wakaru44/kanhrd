## 1. Empty state

- [x] 1.1 `EmptyState` component: next-step guidance (sample config +
      start command) instead of a bare "no hosts" line —
      `apps/web/src/app/board/empty-state.ts` (+ html/scss)
- [x] 1.2 5s all-disconnected grace period before showing the empty state,
      to avoid flashing it during a normal cold-load handshake

## 2. Rail as navigator

- [x] 2.1 Routes for `/workspace/:workspaceId` and
      `/workspace/:workspaceId/tab/:tabId` — `apps/web/src/app/app.routes.ts`
- [x] 2.2 Rail renders a persistent scope pill sourced from
      `PanesStore.scopeSignal`, with a clear-scope action —
      `apps/web/src/app/rail/rail.ts` (+ html/scss)

## 3. Feedback layer

- [x] 3.1 `ToastService`: signals-based queue, auto-dismiss or
      `persistent`, dismiss-by-id — `apps/web/src/app/state/toast.service.ts`
- [x] 3.2 `ToastHost`: top-right stacked toasts, mounted once in
      `app.html` — `apps/web/src/app/shared/toast-host.ts` (+ html/scss)
- [x] 3.3 `KeyboardService`'s `Escape` handling dismisses the top toast via
      `ToastService.dismissTop()` — `apps/web/src/app/state/keyboard.service.ts`
- [x] 3.4 Terminal loading state: `loading` signal drives a
      `.terminal-loading` overlay from request to first content/failure —
      `apps/web/src/app/pane-detail/pane-detail.ts`

## 4. Density and icons

- [x] 4.1 Cards move to `@lucide/angular` icons
      (`LucideArrowRight`/`LucideX`/`LucidePencil`) in place of ad-hoc
      glyphs — `apps/web/src/app/board/card.ts`, `rail/rail.ts`
- [x] 4.2 Denser card layout for boards with many panes —
      `apps/web/src/app/board/card.scss`

## 5. Virtual scroll and drag scaffold

- [x] 5.1 `cdk-virtual-scroll-viewport` (`itemSize=84`) in board columns —
      `apps/web/src/app/board/column.ts` (+ html)
- [x] 5.2 Disabled `cdkDropList`/`cdkDrag` scaffold preserved on
      columns/cards (`cdkDropListDisabled`/`cdkDragDisabled` both `true`),
      reserved for a future drag-to-"park" column

## 6. Terminal themes

- [x] 6.1 `TerminalThemeService`: single shared palette applied to every
      xterm.js instance app-wide, `auto` follows `ThemeService`, six
      built-in palettes (Standard Dark/Light, Catppuccin Mocha, Monokai,
      Solarized Dark/Light) — `apps/web/src/app/state/terminal-theme.service.ts`
- [x] 6.2 Persist selection to `localStorage['kanhrd.terminal-theme']`

## 7. Validator

- [x] 7.1 `openspec validate add-l-ux2-empty-state-nav-feedback-density-terminal-themes --strict` passes with zero errors

## Note for archiving

This change was authored while the underlying commit was still in flight
(files present on disk, uncommitted, at authoring time — no landing commit
hash yet). Do not archive until the corresponding commit lands; then add
the commit hash to `proposal.md`'s Why section and run
`openspec archive add-l-ux2-empty-state-nav-feedback-density-terminal-themes --yes`.
