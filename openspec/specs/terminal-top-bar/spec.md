# terminal-top-bar Specification

## Purpose
The pane-detail route's header is the operator's whole sense of place
while a terminal is open: which host, which workspace, which tab, which card
— and which other cards sit beside this one. This capability makes that
header a herdr-like session bar: it adds a workspace / tab breadcrumb and a
switcher over the sibling cards in the same tab, reachable by mouse,
touch and keyboard, without taking the terminal's keys away.
## Requirements
### Requirement: The top bar is the pane detail header, not a second bar

Pane detail SHALL render exactly one header element. The breadcrumb and
the switcher SHALL be added to the existing header rather than to an
additional bar stacked above or below it.

The header SHALL keep the back control (`LucideArrowLeft` +
`copy.nav.backToBoard`) as its **first focusable element**, and that
control SHALL remain visible without scrolling at every supported
viewport width, per `docs/UX-GUIDELINES.md` § Mobile → Pane detail.

The existing metadata strip (status, pane id, revision, last-poll
elapsed) SHALL keep its own row beneath the title and SHALL NOT be moved
into the switcher or the breadcrumb.

The terminal SHALL keep the remaining height of the view. Adding the
breadcrumb and the switcher SHALL NOT cause the terminal container to
reach a zero height, and the terminal SHALL be refitted when the header's
height changes — the existing `ResizeObserver` on the terminal container
already observes that change and SHALL be relied on rather than
duplicated.

#### Scenario: One header

- **WHEN** pane detail renders for any pane
- **THEN** the view contains exactly one header element, whose first
  focusable child is the back control

#### Scenario: The terminal is refitted when the header grows

- **WHEN** the switcher appears (a second card joins the tab) and the
  header therefore becomes taller
- **THEN** the terminal refits to the reduced container height and its
  prompt remains visible and reachable

### Requirement: The top bar shows the card's host, workspace and tab

The top bar SHALL show the card's workspace name and tab name, rendered as
`workspace / tab` in `--ink-mute`, derived from the projected pane's
`workspace.name` and `tab.name`.

The host SHALL continue to be carried by the existing hanko seal already
in the header; the breadcrumb SHALL NOT repeat the host name.

Both names SHALL come from the pane already in `PanesStore`. No wire
method, schema field, capability flag or herdr call SHALL be added to
obtain them.

A name that is longer than its slot SHALL truncate with an ellipsis, and
truncating a name SHALL NOT truncate the card title.

Below `--breakpoint-mobile` the breadcrumb SHALL show the tab name
alone, so the title keeps its row.

#### Scenario: Breadcrumb on the detail route

- **WHEN** the operator opens a card whose pane reports
  `workspace.name = "api"` and `tab.name = "build"`
- **THEN** the top bar shows `api / build` and the host seal shows the
  host name

#### Scenario: No new wire traffic for the breadcrumb

- **WHEN** pane detail renders its breadcrumb
- **THEN** no request beyond the existing `pane.read` /
  `pane.subscribe_output` pair is sent to the bridge

#### Scenario: At 390px

- **WHEN** the detail route renders at a 390px-wide viewport
- **THEN** the breadcrumb shows the tab name only, the title is not
  truncated by the breadcrumb, and the page does not scroll horizontally

### Requirement: The top bar offers a switcher over the sibling cards in this tab

When the pane in the route has at least one sibling card, the top bar
SHALL render a switcher listing every card in that tab, the current one
included.

Siblings SHALL be derived client-side as the panes in
`PanesStore.panesSignal` whose `host` equals the route's host and whose
`tab.id` equals the route pane's `tab.id`. No wire, schema or bridge
change SHALL be introduced for this derivation.

Each entry SHALL be a link to that card's detail route
(`/pane/:host/:id`), so that the URL remains the state
(`docs/UX-GUIDELINES.md` § URL is state) and a shared link reproduces the
view. An entry SHALL NOT be a control that swaps the terminal's contents
without changing the URL.

Each entry SHALL render the card's status dot and the card's display
name, using the same display-name precedence as the header title so that
a card is called the same thing in both places.

The current card's entry SHALL be marked as current by text weight
(`--fw-semi`) plus a 2px `--ochre-line` underline and by
`aria-current="page"` — never by a colour fill alone, per
`docs/DESIGN-SYSTEM.md`.

When the tab holds exactly one card the switcher SHALL NOT be rendered
at all: no empty strip, no disabled control, no placeholder.

Entries that do not fit SHALL scroll horizontally **inside the
switcher's own container**; the page itself SHALL NOT scroll
horizontally at any width.

The switcher SHALL NOT fetch pane output, subscribe to any pane, or
issue any request. It renders from the store only.

The switcher SHALL render at every width, phone width included
(maintainer decision D1, 2026-09-10). Below `--breakpoint-mobile` it
SHALL remain the same horizontally scrolling strip: the back control
SHALL stay first and visible without scrolling, every entry SHALL meet
`--touch-target-min` with `--sp-2` separation, and the strip itself —
not the page — SHALL be the element that scrolls, so
`document.documentElement.scrollWidth` does not exceed `clientWidth`.

`docs/UX-GUIDELINES.md` § Mobile → Pane detail ("no pane switcher. Do
not build one and do not hint at one") SHALL be amended to permit a
route-navigator strip: the sentence rules out a multi-pane or split
view, and each switcher entry is a `routerLink` to `/pane/:host/:id`
showing one terminal at a time.

#### Scenario: Two cards share a tab

- **WHEN** the operator opens a card whose tab holds two panes
- **THEN** the top bar shows a switcher with two entries, the current
  card's entry marked current and reporting `aria-current="page"`

#### Scenario: Switching to a sibling

- **WHEN** the operator activates a sibling entry
- **THEN** the route becomes that sibling's `/pane/:host/:id`, the
  terminal loads that pane, and the switcher now marks that entry as
  current

#### Scenario: A tab of one

- **WHEN** the operator opens a card that is the only pane in its tab
- **THEN** no switcher is rendered

#### Scenario: A sibling closes

- **WHEN** a sibling pane is closed on the host and its `pane.closed`
  event reaches the store
- **THEN** its entry leaves the switcher, and if the tab is left with
  one card the switcher stops rendering

#### Scenario: A sibling on a disconnected host

- **WHEN** the host goes out of sight while pane detail is open
- **THEN** the already-listed siblings remain listed and the view shows
  its existing unavailable state — the switcher does not blank

#### Scenario: Sibling order

- **WHEN** the switcher renders siblings that were all present at the
  last `pane.list`
- **THEN** they appear in the order the store holds them, which is
  herdr's own layout order for that tab, and a card created afterwards
  appears at the end

#### Scenario: At 390px

- **WHEN** the detail route renders at a 390px-wide viewport for a tab
  with several cards
- **THEN** the switcher renders as a horizontally scrolling strip, the
  back control is visible without scrolling, every entry meets
  `--touch-target-min`, and `document.documentElement.scrollWidth` does
  not exceed `clientWidth`

### Requirement: The switcher is reachable and operable by keyboard without taking the terminal's keys

This capability adds two actions (maintainer decision D3 follow-up,
2026-09-10), both listed in the keyboard help overlay under `Navigation`.

**`next-sibling-card`** SHALL be bound to the prefix chord
**`prefix + o`**. It SHALL navigate directly to the next sibling card in
the tab, wrapping from the last to the first, without opening the
switcher. This mirrors tmux and herdr, where `prefix + o` goes to the
next pane; kanhrd already mirrors their tab movement in
`keyboard.service.ts` (`prefix + n` / `prefix + p` / `prefix + l` /
`prefix + 0-9`), and pane movement SHALL be consistent with it. Like
those bindings it is prefix-only and takes no key from the pane.

**`focus-card-switcher`** SHALL be focusable by two bindings:

- the prefix chord **`prefix + i`**, which applies when the terminal does
  not have focus; and
- the direct chord **`Ctrl+Alt+I`**, which applies whether or not the
  terminal has focus, and is the only key this capability takes away from
  the pane.

`prefix + o` SHALL NOT be reused for the switcher, and `prefix + i` SHALL
NOT navigate; the two verbs stay on separate keys so that the herdr-parity
key keeps herdr's meaning.

`Ctrl+Alt+I` SHALL be the single exception this capability adds to
`keyboard-shortcuts`' input-suppression rule. If the effective prefix is
itself `Ctrl+Alt+I`, the prefix SHALL win and the direct chord SHALL NOT
be recognized.

Once the switcher has focus the terminal does not, so the following SHALL
be ordinary focused-widget behaviour and SHALL NOT be registered as
global bindings: `ArrowLeft` / `ArrowRight` move between entries,
`Home` / `End` move to the first / last entry, `Enter` or `Space`
navigates to the focused entry, and `Escape` returns focus to the
terminal without navigating.

Moving between entries with the arrow keys SHALL move focus only; it
SHALL NOT navigate until the operator activates an entry, so a keyboard
user does not load four panes on the way to the fifth.

No binding in this capability SHALL fire when the pane is the only card
in its tab: `prefix + o` SHALL be a no-op there, and the switcher
bindings SHALL do nothing since no switcher is rendered.

Focus SHALL be visible on every entry; `:focus-visible` SHALL NOT be
suppressed.

#### Scenario: Reaching the switcher from a live terminal

- **WHEN** the terminal has focus and the operator presses `Ctrl+Alt+I`
  in a tab with more than one card
- **THEN** focus moves to the switcher's current entry and the keystroke
  is not sent to the pane

#### Scenario: Reaching the switcher without the terminal focused

- **WHEN** the terminal does not have focus and the operator presses the
  prefix followed by `i`
- **THEN** focus moves to the switcher's current entry

#### Scenario: Arrow keys move focus, not the route

- **WHEN** the switcher has focus and the operator presses
  `ArrowRight` twice
- **THEN** focus is on the entry two positions along, the URL is
  unchanged, and no `pane.read` has been sent for those panes

#### Scenario: Enter navigates

- **WHEN** the switcher has focus on a sibling entry and the operator
  presses `Enter`
- **THEN** the route becomes that sibling's detail route

#### Scenario: Escape returns to the terminal

- **WHEN** the switcher has focus and the operator presses `Escape`
- **THEN** focus returns to the terminal, the route is unchanged, and no
  overlay or drawer elsewhere in the app is closed as a side effect

#### Scenario: The prefix is never shadowed

- **WHEN** the effective prefix resolves to `Ctrl+Alt+I` (by user
  override or by a herdr-mirrored `[keys].prefix`)
- **THEN** pressing `Ctrl+Alt+I` arms the prefix chord and does not focus
  the switcher

#### Scenario: Nothing to switch to

- **WHEN** the pane is the only card in its tab and the operator presses
  `Ctrl+Alt+I`
- **THEN** nothing is focused, no error is shown, and the keystroke is
  passed to the terminal unchanged

#### Scenario: `prefix + o` hops to the next sibling

- **WHEN** the terminal does not have focus, the tab holds three cards,
  and the operator presses the prefix followed by `o`
- **THEN** the route becomes the next sibling's `/pane/:host/:id`
  without the switcher being opened or focused

#### Scenario: `prefix + o` wraps

- **WHEN** the operator is on the last card of the tab and presses the
  prefix followed by `o`
- **THEN** the route becomes the first card of the tab

#### Scenario: `prefix + o` in a tab of one

- **WHEN** the pane is the only card in its tab and the operator presses
  the prefix followed by `o`
- **THEN** the route is unchanged and no request is sent

### Requirement: The bar carries a visible control for hopping to the next card in the tab

`prefix + o` needs a pointer affordance, since
`docs/UX-GUIDELINES.md` requires visible affordances rather than
keyboard-only paths. The bar SHALL therefore carry a **next-card
button** whenever the pane shares its tab with at least one other card
— the same condition under which the switcher renders.

The button SHALL carry `LucideSquareSplitHorizontal`, whose glyph is a
window divided into two panes, and SHALL perform exactly the
`next-sibling-card` action `prefix + o` performs: navigate to the next
sibling in store order, wrapping past the last. It SHALL NOT open,
focus, or scroll the switcher.

The button and the switcher strip are deliberately both present and are
not redundant: the button is a one-press hop, correct in the common
two-card tab; the strip is how the operator picks a *specific* card in
a tab of three or more. In a tab of one, neither renders.

The button SHALL meet `--touch-target-min` at every width and SHALL
carry an accessible name from `copy.ts`; its glyph SHALL NOT be its only
label to assistive technology.

#### Scenario: The button appears only with a sibling

- **WHEN** the operator opens a card whose tab holds exactly one pane
- **THEN** no next-card button is rendered

#### Scenario: The button hops

- **WHEN** the tab holds two cards and the operator activates the
  next-card button
- **THEN** the route becomes the other card's `/pane/:host/:id`, and the
  switcher is neither opened nor focused

#### Scenario: The button and the chord agree

- **WHEN** the tab holds three cards and the operator activates the
  next-card button twice
- **THEN** the route lands on the same card two presses of
  `prefix + o` would have reached

### Requirement: Every string and every value on the bar is a token or approved copy

Every visible string added by this capability SHALL come from
`shared/copy.ts`. No string literal SHALL appear in a template, and no
component-local copy constant SHALL be introduced — commit `f173992`
folded the last five of those back into `copy.ts`, and `copy.ts` is now
the single home for user-facing strings whether or not
`docs/BRAND.md`'s table has caught up.

Per maintainer decision D2 (2026-09-10) the switcher's two strings —
`nav.cardSwitcher` = `cards in this tab` and `nav.cardSwitcherItem` =
`{name} — {status}` — are approved as written and SHALL be added to
`copy.ts` under `nav`, beside `nav.statusSwitcher` and
`nav.statusSwitcherItem` whose shape they mirror. This change SHALL NOT
add rows to `docs/BRAND.md`'s approved-copy table.

The switcher SHALL expose an accessible name for the strip and an
accessible name per entry that carries both the card name and its status,
so that status is never conveyed by the dot's colour alone.

Every colour, spacing, radius, font-size, weight and motion value SHALL
be a token from `docs/DESIGN-SYSTEM.md`. No raw hex, `px` or `rem` SHALL
appear in the new styles, so `tools/lint-scss-tokens.sh` stays clean.

No icon outside the pinned lucide set in `docs/DESIGN-SYSTEM.md` SHALL be
introduced. Per maintainer decision D4 (2026-09-10) that set gains
exactly two glyphs, both re-exported from
`apps/web/src/app/shared/icons.ts`: **`LucideGalleryHorizontal`** as the
leading marker on the switcher strip, and
**`LucideSquareSplitHorizontal`** on the next-card button. Switcher entries SHALL carry no icon — the existing
CSS status dot plus the card name. The breadcrumb separator SHALL be the
same textual `/` the board card's path already uses.

#### Scenario: Token lint

- **WHEN** `bash tools/lint-scss-tokens.sh` runs over the new styles
- **THEN** it reports no raw hex, `px` or `rem` value

#### Scenario: Status is not colour alone

- **WHEN** a screen reader reads a switcher entry
- **THEN** the entry's accessible name includes both the card's name and
  its status word

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

