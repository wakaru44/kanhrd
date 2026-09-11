# Tasks — add-theme-panel

## 1. Copy

- [ ] 1.1 Add a `theme` group to `shared/copy.ts`: the panel's accessible
      name and trigger label, the two row labels (`board`, `terminal`),
      and the two palette names (`washi`, `sumi`).
- [ ] 1.2 Remove `nav.toWashi` / `nav.toSumi` — the toggle they labelled
      no longer exists on either surface — and drop them from
      `copy.spec.ts`'s shared-label assertions.
- [ ] 1.3 Keep every new string lowercase, exclamation-free, and in
      herdr's vocabulary (`copy.spec.ts` enforces all three).

## 2. Shared controls

- [ ] 2.1 `shared/theme-choice.{ts,html,scss}` — `app-theme-choice`, a
      `role="radiogroup"` over washi/sumi bound to `ThemeService`, with a
      `label` input it renders and wires with `aria-labelledby`.
- [ ] 2.2 Roving tabindex: the checked option is the group's single tab
      stop; arrow keys (both axes) plus Home/End move and select.
- [ ] 2.3 Selection is `--fw-semi` plus an `--ochre-line` underline (the
      `.segment.active` treatment Settings already uses) and
      `aria-checked` — never colour alone. Icons are `LucideSun` /
      `LucideMoon` from `shared/icons.ts`.
- [ ] 2.4 `shared/terminal-theme-choice.{ts,html,scss}` —
      `app-terminal-theme-choice`, a `<select>` over
      `TERMINAL_THEME_OPTIONS` bound to `TerminalThemeService`, with a
      `label` input rendered as a real `<label for>`.
- [ ] 2.5 Both controls meet `--touch-target-min` and carry no raw hex,
      px or rem.

## 3. The panel

- [ ] 3.1 `LayoutService`: add `themePanelOpen` with
      `toggleThemePanel()` / `closeThemePanel()`, beside `plusMenuOpen`.
- [ ] 3.2 `shared/theme-panel.{ts,html,scss}` — the trigger plus a CDK
      connected overlay, following `board/card.ts`'s portal pattern:
      `cdkOverlayOrigin`, `aria-haspopup`, `aria-expanded`,
      `aria-controls`, `cdkConnectedOverlayPush` and a flip fallback so
      the panel stays inside a 390px viewport.
- [ ] 3.3 The panel is `role="dialog"` with an accessible name: it holds
      a radio group and a select, not menu items.
- [ ] 3.4 Opening moves focus into the panel; closing by Escape or by
      re-activating the trigger returns focus to the trigger; an outside
      click or a scroll closes it without stealing focus.
- [ ] 3.5 `app.html` renders `<app-theme-panel>` where `.theme-toggle`
      was; `app.ts` drops `toggleTheme()` / `themeLabel()` and adds
      `layout.themePanelOpen()` to `chromeOpen`.
- [ ] 3.6 `KeyboardService.closeTopOverlay` closes the panel, inserted
      beside `plusMenuOpen` so the existing precedence is unchanged.
      `toggle-theme` is left exactly as it is.

## 4. Settings

- [ ] 4.1 Replace the appearance section's theme button with
      `<app-theme-choice>`; replace the terminal section's `<select>`
      with `<app-terminal-theme-choice>`, keeping the `terminal-theme`
      id the existing spec and e2e address it by.
- [ ] 4.2 Delete the now-unused `themeLabel()` / `toggleTheme()` /
      `onTerminalThemeChange()` from `settings.ts` and the `.segment`
      rules that only the theme row used.

## 5. Tests

- [ ] 5.1 `shared/theme-panel.spec.ts` — opens and closes,
      `aria-expanded` tracks state, Escape closes and restores focus,
      each control writes its own service, arrow keys move the board
      selection, and the panel box sits inside a narrow viewport.
- [ ] 5.2 An anti-drift spec: a change made through the panel is
      reflected in a freshly rendered `Settings`, and the reverse.
- [ ] 5.3 `keyboard.service.spec.ts` keeps proving `prefix + t` toggles
      the theme directly, and gains a case for the panel joining the
      Escape ladder.
- [ ] 5.4 Update `settings.spec.ts`, `app.spec.ts`, `copy.spec.ts` and
      `style-lint.spec.ts` (three new components join the gate's list).
- [ ] 5.5 Update `e2e/theme.spec.ts` for the two-step header path. No new
      e2e file — the suites here are herdr-gated.

## 6. Verify

- [ ] 6.1 `pnpm --filter @kanhrd/web test`
- [ ] 6.2 `pnpm --filter @kanhrd/web typecheck`
- [ ] 6.3 `pnpm --filter @kanhrd/web build`
- [ ] 6.4 `pre-commit run --files <touched>`
- [ ] 6.5 `openspec validate add-theme-panel --strict`
