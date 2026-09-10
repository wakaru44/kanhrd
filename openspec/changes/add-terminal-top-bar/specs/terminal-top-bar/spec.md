## Purpose

The pane-detail route's header is the operator's whole sense of place
while a terminal is open: which pen, which field, which lane, which card
— and which other cards sit beside this one. This capability makes that
header a herdr-like session bar: it adds a field / lane breadcrumb and a
switcher over the sibling cards in the same lane, reachable by mouse,
touch and keyboard, without taking the terminal's keys away.

## Vocabulary

UI copy says **pen / field / lane / card**; wire, API, schema and code
say `host` / `workspace` / `tab` / `pane`. A **sibling card** is a pane
on the same pen with the same `tab.id` as the pane in the route,
including the pane in the route itself. The **top bar** is the pane
detail view's single header element; the **switcher** is the sibling
strip inside it.

## ADDED Requirements

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

- **WHEN** the switcher appears (a second card joins the lane) and the
  header therefore becomes taller
- **THEN** the terminal refits to the reduced container height and its
  prompt remains visible and reachable

### Requirement: The top bar shows the card's pen, field and lane

The top bar SHALL show the card's field name and lane name, rendered as
`field / lane` in `--ink-mute`, derived from the projected pane's
`workspace.name` and `tab.name`.

The pen SHALL continue to be carried by the existing hanko seal already
in the header; the breadcrumb SHALL NOT repeat the pen name.

Both names SHALL come from the pane already in `PanesStore`. No wire
method, schema field, capability flag or herdr call SHALL be added to
obtain them.

A name that is longer than its slot SHALL truncate with an ellipsis, and
truncating a name SHALL NOT truncate the card title.

Below `--breakpoint-mobile` the breadcrumb SHALL show the lane name
alone, so the title keeps its row.

#### Scenario: Breadcrumb on the detail route

- **WHEN** the operator opens a card whose pane reports
  `workspace.name = "api"` and `tab.name = "build"`
- **THEN** the top bar shows `api / build` and the pen seal shows the
  pen name

#### Scenario: No new wire traffic for the breadcrumb

- **WHEN** pane detail renders its breadcrumb
- **THEN** no request beyond the existing `pane.read` /
  `pane.subscribe_output` pair is sent to the bridge

#### Scenario: At 390px

- **WHEN** the detail route renders at a 390px-wide viewport
- **THEN** the breadcrumb shows the lane name only, the title is not
  truncated by the breadcrumb, and the page does not scroll horizontally

### Requirement: The top bar offers a switcher over the sibling cards in this lane

When the pane in the route has at least one sibling card, the top bar
SHALL render a switcher listing every card in that lane, the current one
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

When the lane holds exactly one card the switcher SHALL NOT be rendered
at all: no empty strip, no disabled control, no placeholder.

Entries that do not fit SHALL scroll horizontally **inside the
switcher's own container**; the page itself SHALL NOT scroll
horizontally at any width.

The switcher SHALL NOT fetch pane output, subscribe to any pane, or
issue any request. It renders from the store only.

Below `--breakpoint-mobile` the switcher SHALL NOT be rendered and
nothing in the view SHALL hint at it, per `docs/UX-GUIDELINES.md`
§ Mobile → Pane detail ("no pane switcher. Do not build one and do not
hint at one"). Lifting that restriction requires that document to be
amended first.

#### Scenario: Two cards share a lane

- **WHEN** the operator opens a card whose lane holds two panes, at a
  viewport ≥ 900px
- **THEN** the top bar shows a switcher with two entries, the current
  card's entry marked current and reporting `aria-current="page"`

#### Scenario: Switching to a sibling

- **WHEN** the operator activates a sibling entry
- **THEN** the route becomes that sibling's `/pane/:host/:id`, the
  terminal loads that pane, and the switcher now marks that entry as
  current

#### Scenario: A lane of one

- **WHEN** the operator opens a card that is the only pane in its lane
- **THEN** no switcher is rendered

#### Scenario: A sibling closes

- **WHEN** a sibling pane is closed on the pen and its `pane.closed`
  event reaches the store
- **THEN** its entry leaves the switcher, and if the lane is left with
  one card the switcher stops rendering

#### Scenario: A sibling on a disconnected pen

- **WHEN** the pen goes out of sight while pane detail is open
- **THEN** the already-listed siblings remain listed and the view shows
  its existing unavailable state — the switcher does not blank

#### Scenario: Sibling order

- **WHEN** the switcher renders siblings that were all present at the
  last `pane.list`
- **THEN** they appear in the order the store holds them, which is
  herdr's own layout order for that lane, and a card created afterwards
  appears at the end

#### Scenario: At 390px

- **WHEN** the detail route renders at a 390px-wide viewport for a lane
  with several cards
- **THEN** no switcher is rendered, and
  `document.documentElement.scrollWidth` does not exceed `clientWidth`

### Requirement: The switcher is reachable and operable by keyboard without taking the terminal's keys

The switcher SHALL be focusable by two bindings, both listed in the
keyboard help overlay:

- the prefix chord **`prefix + o`**, which applies when the terminal does
  not have focus; and
- the direct chord **`Ctrl+Alt+O`**, which applies whether or not the
  terminal has focus, and is the only key this capability takes away from
  the pane.

`Ctrl+Alt+O` SHALL be the single exception this capability adds to
`keyboard-shortcuts`' input-suppression rule. If the effective prefix is
itself `Ctrl+Alt+O`, the prefix SHALL win and the direct chord SHALL NOT
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

Neither binding SHALL fire when no switcher is rendered.

Focus SHALL be visible on every entry; `:focus-visible` SHALL NOT be
suppressed.

#### Scenario: Reaching the switcher from a live terminal

- **WHEN** the terminal has focus and the operator presses `Ctrl+Alt+O`
  in a lane with more than one card
- **THEN** focus moves to the switcher's current entry and the keystroke
  is not sent to the pane

#### Scenario: Reaching the switcher without the terminal focused

- **WHEN** the terminal does not have focus and the operator presses the
  prefix followed by `o`
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

- **WHEN** the effective prefix resolves to `Ctrl+Alt+O` (by user
  override or by a herdr-mirrored `[keys].prefix`)
- **THEN** pressing `Ctrl+Alt+O` arms the prefix chord and does not focus
  the switcher

#### Scenario: Nothing to switch to

- **WHEN** the pane is the only card in its lane and the operator presses
  `Ctrl+Alt+O`
- **THEN** nothing is focused, no error is shown, and the keystroke is
  passed to the terminal unchanged

### Requirement: Every string and every value on the bar is a token or approved copy

Every visible string added by this capability SHALL come from
`shared/copy.ts`, or — until `docs/BRAND.md`'s approved-copy table gains
the corresponding rows — from a typed component-local copy constant
carrying a comment naming the keys it is destined for, following the
precedent of `CARD_COPY` in `board/card.ts`. No string literal SHALL
appear in a template.

The switcher SHALL expose an accessible name for the strip and an
accessible name per entry that carries both the card name and its status,
so that status is never conveyed by the dot's colour alone.

Every colour, spacing, radius, font-size, weight and motion value SHALL
be a token from `docs/DESIGN-SYSTEM.md`. No raw hex, `px` or `rem` SHALL
appear in the new styles, so `tools/lint-scss-tokens.sh` stays clean.

No icon outside the pinned lucide set in `docs/DESIGN-SYSTEM.md` SHALL be
introduced. The breadcrumb separator SHALL be the same textual `/` the
board card's path already uses.

#### Scenario: Token lint

- **WHEN** `bash tools/lint-scss-tokens.sh` runs over the new styles
- **THEN** it reports no raw hex, `px` or `rem` value

#### Scenario: Status is not colour alone

- **WHEN** a screen reader reads a switcher entry
- **THEN** the entry's accessible name includes both the card's name and
  its status word
