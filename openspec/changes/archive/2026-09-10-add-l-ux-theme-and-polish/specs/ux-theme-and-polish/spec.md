## Purpose

Client-side presentation polish on top of the tier-1/2/3 SPA: theming, a
persisted settings screen, at-a-glance status durations, and a usable
mobile nav. No bridge or wire-contract changes.

## ADDED Requirements

### Requirement: Theme persists across sessions and follows OS preference by default
The SPA SHALL persist the user's theme choice (`dark`/`light`) to
`localStorage['kanhrd.theme']` and SHALL fall back to the browser's
`prefers-color-scheme` when no explicit choice has been made. Toggling the
theme SHALL update every themed surface, including the xterm.js terminal
palette on any open pane-detail view, without a page reload.

#### Scenario: First visit follows OS dark-mode preference
- **WHEN** a user opens kanhrd for the first time on a browser reporting `prefers-color-scheme: dark` and no `kanhrd.theme` key exists yet
- **THEN** the SPA renders in dark theme

#### Scenario: Explicit choice survives a reload
- **WHEN** a user toggles to light theme and reloads the page
- **THEN** the SPA renders in light theme regardless of `prefers-color-scheme`

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
