# ux-theme-and-polish Specification

## Purpose
Client-side presentation polish on top of the tier-1/2/3 SPA: theming, a
persisted settings screen, at-a-glance status durations, and a usable
mobile nav. No bridge or wire-contract changes.
## Requirements
### Requirement: Theme persists across sessions and follows OS preference by default
The SPA SHALL persist the user's theme choice (`dark`/`light`) to
`localStorage['kanhrd.theme']` and SHALL fall back to the browser's
`prefers-color-scheme` when no explicit choice has been made. Changing the
theme SHALL update every themed surface, including the xterm.js terminal
palette on any open pane-detail view, without a page reload.

The choice SHALL be reachable from three places, all writing the same
stored value: the header theme panel, the `/settings` appearance section,
and the `toggle-theme` keyboard shortcut. The header control SHALL NOT
itself toggle the theme — it opens the panel — while the keyboard
shortcut SHALL remain a direct toggle and SHALL NOT open any surface.

#### Scenario: First visit follows OS dark-mode preference
- **WHEN** a user opens kanhrd for the first time on a browser reporting `prefers-color-scheme: dark` and no `kanhrd.theme` key exists yet
- **THEN** the SPA renders in dark theme

#### Scenario: Explicit choice survives a reload
- **WHEN** a user picks the light theme and reloads the page
- **THEN** the SPA renders in light theme regardless of `prefers-color-scheme`

#### Scenario: The keyboard shortcut still toggles in one press
- **WHEN** a user presses the prefix followed by `t`
- **THEN** the SPA switches between washi and sumi immediately, and no panel, menu or dialog opens

#### Scenario: The header control no longer toggles
- **WHEN** a user activates the header theme control
- **THEN** the theme is unchanged and the theme panel opens

### Requirement: Settings screen persists Appearance and Data preferences locally
The SPA SHALL expose a `/settings` route with Appearance, Runtime, Servers,
and Data sections. Appearance (theme, density) and any other
user-adjustable preference SHALL persist to `localStorage['kanhrd.settings']`
without a server round-trip. The Data section's "clear local data" action
SHALL require confirmation before it removes any `localStorage` state.

#### Scenario: Density change persists and applies immediately
- **WHEN** a user changes the density setting in Appearance
- **THEN** the SPA immediately updates the `--density-scale` custom property and the choice survives a reload

#### Scenario: Clearing local data requires confirmation
- **WHEN** a user clicks "clear local data" in the Data section
- **THEN** the SPA shows a confirmation modal and does not clear anything until the user confirms

### Requirement: Cards and pane detail show discreet status-duration stats
Kanban cards SHALL show the pane's current `agent_status` and how long it
has held that status, using a single shared ticking clock for the whole
board rather than one timer per card. The pane detail view SHALL show its
last output revision, a relative time since the last successful poll, and
whether its output subscription is currently healthy.

#### Scenario: Elapsed time updates without a per-card timer
- **WHEN** the board renders N cards
- **THEN** exactly one shared interval drives every card's elapsed-time display, not N independent intervals

### Requirement: Mobile viewport gets a usable nav and touch targets
Under a 900px viewport width, the SPA SHALL expose a header hamburger that
opens the workspace/tab nav rail as a slide-in drawer with a backdrop.
Under 600px, filter-bar chips SHALL have a minimum touch target of 40px
height with adequate padding.

#### Scenario: Hamburger opens the rail as a drawer on narrow viewports
- **WHEN** the viewport is narrower than 900px and the user taps the header hamburger
- **THEN** the nav rail slides in over the board with a backdrop, and tapping the backdrop closes it

#### Scenario: Filter chips are tappable on a phone-sized viewport
- **WHEN** the viewport is narrower than 600px
- **THEN** every filter-bar chip has a rendered height of at least 40px

### Requirement: The header theme control opens a panel covering both themed surfaces
The SPA SHALL render, in the app header, a control that opens a panel
carrying one row per themed surface: the **board** (the SPA's washi/sumi
theme) and the **terminal** (the shared xterm.js palette). The two rows
SHALL be independently settable, and neither SHALL close the panel.

The trigger SHALL carry `aria-haspopup`, SHALL reflect the panel's state
in `aria-expanded`, and SHALL reference the open panel with
`aria-controls`. The panel SHALL carry an accessible name.

The panel SHALL open on activation, never on hover alone. It SHALL be
dismissible with `Escape` and by a pointer press outside it, and on a
keyboard dismissal focus SHALL return to the trigger. The panel's open
state SHALL take part in the SPA's existing Escape precedence ladder
rather than registering a global `Escape` binding.

At the mobile viewport the panel SHALL render inside the viewport: its
left edge at or after 0 and its right edge at or before the viewport
width.

#### Scenario: The panel opens from the header and announces itself
- **WHEN** a user activates the header theme control
- **THEN** the panel opens, the trigger's `aria-expanded` reads `true`, and the trigger's `aria-controls` names the open panel

#### Scenario: Both surfaces are selectable independently
- **WHEN** a user picks `sumi` for the board and `monokai` for the terminal in one visit to the panel
- **THEN** the SPA renders in sumi, every terminal renders Monokai, and the panel is still open

#### Scenario: Auto still follows the board
- **WHEN** the terminal row is set to `auto` and the user then changes the board row
- **THEN** every open terminal's palette follows the board's new theme

#### Scenario: Escape closes the panel and returns focus
- **WHEN** the panel is open and the user presses `Escape`
- **THEN** the panel closes, `aria-expanded` reads `false`, and focus is on the trigger

#### Scenario: Panel fits the phone viewport
- **WHEN** the panel is opened at a viewport width of 390px
- **THEN** the panel's left edge is at or after 0 and its right edge is at or before the viewport width

### Requirement: The panel and Settings render the same control per surface
Each themed surface SHALL have exactly one control implementation,
rendered by both the header panel and the `/settings` screen. Neither
surface SHALL carry its own copy of the markup, the state binding, or the
accessible-name wiring.

The board-theme control SHALL be a radio-group-shaped control over the
two themes — one option selected at a time — and its selection SHALL be
visible without relying on colour alone. It SHALL be operable with arrow
keys.

#### Scenario: A change in the panel is visible in Settings
- **WHEN** a user sets the board theme to `sumi` in the panel and then opens `/settings`
- **THEN** the appearance section shows `sumi` selected

#### Scenario: A change in Settings is visible in the panel
- **WHEN** a user sets the terminal palette in `/settings` and then opens the panel
- **THEN** the panel's terminal row shows the palette chosen in Settings

#### Scenario: Selection is legible without colour
- **WHEN** the board-theme control renders
- **THEN** the selected option is marked by something other than colour alone, and is exposed to assistive technology as the checked option of its group

