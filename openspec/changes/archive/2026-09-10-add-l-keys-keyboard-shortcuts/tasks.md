## 1. Service

- [x] 1.1 `KeyboardService`: prefix-chord state machine, default prefix `Ctrl+B`, 2s chord timeout — `apps/web/src/app/state/keyboard.service.ts`
- [x] 1.2 Binding table: `c`/`n`/`p`/`l`/`w`/`&`/`x`/`,`/`0`-`9` chorded, `?`/`Escape` non-chord — `apps/web/src/app/state/keyboard.service.ts`
- [x] 1.3 Suppress handling while a focusable input (including xterm.js's `.xterm-helper-textarea`) has focus
- [x] 1.4 Prefix persisted to `localStorage['kanhrd.keyboard']`

## 2. Help overlay

- [x] 2.1 `app-keyboard-help-overlay` component grouped by Navigation/Lifecycle/View/Help, opened by `?`, closed by `Escape` — `apps/web/src/app/shared/keyboard-help-overlay.ts`/`.html`/`.scss`

## 3. Settings integration

- [x] 3.1 Keyboard section in Settings for rebinding the prefix — `apps/web/src/app/settings/settings.html`, `settings.ts`

## 4. Wiring

- [x] 4.1 `prefix+t` toggles theme via `ThemeService` — `apps/web/src/app/state/keyboard.service.ts`
- [x] 4.2 `prefix+n`/`p`/`l`/`0`-`9` drive tab navigation via `PanesStore.tabFilterSignal` — `apps/web/src/app/state/panes.store.ts`, `board.ts`
- [x] 4.3 `prefix+w` opens/focuses the rail; `Escape` closes the header `+` menu — `apps/web/src/app/rail/rail.ts`, `apps/web/src/app/app.ts`

## 5. Tests

- [x] 5.1 Unit coverage for the chord state machine and bindings — `apps/web/src/app/state/keyboard.service.spec.ts`
- [x] 5.2 Unit coverage for the help overlay — `apps/web/src/app/shared/keyboard-help-overlay.spec.ts`
- [x] 5.3 E2E coverage: help overlay open/close, theme toggle via chord, tab-advance via chord, input-focus suppression verified against a real terminal via the herdr CLI — `apps/web/e2e/keyboard.spec.ts`

## 6. Validator

- [x] 6.1 `openspec validate add-l-keys-keyboard-shortcuts --strict` passes with zero errors
