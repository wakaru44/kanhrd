## 1. Theme

- [x] 1.1 `ThemeService`: signal-based theme state, persisted to `localStorage['kanhrd.theme']`, falling back to `prefers-color-scheme` — `apps/web/src/app/state/theme.service.ts`, `theme.service.spec.ts`
- [x] 1.2 Refactor `styles.scss` into `[data-theme=dark|light]` custom-property blocks
- [x] 1.3 Header sun/moon toggle wired to `ThemeService` — `apps/web/src/app/app.html`, `app.ts`
- [x] 1.4 xterm.js retheme effect swaps the light/dark xterm theme live on the open terminal — `apps/web/src/app/pane-detail/pane-detail.ts`

## 2. Settings

- [x] 2.1 `SettingsService` persisting to `localStorage['kanhrd.settings']`, driving `--density-scale` — `apps/web/src/app/state/settings.service.ts`
- [x] 2.2 `/settings` route and screen with Appearance, Runtime, Servers, and Data sections — `apps/web/src/app/settings/settings.html`, `settings.ts`, `apps/web/src/app/app.routes.ts`
- [x] 2.3 Data section clear-localStorage action gated behind `ConfirmModal` — `apps/web/src/app/settings/settings.ts`

## 3. Stats badges

- [x] 3.1 Shared `ClockTick` service (one `setInterval` for the whole app) driving elapsed-in-status display
- [x] 3.2 `.stats-badge` on kanban cards (status + elapsed time) — `apps/web/src/app/board/card.html`, `card.ts`, `card.spec.ts`
- [x] 3.3 `.stats-strip` on pane detail (revision, last-poll relative time, subscription health) — `apps/web/src/app/pane-detail/pane-detail.html`, `pane-detail.ts`

## 4. Mobile UX

- [x] 4.1 Filter-bar chip touch targets: `min-height: 40px` + wider padding under 600px — `apps/web/src/app/board/filter-bar.scss`
- [x] 4.2 `LayoutService` (`railOpen` signal) + header hamburger visible under 900px opening the nav rail as a slide-in drawer with backdrop — `apps/web/src/app/state/layout.service.ts`, `apps/web/src/app/app.html`/`app.scss`

## 5. Tests

- [x] 5.1 Karma unit coverage for Theme, Settings, and card stats badge (17 new tests on top of the 74 baseline) — `theme.service.spec.ts`, `settings.spec.ts`, `card.spec.ts`
- [x] 5.2 Playwright e2e coverage for theme toggle, settings sections, mobile hamburger, and chip touch-target as a hard assertion — `apps/web/e2e/theme.spec.ts`, `apps/web/e2e/settings.spec.ts`, `apps/web/e2e/mobile.spec.ts`

## 6. Validator

- [x] 6.1 `openspec validate add-l-ux-theme-and-polish --strict` passes with zero errors
