## Why

L-UX shipped theming, settings, stats badges, and a mobile drawer, but
kanhrd still had rough edges once real usage started: a bare "no hosts"
message with no next step, a nav rail with no URL-addressable scope, no
in-app feedback layer (errors/disconnects only showed in the browser
console), a terminal pane that appeared to hang before its first content
arrived, cramped cards on boards with many panes, and every xterm.js
terminal locked to two hardcoded palettes. This is a retroactive OpenSpec
record of the L-UX2 polish pass, written after the fact because — like
L-UX — the work landed without a proposal. As of this writing the work is
implemented on disk but not yet committed; this proposal documents it
ahead of the landing commit so openspec stays in step with the lane.

## What Changes

- Add `EmptyState` (`apps/web/src/app/board/empty-state.ts`): replaces the
  old one-line "no hosts configured" text with an actual next step (sample
  `kanhrd.yaml` snippet + start command). Shown when zero hosts are
  configured, or when every configured host has been disconnected for more
  than a 5s grace period (avoids flashing on a normal cold-load handshake).
- Turn the nav rail into a URL-scoped navigator: routes gain
  `/workspace/:workspaceId` and `/workspace/:workspaceId/tab/:tabId`
  (`apps/web/src/app/app.routes.ts`), `PanesStore.scopeSignal` is the single
  source of truth, and the rail renders a persistent scope pill showing the
  active workspace/tab with a clear-scope action.
- Add a toast + inline-error feedback layer: `ToastService`
  (`apps/web/src/app/state/toast.service.ts`, signals-based queue,
  auto-dismiss or `persistent` for things like "connection lost" that get
  dismissed by id on reconnect) and `ToastHost`
  (`apps/web/src/app/shared/toast-host.ts`, mounted once in `app.html`,
  top-right stacked). `KeyboardService`'s `Escape` handling now dismisses
  the top toast via `ToastService.dismissTop()`.
- Add a terminal loading state in pane detail: a `loading` signal true from
  the moment a `pane.read` request goes out until first content lands (or
  fails), driving a `.terminal-loading` overlay instead of an apparently
  frozen terminal.
- Card density + icon polish: kanban cards move to `@lucide/angular` icons
  (`LucideArrowRight`, `LucideX`, `LucidePencil`) instead of ad-hoc glyphs,
  and a denser card layout for boards with many panes.
- Add CDK virtual scroll to board columns (`cdk-virtual-scroll-viewport`,
  `itemSize=84`) so columns with more than ~20 panes stay cheap to render.
- Preserve a disabled `cdkDropList`/`cdkDrag` scaffold on columns/cards
  (`[cdkDropListDisabled]="true"`, `[cdkDragDisabled]="true"`) — wired but
  inert, reserved for a future drag-to-move "park" column rather than
  ripped out and re-added later.
- Add `TerminalThemeService`
  (`apps/web/src/app/state/terminal-theme.service.ts`): every terminal in
  the app renders with the same xterm.js palette (per product decision,
  users tell panes apart by title/host chip, not terminal color), selectable
  from `auto` (follows the SPA's `ThemeService` dark/light) or one of six
  built-in palettes — Standard Dark, Standard Light, Catppuccin Mocha,
  Monokai, Solarized Dark, Solarized Light — persisted to
  `localStorage['kanhrd.terminal-theme']`.

## Capabilities

### New Capabilities
- `l-ux2-empty-state-nav-feedback-density-terminal-themes`: board
  onboarding empty state, URL-scoped rail navigation, a toast/inline-error
  feedback layer, terminal loading affordance, denser virtualized card
  columns with a dormant drag scaffold, and selectable per-terminal color
  themes. All client-side (Angular SPA) presentation state, no bridge or
  wire-contract changes.

### Modified Capabilities
(none — purely additive client presentation on top of `tier-1-kanban`,
`tier-2-terminal`, `tier-3-lifecycle`, and `ux-theme-and-polish`)

## Impact

- Affected code: `apps/web/src/app/board/empty-state.ts` (+ html/scss),
  `apps/web/src/app/state/toast.service.ts`,
  `apps/web/src/app/shared/toast-host.ts` (+ html/scss),
  `apps/web/src/app/state/terminal-theme.service.ts`,
  `apps/web/src/app/pane-detail/pane-detail.ts`,
  `apps/web/src/app/board/card.*`, `apps/web/src/app/board/column.*`,
  `apps/web/src/app/rail/rail.*`, `apps/web/src/app/app.routes.ts`,
  `apps/web/src/app/app.html`.
- Affected systems: none outside the web SPA — no bridge, schema, or wire
  contract changes.
- Status at time of writing: implemented on disk, not yet committed. This
  proposal is authored ahead of the landing commit at the foreman's
  request; archive once the commit lands (see note in tasks.md).
