## MODIFIED Requirements

### Requirement: Every terminal shares one selectable color theme
All xterm.js terminal instances in the app SHALL render with the same
color palette, selectable from `auto` (follows the SPA's board theme) or
one of six built-in named palettes, persisted across sessions to
`localStorage['kanhrd.terminal-theme']`.

The palette SHALL be selectable from **two** surfaces — the `/settings`
terminal section and the header theme panel — and both SHALL render the
same control over the same option list, so that neither can offer a
palette the other does not.

#### Scenario: Auto theme follows the SPA theme toggle
- **WHEN** the terminal theme is set to `auto` and the user changes the SPA between dark and light
- **THEN** every open terminal's palette updates to match

#### Scenario: Pinned palette ignores the SPA theme
- **WHEN** the terminal theme is set to a specific palette (e.g. `catppuccin-mocha`)
- **THEN** terminals keep that palette regardless of the SPA's board theme, and the choice survives a reload

#### Scenario: Both surfaces offer the same palettes
- **WHEN** the terminal palette control is rendered in the header panel and in `/settings`
- **THEN** both list the same options in the same order, and selecting one in either surface is reflected in the other
