## ADDED Requirements

### Requirement: The bar carries herdr's tab level above its pane level

The pane detail bar SHALL render the tabs of the route pane's workspace,
above the card switcher, so that the two levels the operator sees are the
two levels herdr has: tabs, then the panes of the selected tab.

The tabs SHALL be derived client-side from `PanesStore.tabsSignal` as the
tabs whose `host` equals the route's host and whose `workspace.id` equals
the route pane's workspace id. No wire method, schema change, capability
flag or request SHALL be introduced for this derivation.

Each entry SHALL be a link to a pane detail route (`/pane/:host/:id`) of
that tab, so the URL remains the state and a shared link reproduces the
view. An entry SHALL NOT swap the terminal's contents without changing
the URL, and selecting the current tab SHALL be a no-op rather than a
reload.

The current tab SHALL be marked by text weight plus an `--ochre-line`
underline and by `aria-current="page"`, never by a colour fill alone.

When the workspace holds exactly one tab the strip SHALL NOT be rendered:
no empty strip, no disabled control, no placeholder.

The strip SHALL be operable by keyboard on its own — a roving tabindex,
arrow keys and Home/End — and SHALL NOT take a key the terminal needs.
Entries that do not fit SHALL scroll inside the strip's own container;
the page SHALL NOT scroll horizontally at any width.

The pane level SHALL read as subordinate to the tab level through type
scale and indentation rather than through a second kind of chrome.

#### Scenario: Both levels are visible from a terminal

- **WHEN** the operator opens a pane in a workspace with four tabs, in a tab holding two panes
- **THEN** the bar shows the four tabs with the current one marked, and beneath them the two panes with the current one marked

#### Scenario: A tab entry navigates by URL

- **WHEN** the operator selects another tab in the strip
- **THEN** the route becomes that tab's pane detail URL, and no pane content is swapped without the URL changing

#### Scenario: One tab, no strip

- **WHEN** the route pane's workspace holds exactly one tab
- **THEN** no tab strip is rendered, and the card switcher below is unaffected

#### Scenario: The strip asks the bridge for nothing

- **WHEN** the tab strip renders with any number of tabs
- **THEN** it issues no request, subscribes to no pane, and reads only from the store
