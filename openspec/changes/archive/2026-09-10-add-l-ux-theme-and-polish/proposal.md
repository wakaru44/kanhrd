## Why

kanhrd's tier 1-3 lanes shipped a working kanban/terminal/lifecycle client but
no theming, no user-configurable settings, no at-a-glance status duration,
and a desktop-only nav that was awkward on a phone. This is a retroactive
OpenSpec record of the L-UX polish pass that shipped on top of the tier-3
MLP, written after the fact because the work landed without a proposal.
Commit: `f80da59` (`feat(web): dark/light theme, settings screen, stats
badges, mobile drawer`).

## What Changes

- Add a `ThemeService` (signals + `localStorage['kanhrd.theme']` +
  `prefers-color-scheme` fallback) that stamps `data-theme` on `<html>`;
  `styles.scss` refactored into `[data-theme=dark|light]` custom-property
  blocks; header sun/moon toggle; xterm.js retheme via an effect that swaps
  the light/dark xterm theme live.
- Add a `/settings` route backed by a `SettingsService` persisting to
  `localStorage['kanhrd.settings']`, with four sections: Appearance (theme +
  density), Runtime (per-host advertised `outputPollIntervalMs`, plus a
  disabled "requested override" input flagged coming-soon), Servers
  (read-only — notes the host list is bridge-owned via
  `kanhrd.config.yaml`), and Data (clear-localStorage behind a
  `ConfirmModal`).
- Add discreet `.stats-badge` elements on kanban cards (status + elapsed
  time in that status, via a shared `ClockTick` service — one `setInterval`
  for the whole app, not one per card) and a `.stats-strip` on the pane
  detail view (revision, last-poll relative time, subscription health).
- Fix mobile UX: filter-bar chips get `min-height: 40px` and wider padding
  under 600px (closing a touch-target gap the later mobile e2e lane had
  flagged); add a `LayoutService` (`railOpen` signal) plus a header
  hamburger, visible under 900px, that opens the nav rail as a slide-in
  drawer with a backdrop.

## Capabilities

### New Capabilities
- `ux-theme-and-polish`: theme switching, a persisted settings screen, card
  and pane-detail stats badges, and a mobile hamburger/drawer nav — all
  client-side (Angular SPA) presentation state layered on top of the
  existing tier-1/2/3 wire contract with no bridge or schema changes.

### Modified Capabilities
(none — this is purely additive client presentation, no tier-1/2/3
requirement changes)

## Impact

- Affected code: `apps/web/src/app/state/theme.service.ts`,
  `apps/web/src/app/state/settings.service.ts`,
  `apps/web/src/app/state/layout.service.ts`, `apps/web/src/app/settings/**`,
  `apps/web/src/app/board/card.*`, `apps/web/src/app/pane-detail/pane-detail.*`,
  `apps/web/src/app/app.*`.
- Affected systems: none outside the web SPA — no bridge, schema, or wire
  contract changes.
- Tests: 91 karma unit tests (74 baseline + 17 new) and 30 Playwright e2e
  (23 baseline + 7 new for theme toggle, settings sections, mobile
  hamburger + chip touch-target).
