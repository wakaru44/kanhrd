# kanhrd — UX guidelines

Reads on top of [`BRAND.md`](BRAND.md) and [`DESIGN-SYSTEM.md`](DESIGN-SYSTEM.md).
When those two contradict this file, they win — this file is _how we
use them_, not the source of truth for tokens or voice.

Vocabulary reminder from `BRAND.md`: herdr's objects use herdr's words —
**host**, **workspace**, **tab**. The board's own furniture uses
kanban's — **card**, **status column**, **swimlane** (short form
**lane**). A lane is never a tab.

## The core loop

The user opens kanhrd to **know which agents need attention**. Every
surface is measured against that loop:

1. **Land** — the board loads with a scannable overview. Skeleton
   columns are fine; the header wordmark is never a spinner.
2. **Scan** — status is visible in one saccade per card. No hover
   required, and never colour alone.
3. **Focus** — one click enters the pane. A visible back control returns
   to the board with scope, scroll and focus preserved.
4. **Act** — split / close / rename are one interaction away, visible
   without hover.
5. **Trust** — every failure is reported in the UI, never
   `console.warn`-only, and never with a fact the product cannot honour.

If a feature does not serve one of the five, cut it or hide it behind
Settings.

## Density and cardinality

kanhrd must stay useful at 1 host and at 15 hosts with 40 panes each.
The two density thresholds are **distinct** and are not the same number:

| Threshold                           | Behaviour                                       |
| ----------------------------------- | ----------------------------------------------- |
| user sets density = compact         | compact cards everywhere                        |
| **> 20 cards** in one status column | that column renders compact cards               |
| **> 50 cards** in one status column | that column additionally virtualizes            |
| viewport **< 900px**                | compact cards everywhere, regardless of setting |

Virtualization uses the already-installed `@angular/cdk/scrolling`
`cdk-virtual-scroll-viewport`. Its `itemSize` must equal the compact row
height **plus its gap**, or rows clip.

Rules that hold across both thresholds:

- Counts always represent the complete filtered collection, not the
  rendered window.
- A focused card and an open overflow menu's anchor must not silently
  disappear through recycling. Recycle around them or close the menu
  explicitly.
- Crossing 20 → 21 or 50 → 51 changes rendering, never card identity:
  arrow-key navigation uses stable pane identity, not index.
- No new per-card terminal subscription is introduced for visual polish.
  A card never fetches terminal output for decoration.

Status columns keep a minimum width of `--column-min-width` (260px). At
≥ 900px they sit side by side and the **board region** scrolls
horizontally when they do not fit — cards never shrink, and the page
never scrolls horizontally.

## Working space

The board gets the full viewport width. Only settings and long
explanatory copy are constrained, to `--content-max-width` (68ch).
Never constrain the operational canvas to make prose look tidy.

Empty status columns keep their horizontal slot and header so
neighbouring columns do not jump when the last card leaves.

## Voice patterns

See `BRAND.md` for the copy table. Enforcement here:

- All product copy lives in `apps/web/src/app/shared/copy.ts`. No inline
  strings in templates for lifecycle, empty state, error, or toast
  surfaces. Data readouts (`working · 12m · 480 lines`) stay in the
  template — they are data, not copy.
- Care verbs appear on: empty states, close/cascade confirms,
  disconnected toasts, 404 / setup / onboarding.
- Care verbs do **not** appear on: card body, filter chips, host seals,
  status labels, timestamps, keyboard help.
- A care prompt is always followed by an honest body. `let this one
rest?` is paired with `closing ends this session… this cannot be
undone.` A prompt without that body is a review reject.

## Interaction principles

### Visible affordances

Actions never live on hover alone. Two patterns are permitted:

1. **Always-visible** — split/close render on every card at `--ink-mute`
   (measured 4.5:1, not a disabled tone) and lift to `--ink-soft` on
   hover/focus.
2. **Overflow menu** — a `LucideMoreHorizontal` trigger, itself visible
   on first render, opens a menu with the same actions. Required for
   compact cards and all touch targets.

Rail rows (workspace / tab) use the overflow menu; the pencil-on-hover
pattern is removed.

Card opening and card actions are separate semantic controls. A
`<button>` is never nested inside the card's `<a>`.

### Status is never colour alone

Every card renders a visible status word (`working`, `blocked`, …) in
`--status-*-ink` beside the `--status-*` dot — compact cards included.
Identically shaped coloured dots plus an ARIA-only label do not satisfy
this. Blocked gets the strongest emphasis, working next; done, idle and
unknown are quiet.

There is no five-badge equal-weight status summary bar, and no column is
colour-filled.

### Status columns are read-only

Status membership is herdr's fact, not the user's. A status column is
**never a drop target**: it accepts no drop, carries no drop affordance,
and no drag changes a card's status. Drop targets are user-defined
columns only, and a card is a drag **source** only once at least one of
them exists — a board with none carries no drag handle and no grab
cursor. (Maintainer decision Q1, 2026-09-10; see
`openspec/changes/add-parked-columns`.)

A status column's **position** is herdr's order too, not the user's: it is
`STATUS_COLUMN_ORDER`, and no drag moves it. A user-defined column is the
operator's, so it may be **reordered** — dragged horizontally by its own
header, which is the handle. That drag exists only where it works: not
below `--breakpoint-mobile` (the pager owns the gesture), and not on a
board with fewer than two user-defined columns. Its keyboard equivalent
is `move column left` / `move column right` in the column's header menu,
present at every width, marked `aria-disabled` at the ends of the row and
stepping over any column the filter chips have hidden. A dragged column
never comes to rest among the status columns. (Shipped in
`openspec/changes/archive/2026-09-12-add-parked-column-reorder`.)

The board never calls `pane.move` to change a status — `pane.move`'s
destination is a tab or workspace, and nothing on the board may set a
status.

Relocating a pane between tabs or workspaces is its own operation, and it
follows these rules:

- **`move to` and `park in` never share a menu.** A move reparents the
  pane on the host, can close the tab it left behind, and every other
  herdr client sees it. Parking groups a card in a column held in this
  browser and changes nothing anywhere else. One verb over two operations
  with opposite blast radii is how an operator moves a pane on a
  colleague's machine when they meant to tidy their own board.
- **The move control is rendered only where `capabilities.paneMove` is
  true** — not disabled, not hidden behind a failure.
- **Its destinations are herdr's three**, the `PaneMoveDestination` union:
  another tab, a new tab, a new workspace. A parked column is never among
  them.
- **The tab the pane is already in is not offered.** herdr answers that
  with `changed: false, reason: "same_tab"`, and an option that cannot do
  anything is not an option.
- **A refused move is not a failed one.** `pane.move` answers a no-op with
  a SUCCESSFUL response carrying `changed: false` and a reason.
  `same_tab` says nothing at all; `zoomed_tab` names the obstacle the
  operator can clear. Neither wears the failure wording, and neither
  quotes a `{reason}` — the reason is a discriminant, not herdr's prose.
- **A move's cascade is reconciled through the same purge** the board runs
  for `tab.closed` / `workspace.closed`. Moving the last pane out of a tab
  closes it, and possibly its workspace; there is one reconciliation path
  for that, not a second one for the acting client.

### Feedback surface

- Every failed action posts a deduplicated toast **and** logs diagnostic
  context. `console.warn` may accompany a toast; it may never replace
  one.
- One toast stack: bottom-right on desktop, top on mobile. There is no
  second stack.
- Persistent connection notices carry a host id, are deduplicated by it,
  and are removed by id on reconnect. Repeated failures update the
  existing notice — never a toast storm.
- A long action posts one updatable notice after 300ms, resolved on
  completion or failure. Never a modal spinner.
- Success toasts are used sparingly — only when the result is not
  already visible on the board (e.g. a workspace rename while the rail is
  collapsed).
- Any form or editable field that can fail synchronously shows an inline
  error underneath it **and keeps the value the user typed**.

### Reliability states tell the truth

Five states are distinct and none of them may be faked:

| State                                   | What the user sees                                                                                                                                                                                  |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Loading                                 | static skeleton columns; `finding hosts…`. The no-hosts state never renders before discovery finishes.                                                                                              |
| Empty (no hosts configured)             | setup instructions: `kanhrd.config.yaml` snippet, bridge command, operating-guide link                                                                                                              |
| Empty (host connected, nothing running) | `this host is quiet…`, plus a create action **only if** the capability is advertised                                                                                                                |
| Empty (filters/scope match nothing)     | `nothing matches these filters.` + a clear action. Never setup instructions.                                                                                                                        |
| Stale / disconnected                    | existing content stays visible, marked with `LucideUnplug` and `stale — reconnecting`; connection-dependent actions are gated                                                                       |
| Gone (pane detail)                      | the session ended: the last frame stays, dimmed to `--opacity-inert`, with `LucideSunset`, `the session ended. this is the last thing it said.` and a back path; no retry, no input, no live stream |
| Failed                                  | loading is replaced by a visible retry (`LucideRefreshCw`) and a back path                                                                                                                          |
| Unavailable / not found                 | `that workspace is no longer here.` + recovery. Never silently falling back to a previous scope.                                                                                                    |

One failed host never blanks healthy hosts. A single host disconnect never
destroys already-rendered content.

Pane detail shows `keeping watch…` until its first frame, then the
terminal. Failure replaces it with retry + back, never a permanent
pulse.

A terminal buffer herdr cut short is a reliability state too. When
`pane.read` or `pane.output` carries `truncated: true`, the buffer's first
line says so — `terminal.truncated`, naming herdr and the line count, with
`terminal.truncatedRaise` appended only while a deeper scrollback setting
would bring more back. It is written into the buffer in faint text, where
the missing history would be, and re-written on every full repaint; it is
never a toast, and it goes on the first complete snapshot. A truncated
buffer that looks like a short session is wrong, not absent.

### Destructive confirmations

Cascading closes (a workspace that closes N tabs, a linked-worktree group
that closes M workspaces) render a **preview list** of what will disappear —
kind, name, cardinality, one per row — instead of a prose summary. A
single-entity close renders no list.

```text
let workspace-a rest?
this closes:
  · tab build      (2 cards)
  · tab deploy     (1 card)
these sessions end and cannot be recovered.
[ keep ]   [ close workspace ]
```

- The dialog initially focuses `keep` / `cancel`, not the destructive
  action.
- The primary label is a verb from the care vocabulary
  (`rest` / `close workspace`); the secondary is `keep` / `cancel`.
- Primary uses the accent fill. `--danger-fill` is reserved for
  irrecoverable data loss (clear local data) — closing a pane is not
  danger-filled, it is honestly worded.
- The body states plainly that closing terminates the session. No copy
  may imply pause, recovery, or undo.

### Keyboard-first, but the terminal owns its keys

Every mouse action has a keyboard equivalent. The keyboard help overlay
(`shared/keyboard-help-overlay`) is the source of truth for bindings.

- The board is fully navigable with arrow keys using stable pane
  identity; `enter` opens a card.
- Overflow menus open by keyboard, navigate with arrows, dismiss with
  Escape, and return focus to their trigger **without** opening the pane.
- Dialogs and the mobile drawer trap focus, make background content
  `inert`, and return focus to the trigger on close.
- Returning from pane detail restores scope, horizontal and vertical
  scroll, and focus to the originating card — or a predictable
  neighbour if that card disappeared.
- Focus is always visible; `:focus-visible` is never suppressed.

**No global unmodified `Escape` and no global `?`.** While xterm has
focus, unmodified Escape, `?` and arrow keys reach the terminal.
Registering either globally would break vim, less, fzf and every TUI a
user runs inside a pane. Navigation out of the terminal is served by the
existing explicit prefix-shortcut mechanism plus a visible back control
in the pane-detail header. Help is reachable from that mechanism and
from a visible control — never from a bare `?`.

### Non-modal popovers

A third overlay shape sits between the overflow menu and the modal dialog:
a **non-modal popover** — a small panel, anchored to the control that
opened it, holding real form controls while the rest of the app stays
operable. The header's theme panel (`shared/theme-panel`) is the shipped
exemplar: a `role="radiogroup"` for the board theme and a `<select>` for
the terminal theme, over the board.

Pick between the three by what the surface holds and what it takes away:

| Surface           | Contains                        | Rest of the app |
| ----------------- | ------------------------------- | --------------- |
| overflow menu     | menu items — one action each    | stays reachable |
| non-modal popover | mixed form controls             | stays reachable |
| modal dialog      | a decision the user must settle | inert           |

A radio group and a `<select>` are not menu items, so `role="menu"` is
wrong for them — a menu's roles and keyboard model do not describe a
form control. And nothing here needs answering before the board can be
touched again, so it is not a modal.

Rules:

- The panel is `role="dialog"` with an accessible name. Its trigger
  carries `aria-haspopup="dialog"`, `aria-expanded`, and `aria-controls`
  naming the panel while it is open.
- **No focus trap.** Non-modal means the page stays operable: background
  content is not `inert`, and Tab leaves the panel. The trap-and-`inert`
  rule under _Keyboard-first_ is written for modal dialogs and the mobile
  drawer; it does not apply here.
- Opening moves focus into the panel, onto the first control's current
  value — so the first arrow press is already inside the control.
- Escape dismisses and returns focus to the trigger. Re-activating the
  trigger does the same.
- An outside click dismisses and leaves focus where the user clicked.
  Focus belongs where the pointer went, not back on a control the user
  was leaving.
- Escape is handled through the existing precedence ladder
  (`KeyboardService.closeTopOverlay`), never by a separate global
  binding — see the no-global-Escape rule above. Open state therefore
  lives on `LayoutService` beside the rail and the board's `+` menu.
- Keyboard operation of the controls inside is governed by their own
  roles, not by the panel: a radio group is one tab stop with a roving
  tabindex, arrows on both axes, and Home/End; a `<select>` is the
  native control.
- The panel fits inside the viewport at the 390px reference width. It
  flips or shifts rather than clipping, and it never widens the page.

### URL is state

The rail is a **navigator**, not a filter. Every scoping decision is in
the URL:

- `/` — all hosts, all workspaces, all tabs.
- `/workspace/:id` — scoped to a workspace.
- `/workspace/:id/tab/:id` — scoped to a tab.
- `/pane/:host/:id` — detail view.

A scope pill above the board mirrors the URL and offers `clear`. If a
user shares a URL, the recipient sees the same board. If the scoped
entity no longer exists, show the unavailable state — never silently
resolve to something else.

The rule governs **scope**, not arrangement. A short, closed list of
per-browser preferences stays out of the URL and therefore does not
travel with a shared link: the status filter chips (`kanhrd.filters`),
board density, terminal palette, text size and scrollback depth, the
keybind prefix (`kanhrd.keyboard`), and user-defined columns
(`kanhrd.parked-columns`).
Each is a view preference the recipient is entitled to their own answer
to; none changes _which_ cards a link resolves to. Anything that selects
which entities are shown belongs in the URL. (Maintainer decision Q5,
2026-09-10.)

## Empty states as tutorials

Every **page-level** empty state is a next step, not a message.

- **No hosts**: `kanhrd.config.yaml` snippet with a `LucideCopy` action,
  the `pnpm --filter @kanhrd/bridge dev` command, a link to
  `docs/OPERATING.md`, and the ochre dot pulse with `waiting for a host…`.
- **Host connected, no cards**: an open-a-card action, offered **only if**
  the capability is advertised.
- **Filters match nothing**: `clear filters`.
- **404**: single crook, `off the map.`, and a working link to `/`.

**Individual empty status columns are the exception**: header and mono
count `0` only, no prose, no illustration. They keep their slot.

## Motion budget

At most one salient animation at a time. Priority, highest first:

1. Status changes on cards — always instant, never queued behind an
   animation.
2. Toast enter/leave.
3. Modal open.
4. Route change.

If two would run at once, drop the lower priority. Repeated cards never
pulse, stagger, or animate into view. Loading uses one shared indicator.
Under `prefers-reduced-motion: reduce` every non-essential transition is
`0s` and the loading indicator is static; status colour changes and
focus rings stay instant and visible.

## Mobile

`--breakpoint-mobile` is **900px**. Everything in this section applies
at viewport width < 900px; the reference width for review and e2e is
**390 × 844** (iPhone 13), which the existing `mobile` Playwright
project already uses.

### Nav model (do not invent a different one)

The mobile nav is an **overlay drawer**, and this is already the app's
model — preserve it:

- `.rail` is `display: none` below 900px.
- The header hamburger (`LucideMenu`) toggles `LayoutService.railOpen`.
- `Board` and `Rail` render the drawer plus a full-viewport backdrop off
  that signal.

There is no inline rail, no bottom tab bar, and no push-content drawer.

### Per-screen requirements at 390px

#### Board — populated

- Header row: hamburger, wordmark, theme toggle, settings. All four stay
  on one row and are all reachable; nothing wraps to a second row and
  nothing is hidden behind an overflow at this width.
- Scope pill, when a scope is active, sits under the header at full
  width minus gutters, with its clear (`LucideX`) button tappable.
- Filter bar chips wrap onto multiple rows rather than scrolling
  horizontally, so no chip is unreachable.
- The board becomes a **one-column-per-screen pager**. See _Board paging
  model_ below — it is the load-bearing part of the mobile board and is
  specified in full there.
- Every card renders in the **compact** single-row variant, regardless
  of the density setting.
- Card contents must not overflow: the title truncates with an ellipsis;
  the status label, host seal and overflow trigger never truncate and
  never overlap. The full name and path are reachable via the card's
  detail route and on keyboard focus — never via hover only.
- Per-card actions are reachable **only** through the
  `LucideMoreHorizontal` overflow menu at this width. Inline split/close
  icons are not rendered on compact cards on touch.
- The `+` create menu opens inside the viewport: its left edge ≥ 0 and
  its right edge ≤ viewport width. It flips or shifts rather than
  clipping.
- The page itself never scrolls horizontally.

#### Board paging model

A desktop kanban is two-dimensional: columns across, cards down. A phone
can afford **one** scroll direction at a time. Below
`--breakpoint-mobile` the board therefore stops being a strip you graze
and becomes a pager you turn.

The rule that makes it work is that a resting position shows exactly one
column. A partly visible neighbour is not an affordance — it is an
invitation to hunt, and it costs the width that made the column readable.

One status column per screen:

- The paging strip spans the board's full width inside the page gutters.
  Each status column is `flex: 0 0 100%` of that strip — the column
  fills the strip, and no part of any other column is visible at rest.
- `scroll-snap-type: x mandatory`, each column `scroll-snap-align:
start`, and **`scroll-snap-stop: always`** so one swipe advances
  exactly one column. A hard fling must not skip past a column.
- There is no free-scrolling resting state between two columns. If a
  gesture ends mid-page, the strip settles on one column or the other,
  never between them.
- The current column index is `Math.round(scrollLeft / clientWidth)` —
  deterministic, and the value the switcher reads.
- Column order is `STATUS_COLUMN_ORDER` (`working`, `blocked`, `idle`,
  `done`, `unknown`) — the same order as desktop. Paging never reorders
  columns, and neither does the card count.
- Vertical scrolling belongs to the current column's card list, not the
  page. The header, filter bar and switcher stay put while cards scroll
  under them.
- Empty columns are still pages. An empty status column is paged to
  normally and shows its header with the count `0` and no prose,
  exactly as on desktop.

The status switcher:

- A **persistent segmented control**, pinned directly under the filter
  bar and above the paging strip. It is visible at every scroll
  position; it does not scroll away with the cards.
- One segment per **visible** status, in `STATUS_COLUMN_ORDER`. The
  number of segments is how the user knows how many columns exist, and
  the selected segment is how they know which one they are on — so no
  separate "3 of 5" indicator is needed or wanted.
- Each segment's label is the status name from `copy.status.*`. The
  **selected** segment additionally shows the current column's card
  count in `--font-mono` with tabular numerals; unselected segments show
  no count.
- Segments are `flex: 1 1 0` with `min-width: --touch-target-min`; the
  selected segment takes `flex: 1.6 1 0` so its label plus count fits
  without truncating. Unselected labels may truncate with an ellipsis;
  the selected label and its count may not.
- Height is `--switcher-height` (40px), so every segment already meets
  the 40×40 minimum. Segments sit flush with `--sp-1` separation and a
  `--rule` hairline underneath the control.
- Selection is marked by text weight (`--fw-semi`) and a 2px
  `--ochre-line` underline on the selected segment — never by colour
  alone, and never by a filled background.
- Tapping a segment pages the strip to that column
  (`scrollIntoView({ inline: 'start' })`, `behavior: 'smooth'`, or
  `'auto'` under `prefers-reduced-motion: reduce`). Swiping the strip
  updates the selected segment. The two are the same state.
- Semantics: the control is a `role="tablist"` with `role="tab"`
  segments and `aria-selected`; the paging strip's columns are the
  corresponding `role="tabpanel"`. Left/right arrow keys move between
  segments. The accessible name of a segment is
  `copy.nav.statusSwitcherItem` — `{status} — {count} cards`.
- The switcher is **mobile only**. At ≥ 900px the columns are side by
  side and the switcher is not rendered.

Status chip counts:

- Every status chip in the filter bar carries a live pane count trailing
  its label — `blocked 3`, `idle 0`, `unknown 12` — so a status stays
  monitorable while its column is hidden. The count is a small
  `--font-mono` numeral in `--ink-mute`, sitting after the label.
- A chip toggled off is drawn with the label struck through and dimmed;
  the count stays legible and keeps updating. Hiding the column is the
  whole reason to leave the number visible.
- Counts respect host exclusion and the URL scope, but ignore the
  status-visibility filter itself — a hidden chip reports how many panes
  _would_ be in that column if it were unhidden. Zero-count chips still
  render `0`; watching the drop is the point.

Interaction with the filter bar:

- Hiding a status in the filter bar removes its segment and its page.
  The remaining segments re-flex; order is unchanged.
- If the currently-shown status is hidden, the board pages to the
  nearest visible column to its left, or to the first visible column if
  there is none to the left. It never lands on a hidden status and never
  leaves the strip on a blank page.
- Un-hiding a status re-inserts its segment and page at its
  `STATUS_COLUMN_ORDER` position without moving the current page.
- If **every** status is hidden, the switcher and the strip are replaced
  by the `nothing matches these filters.` empty state with its
  `clear filters` action — not an empty pager.

What this model does not do:

- It does not add a drag affordance. Paging moves the viewport, never a
  card, and status membership stays herdr's fact. The column-reorder drag
  is inactive at this width for the same reason; its header-menu
  equivalent is not.
- It does not reorder or merge **status** columns by "importance", and it
  does not become an activity feed. One status per page, in the canonical
  order. (A user-defined column's position is the operator's and is
  reorderable; a status column's is not.)

#### Board — empty

- The empty state is a single vertical column at full width minus
  gutters, constrained to `--content-max-width`.
- The `kanhrd.config.yaml` snippet and the bridge command each sit in
  their own `--paper-sunk` block with `overflow-x: auto` and a visible
  `LucideCopy` button; the snippet scrolls **inside its block** and does
  not widen the page.
- Headline, body, both snippets, the copy buttons and the operating-guide
  link are all reachable by vertical scroll alone.

#### Pane detail

- Pane detail is a **route** (`/pane/:host/:id`), one terminal at a
  time, subscribing on init and tearing down on destroy. At phone width
  it is a full-screen view.
- There is no mobile multi-pane view and no split view. A **card
  switcher** is neither: it navigates between routes, one terminal at a
  time, so it renders at every width, phone included. Forbidding it
  outright would rule out the panels-in-the-same-view controls wanted
  here and in the web terminal view. (Maintainer decision D1,
  2026-09-10; see `openspec/changes/add-terminal-top-bar`.)
- The card switcher, rendered when the tab holds more than one card, is
  a horizontally scrolling strip: `overflow-x` sits on the strip and
  never on the page, and every entry meets `--touch-target-min`.
- Header at 390px: a visible back control (`LucideArrowLeft` +
  `back to the board`) as the first focusable element, then the title,
  then the host seal. The metadata strip (pane id, revision, live state)
  wraps beneath rather than truncating the title.
- The terminal fills the remaining height and owns horizontal overflow
  internally. It never causes page-level horizontal scroll.
- While the terminal has focus, unmodified Escape / `?` / arrows go to
  the terminal. The back control is the escape hatch, and it must remain
  visible without scrolling.
- `keeping watch…` occupies the terminal area until the first frame; on
  failure it is replaced in place by retry + back.
- A **key bar** sits at the bottom of the visual viewport on the pane-detail
  route at every width: fixed, riding on top of the soft keyboard when it is
  open and staying when it is dismissed. Its always-present strip is its
  only toggle and, collapsed or not, its status line — it shows any latched
  modifier, so a latch is never invisible. The expanded row holds keycaps
  (`esc`, `ctrl`, `^B`, `tab`, arrows, `alt`), scrolls horizontally inside
  itself where it does not fit, and never widens the page. Every key is
  ≥ `--touch-target-min`; the strip draws shorter but its hit area reaches
  the minimum by extending over the terminal's bottom edge. Tapping the bar
  never moves focus off the terminal, and the terminal's box ends above the
  bar and any keyboard under it. `ctrl` and `alt` latch for one key on tap,
  lock on long-press, and show idle, armed and locked distinctly. `^B` is a
  literal `ctrl+b` for the pane's program, not kanhrd's prefix.

#### Settings

- Single column, full width minus gutters, capped at
  `--content-max-width`.
- Each `.setting-row` stacks label above control below 900px rather than
  sitting side by side; the control takes full row width.
- The density segmented control, the terminal-theme `<select>`, the
  poll-override `<input>` and the theme button all meet the touch-target
  minimum.
- Host lists wrap; a long `last_error` wraps rather than forcing
  horizontal scroll.
- The back control is the first focusable element.

#### Nav drawer

- Width `min(80vw, 20rem)`, pinned to the left edge, full viewport
  height, `--paper-raised` fill, scrolls vertically inside itself.
- Backdrop covers the full viewport at `--paper-scrim`, sits below the
  drawer and above everything else.
- Workspace / tab rows meet the touch-target minimum, and their actions are
  in an overflow menu, never inline hover icons.
- Long workspace and tab names truncate inside the drawer; they never widen
  it.

### Touch targets

Minimum **40 × 40 CSS pixels** (`--touch-target-min`) for every
interactive control under `pointer: coarse`. This binds, at minimum:

- card overflow triggers and every item in an open overflow menu;
- filter-bar host chips and status chips;
- drawer rows and drawer row actions;
- header controls: hamburger, theme toggle, settings link;
- the board `+` button and every item in the `+` menu;
- scope-pill clear;
- dialog buttons (`keep`, `cancel`, the destructive action);
- pane-detail back control;
- settings controls, including the `<select>` and `<input>`.

Compact density **never** shrinks a touch target. `--density-scale`
reduces padding, but a coarse-pointer control floors at
`--touch-target-min`; where padding alone would fall below it, the
control gains explicit `min-width` / `min-height`. Visual density and
tap safety are independent knobs.

Adjacent targets keep at least `--sp-2` (8px) of separation so a thumb
cannot hit two at once.

### Drawer behaviour

- **Focus containment.** Opening the drawer moves focus to its first
  focusable element and traps focus inside. Background content is
  `inert`. Closing returns focus to the hamburger.
- **Backdrop.** A tap anywhere on the backdrop closes the drawer.
- **Dismissal.** Backdrop tap, Escape (the drawer is app chrome, not the
  terminal, so Escape is scoped to the open drawer — this is not a
  global binding), and selecting a navigation destination all close it.
  Navigating to a scope closes the drawer before the board re-renders.
- **Resize across 900px.** Crossing from < 900px to ≥ 900px while the
  drawer is open closes it and clears `railOpen`, so the desktop inline
  rail is not left in a drawer state; focus moves to the now-visible
  rail rather than being lost to `document.body`. Crossing back down
  leaves the drawer closed. Rotation is handled by the same width-based
  rule — there is no separate orientation logic.
- The drawer never persists across a route change to pane detail.

### Toasts on mobile

- Mobile toasts stack at the **top**, so the bottom-anchored drawer
  handle and thumb zone stay clear. Desktop keeps a single bottom-right
  stack. There is never more than one stack active.
- The top stack must not cover the header controls: it renders below the
  header, offset by the header height, not over it.
- When a dialog is open, toasts never obscure the dialog's buttons —
  the dialog's controls remain hittable while notices are visible.
- Persistent connection notices behave the same as desktop: one per host,
  deduplicated by id, removed by id on reconnect.

### Horizontal overflow rule

Exactly one element may scroll horizontally on the board route: the
status-column **paging strip**, and it scrolls one full-width column at
a time (see _Board paging model_). Everything else fits.

- `document.documentElement.scrollWidth` must not exceed
  `clientWidth` on any route at 390px.
- Snippet blocks, terminal output and any wide table scroll inside their
  own `overflow-x: auto` container.
- Card text elements are never wider than the viewport.

### E2E-assertable requirements

The following are written to be turned directly into Playwright
assertions. Most live in `apps/web/e2e/mobile.spec.ts` under the `mobile`
project; an assertion that needs no herdr belongs in a mock-bridge suite
instead, so it runs everywhere (assertion 39 is in
`apps/web/e2e/viewport-matrix.spec.ts` for that reason). Each assertion
names its home where it is not the mobile suite.

#### Assertions — board, populated

- **1.** `document.documentElement.scrollWidth <= clientWidth + 1` on `/`.
- **2.** `nav.rail` is hidden on load.
- **3.** Every visible card matches the compact variant: its bounding-box
  height equals `--card-compact-height`.
- **4.** For each card, the bounding boxes of `.agent-name`, the host seal and
  the overflow trigger are each ≤ viewport width and do not intersect.
- **5.** Every card exposes a `LucideMoreHorizontal` overflow trigger queryable
  by role without simulating hover.
- **6.** Opening a card's overflow menu renders every action; each menu item's
  bounding box is ≥ 40 × 40.
- **7.** Every `.chip` in the filter bar is ≥ 40 × 40 (already asserted).
- **8.** The `+` menu, when open, has `x >= 0` and `x + width <= viewport
width` (already asserted).
- **9.** Header hamburger, theme toggle and settings link are all visible and
  each ≥ 40 × 40.

#### Assertions — board paging

- **10.** The paging strip has computed `scroll-snap-type: x mandatory` and
  each column has `scroll-snap-align: start` and
  `scroll-snap-stop: always`.
- **11.** **Full width, no peek.** For the column at rest, its bounding-box
  width equals the strip's `clientWidth` (± 1px), and every other
  column's bounding box lies entirely outside the strip's visible
  rect — no second column is partially visible.
- **12.** **One swipe, one column.** From `scrollLeft === 0`, a single swipe
  (or `strip.scrollBy({ left: clientWidth })`) settles at
  `scrollLeft === clientWidth` (± 1px), i.e.
  `Math.round(scrollLeft / clientWidth)` advances by exactly 1.
- **13.** **No skipping.** A fast fling of 3 × `clientWidth` still settles at
  `Math.round(scrollLeft / clientWidth) === 1`.
- **14.** **No resting between pages.** After any settle,
  `scrollLeft % clientWidth` is 0 (± 1px).
- **15.** **Switcher reaches every status.** The switcher renders one
  `role="tab"` per visible status in `STATUS_COLUMN_ORDER`; tapping
  each in turn settles the strip on the matching column, and after the
  last one every status has been visited.
- **16.** Tapping a switcher segment sets `aria-selected="true"` on it and
  `false` on all others; swiping the strip moves `aria-selected` to
  the segment matching the new index.
- **17.** The selected segment displays the current column's card count and it
  equals the number of cards rendered in that column; unselected
  segments display no count.
- **18.** Every switcher segment's bounding box is ≥ 40 × 40.
- **19.** The switcher stays visible after scrolling the current column's card
  list to its bottom (it does not scroll away with the cards).
- **20.** Hiding the currently-shown status via its filter chip removes that
  segment and leaves the strip settled on a visible column, with
  `aria-selected` on a rendered segment.
- **21.** Hiding every status replaces the switcher and the strip with the
  `nothing matches these filters.` empty state and its
  `clear filters` action.
- **22.** On a board with no user-defined columns, no element carries
  `cdkDrag` enabled, a drag handle, or `cursor: grab`. On any board, no
  status column is a drop target, no status column's header is a drag
  handle or a reorder target, and no drag changes a card's status or a
  status column's position.

#### Assertions — board, empty

- **23.** With no hosts configured, the config snippet block's own
  `scrollWidth > clientWidth` is permitted, while the document's is
  not.
- **24.** The copy button and the operating-guide link are both visible and
  ≥ 40 × 40.

#### Assertions — pane detail

- **25.** Tapping a card navigates to `/pane/:host/:id` and xterm renders
  non-empty content (already asserted).
- **26.** The back control is visible without scrolling and is the first
  focusable element in the header.
- **27.** `document.documentElement.scrollWidth <= clientWidth + 1` on the
  pane route.
- **28.** With the terminal focused, `page.keyboard.press('Escape')` and `'?'`
  do not change the URL and do not open the help overlay.

#### Assertions — settings

- **29.** `document.documentElement.scrollWidth <= clientWidth + 1` on
  `/settings`.
- **30.** Each `.setting-row` is stacked: the label's bounding box bottom is
  ≤ the control's bounding box top.
- **31.** The terminal-theme `<select>`, the poll `<input>`, both density
  segments and the theme button are each ≥ 40 × 40.

#### Assertions — key bar

Asserted in `apps/web/e2e/key-bar.spec.ts` (mocked bridge, 390 × 844, touch)
and `apps/web/e2e/key-bar-live.spec.ts` (live).

- **40.** Every key's bounding box is ≥ 40 × 40, and a tap 36px above the
  strip's visible bottom edge still toggles it.
- **41.** `document.documentElement.scrollWidth <= clientWidth + 1` with the
  row expanded, while the row itself scrolls horizontally.
- **42.** The terminal container's bottom edge is at or above the bar's top,
  expanded and collapsed.
- **43.** Tapping a key sends `pane.send_keys` and xterm's helper textarea
  keeps focus.
- **44.** A tapped `ctrl` shows `armed`, the next typed key goes out as
  `ctrl+<key>`, and `ctrl` shows `idle` again.
- **45.** Keys sent from the bar arrive at the program in a live pane.

#### Assertions — drawer

- **32.** Tapping the hamburger shows `nav.rail` and `.rail-backdrop`; tapping
  the backdrop hides both (already asserted).
- **33.** While the drawer is open, `document.activeElement` is inside the
  drawer, and Tab cycles without leaving it.
- **34.** Escape closes the drawer and focus returns to `.hamburger`.
- **35.** Every drawer row is ≥ 40 × 40.
- **36.** Resizing the viewport to 1000px wide while the drawer is open leaves
  `nav.rail` visible as the inline rail, `.rail-backdrop` hidden, and
  the status switcher not rendered.

#### Assertions — toasts

- **37.** A toast raised at 390px has a bounding-box top ≥ the header's
  bounding-box bottom.
- **38.** With a confirm dialog open and a toast visible, the dialog's `keep`
  and destructive buttons are still hittable
  (`toBeVisible` + a successful click).

#### Assertions — theme panel

Asserted in `apps/web/e2e/viewport-matrix.spec.ts` rather than
`mobile.spec.ts`: the header is app chrome and renders in every state the
mock-bridge harness serves, so the check runs without a herdr.

- **39.** At 390 × 844, activating the header theme trigger sets its
  `aria-expanded` to `true` and renders the `role="dialog"` panel; the
  panel's bounding box has `x >= 0` and `x + width <= viewport width`,
  and `document.documentElement.scrollWidth <= clientWidth + 1` while it
  is open.

## Anti-patterns (rejects at review)

- `console.warn` as the sole error path.
- Hover-only reveal of an action that has no alternative path.
- Raw hex, ad-hoc `rem` font sizes, or ad-hoc pixel radii in a component
  style.
- An exclamation mark anywhere; "Successfully closed pane!".
- Copy implying pause, recovery or undo where the session is terminated.
- A modal spinner blocking the board.
- Multiple simultaneous animations in the same viewport.
- An empty state that is a message rather than a next step (page-level
  only — an empty status column is correctly bare).
- Custom icon glyph via HTML entity or emoji when lucide has one; a
  second icon package alongside `@lucide/angular`.
- A traffic-light bar of five status counts at equal weight.
- Calling a tab a "lane" — a lane is a swimlane.
- The display serif on a repeated identifier.
- Any drop target on a status column, or any drag that changes a card's
  status or a status column's position. (A card may be a drag _source_
  into a user-defined column once one exists — Q1, 2026-09-10; a
  user-defined column may be dragged by its header to reorder it, with
  the header-menu equivalent that makes it legal.)
- A column-reorder drag without its keyboard equivalent, or on a board
  where it cannot work (below `--breakpoint-mobile`, or with one
  user-defined column).
- A global unmodified `Escape` or `?` binding.
- Per-pane terminal themes; the terminal palette is app-wide.
- Fabricated data for decoration — a duration measured from something
  other than what it claims to measure (the card's elapsed readout is
  the bridge's observation of when the pane entered its status, and is
  omitted entirely when the bridge has none: absent beats wrong), or a
  card fetching terminal output it does not need.
- Virtualizing at 20 cards; compact is 20, virtualization is 50.
- Constraining the board to a reading width.
- A mobile multi-pane or split terminal view.
- A mobile board that rests showing part of a second status column; the
  pager shows exactly one column per screen.
- A mobile board that reorders or merges status columns by "importance",
  or replaces the pager with an activity feed.
