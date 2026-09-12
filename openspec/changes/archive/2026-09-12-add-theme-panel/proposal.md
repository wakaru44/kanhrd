## Why

kanhrd has two theme surfaces and one control.

- The **board** (the whole SPA chrome) is washi or sumi. `ThemeService`
  owns it; the header's `.theme-toggle` flips it in one click.
- The **terminal** palette is a separate, seven-valued choice
  (`auto`, `washi`, `sumi`, and four pinned palettes). `TerminalThemeService`
  owns it, and it is reachable **only** from `/settings`.

So the surface a user changes most often has a one-click control in the
header, and the surface beside it — the one that fills the pane-detail
route edge to edge — is two navigations away. There is also no place in
the app where the two are visible together, which is exactly where the
`auto` option's meaning ("follows the board") is legible.

Operator request, 2026-09-11: the header button opens a panel carrying
both, one row each.

## What Changes

### The header button opens a panel

`.theme-toggle` stops toggling and starts opening. It is a popover
trigger: `aria-haspopup="dialog"`, `aria-expanded`, `aria-controls`, and
a panel with an accessible name. Not a tooltip — it opens on click, is
keyboard-operable, and dismisses on Escape (`docs/UX-GUIDELINES.md`
forbids hover-only affordances).

```text
header:  [☀]  [⚙]
          │
  ┌───────┴──────────────────────┐
  │ board     [ washi ][ sumi ]  │
  │ terminal  [ auto         ▾ ] │
  └──────────────────────────────┘
```

The two palettes keep the names the product already gives them —
**washi** and **sumi** (`docs/BRAND.md` § Palette, and the shipped
`help.shortcuts.toggleTheme` copy "switch between washi and sumi").

### `prefix + t` is untouched

The keyboard fast path stays a direct toggle of the board theme. A
keyboard shortcut that opened a panel the user then had to navigate
would be slower than the thing it replaced, and `prefix + t` is the
binding the help overlay already documents as a switch, not a menu.

### Settings keeps both controls — and they cannot drift

`/settings` stays the complete inventory: the appearance section keeps a
board-theme control and the terminal section keeps its palette control.
The panel is the quick path, not a replacement.

Keeping two copies is only safe if there is one implementation, so each
control is extracted into a shared component and **both surfaces render
the same component**:

- `shared/theme-choice` — the washi/sumi choice, a radio group.
- `shared/terminal-theme-choice` — the palette choice, a `<select>` over
  `TERMINAL_THEME_OPTIONS`.

Each owns its own label wiring (`aria-labelledby` / `for`), so the
accessible name is built once rather than twice. The host surface passes
the label text, because the row is called `theme` in Settings' appearance
section and `board` in the panel, where it sits opposite `terminal`.

The board-theme control changes shape as a consequence: Settings' single
`switch to sumi` button becomes the same two-option radio group the panel
shows. One control, one selected state, visible in both places — a
toggle button and a radio group could not have been the same component.
`nav.toWashi` / `nav.toSumi` retire with it.

### Escape joins the existing ladder

Panel state lives on `LayoutService.themePanelOpen`, beside `railOpen`
and `plusMenuOpen`, so `KeyboardService.closeTopOverlay` closes it in
precedence order and `App.chromeOpen` lets an unmodified Escape through
while it is open. No new global binding: the terminal keeps its keys.

### Deliberately not in the panel

- **Density**, **terminal text size**, and everything else in Settings'
  appearance section. The panel answers "what does this look like", not
  "configure appearance"; a second inventory is the drift this change is
  trying to prevent.
- **A per-pane terminal palette.** There is one palette for every
  terminal (`settings.terminalNote`), and a panel row must not imply
  otherwise.
- **Any new icon.** The icon set is pinned at twenty
  (`shared/icons.ts`); the panel uses `LucideSun` and `LucideMoon`,
  already in it.

## Impact

- **Affected specs:**
  - `ux-theme-and-polish` — MODIFIED "Theme persists across sessions and
    follows OS preference by default" (the toggle's home moves); ADDED
    the panel requirement and the shared-control requirement.
  - `l-ux2-empty-state-nav-feedback-density-terminal-themes` — MODIFIED
    "Every terminal shares one selectable color theme" (selection gains
    a second surface).
- **Affected code:**
  - `apps/web/src/app/shared/theme-choice.{ts,html,scss}` (new)
  - `apps/web/src/app/shared/terminal-theme-choice.{ts,html,scss}` (new)
  - `apps/web/src/app/shared/theme-panel.{ts,html,scss}` (new)
  - `apps/web/src/app/shared/theme-panel.spec.ts` (new)
  - `apps/web/src/app/app.{ts,html}`
  - `apps/web/src/app/settings/settings.{ts,html,scss}`
  - `apps/web/src/app/state/layout.service.ts`
  - `apps/web/src/app/state/keyboard.service.ts`
  - `apps/web/src/app/shared/copy.ts`
  - specs: `app.spec.ts`, `settings.spec.ts`, `copy.spec.ts`,
    `style-lint.spec.ts`, `keyboard.service.spec.ts`
  - `apps/web/e2e/theme.spec.ts` (the header click is now two steps)
- **No change to:** `packages/schema/**`, `apps/bridge/**`, any wire
  method, any capability flag, any storage key. `kanhrd.theme` and
  `kanhrd.terminal-theme` keep their names and values, so an existing
  browser carries its preferences across unchanged.
- **Risk:** low and client-local. The one behaviour genuinely removed is
  one-click light/dark from the header; `prefix + t` and the panel both
  cover it.
