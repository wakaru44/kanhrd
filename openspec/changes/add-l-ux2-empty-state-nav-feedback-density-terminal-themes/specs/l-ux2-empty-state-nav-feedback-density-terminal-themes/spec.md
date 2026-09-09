## Purpose

Client-side presentation polish layered on top of `tier-1-kanban`,
`tier-2-terminal`, `tier-3-lifecycle`, and `ux-theme-and-polish`: board
onboarding, URL-scoped navigation, an in-app feedback layer, terminal
loading affordance, denser virtualized columns with a dormant drag
scaffold, and selectable per-terminal color themes. No bridge or wire
contract changes.

## ADDED Requirements

### Requirement: Board shows actionable guidance instead of a bare empty message
The SPA SHALL show an empty-state view with a sample configuration snippet
and a start command when zero hosts are configured, or when every
configured host has been disconnected for more than 5 seconds. The SPA
SHALL NOT show the empty state during the first few seconds after load
while hosts are still completing their initial connection handshake.

#### Scenario: All hosts briefly disconnected during cold load
- **WHEN** the SPA loads and every host reports `connected: false` for under 5 seconds while the bridge completes its handshake
- **THEN** the empty state does not appear

#### Scenario: Hosts genuinely unreachable
- **WHEN** every configured host has reported `connected: false` continuously for more than 5 seconds
- **THEN** the empty state appears with setup guidance

### Requirement: Nav rail scope is URL-addressable
The SPA SHALL expose `/workspace/:workspaceId` and
`/workspace/:workspaceId/tab/:tabId` routes, and the nav rail SHALL render
a persistent pill reflecting the current scope with an action to clear it
back to the unscoped board.

#### Scenario: Navigating to a scoped URL sets the pill
- **WHEN** a user opens `/workspace/:workspaceId/tab/:tabId` directly
- **THEN** the rail shows a scope pill naming that workspace and tab, and the board filters to it

#### Scenario: Clearing scope returns to the unscoped board
- **WHEN** a user clicks the scope pill's clear action
- **THEN** the SPA navigates back to `/` and the board shows all panes

### Requirement: In-app feedback layer surfaces errors and connection state
The SPA SHALL provide a toast queue supporting auto-dismissing and
persistent notifications, rendered as a stacked top-right list, and SHALL
allow dismissing the most recent toast via `Escape`.

#### Scenario: Connection-lost toast persists until reconnect
- **WHEN** a host's WebSocket connection drops
- **THEN** a persistent toast appears and remains until the connection is explicitly dismissed or the toast is dismissed by id on reconnect

#### Scenario: Escape dismisses the newest toast
- **WHEN** one or more toasts are visible and the user presses `Escape` with no other modal open
- **THEN** the most recently shown toast is dismissed

### Requirement: Terminal pane shows a loading state before first content
The pane detail view SHALL show a loading indicator from the moment a
`pane.read` request is sent until either content arrives or the request
fails, instead of leaving the terminal viewport blank.

#### Scenario: Opening a pane shows loading until content lands
- **WHEN** a user opens a pane detail view
- **THEN** a loading overlay is shown until the first `pane.read` response resolves or fails

### Requirement: Board columns stay cheap to render at scale via virtual scroll
Board columns SHALL virtualize their pane list so that rendering cost does
not scale linearly with the number of panes in a column once it exceeds
roughly 20 items.

#### Scenario: Column with many panes only renders visible rows
- **WHEN** a column contains more panes than fit in the viewport
- **THEN** only the visible (plus a small buffer of) card rows are present in the DOM at once

### Requirement: Drag-and-drop scaffold is present but inert
Columns and cards SHALL declare `cdkDropList`/`cdkDrag` directives with
drag and drop explicitly disabled, so that enabling drag-to-move later
does not require re-plumbing the CDK wiring.

#### Scenario: Dragging a card currently does nothing
- **WHEN** a user attempts to drag a card
- **THEN** the card does not move and no reorder or column-move event is emitted

### Requirement: Every terminal shares one selectable color theme
All xterm.js terminal instances in the app SHALL render with the same
color palette, selectable from `auto` (follows the SPA's light/dark theme)
or one of six built-in named palettes, persisted across sessions.

#### Scenario: Auto theme follows the SPA theme toggle
- **WHEN** the terminal theme is set to `auto` and the user toggles the SPA between dark and light
- **THEN** every open terminal's palette updates to match

#### Scenario: Pinned palette ignores the SPA theme
- **WHEN** the terminal theme is set to a specific palette (e.g. `catppuccin-mocha`)
- **THEN** terminals keep that palette regardless of the SPA's light/dark toggle, and the choice survives a reload
