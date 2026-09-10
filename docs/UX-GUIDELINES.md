# kanhrd — UX guidelines

Reads on top of [`BRAND.md`](BRAND.md) and [`DESIGN-SYSTEM.md`](DESIGN-SYSTEM.md).
When those two contradict this file, they win — this file is _how we
use them_, not the source of truth for tokens or voice.

Vocabulary reminder from `BRAND.md`: a **lane** is a tab. A board
grouping is a **status column**. Never both.

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

kanhrd must stay useful at 1 pen and at 15 pens with 40 panes each.
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

Rail rows (field / lane) use the overflow menu; the pencil-on-hover
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

Status membership is herdr's fact, not the user's. The board exposes
**no** drag handle, grab cursor, or drop target on a status column, and
never calls `pane.move` to change a status — `pane.move`'s destination
is a tab or workspace. Relocating a pane between lanes or fields is a
separate feature with its own destination, capability, keyboard, error
and reconciliation requirements; it is not part of this redesign, and
the UI must not hint that it exists.

### Feedback surface

- Every failed action posts a deduplicated toast **and** logs diagnostic
  context. `console.warn` may accompany a toast; it may never replace
  one.
- One toast stack: bottom-right on desktop, top on mobile. There is no
  second stack.
- Persistent connection notices carry a pen id, are deduplicated by it,
  and are removed by id on reconnect. Repeated failures update the
  existing notice — never a toast storm.
- A long action posts one updatable notice after 300ms, resolved on
  completion or failure. Never a modal spinner.
- Success toasts are used sparingly — only when the result is not
  already visible on the board (e.g. a field rename while the rail is
  collapsed).
- Any form or editable field that can fail synchronously shows an inline
  error underneath it **and keeps the value the user typed**.

### Reliability states tell the truth

Five states are distinct and none of them may be faked:

| State                                  | What the user sees                                                                                                            |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Loading                                | static skeleton columns; `finding pens…`. The no-pens state never renders before discovery finishes.                          |
| Empty (no pens configured)             | setup instructions: `kanhrd.config.yaml` snippet, bridge command, operating-guide link                                        |
| Empty (pen connected, nothing running) | `this pen is quiet…`, plus a create action **only if** the capability is advertised                                           |
| Empty (filters/scope match nothing)    | `nothing matches these filters.` + a clear action. Never setup instructions.                                                  |
| Stale / disconnected                   | existing content stays visible, marked with `LucideUnplug` and `stale — reconnecting`; connection-dependent actions are gated |
| Failed                                 | loading is replaced by a visible retry (`LucideRefreshCw`) and a back path                                                    |
| Unavailable / not found                | `that field is no longer here.` + recovery. Never silently falling back to a previous scope.                                  |

One failed pen never blanks healthy pens. A single pen disconnect never
destroys already-rendered content.

Pane detail shows `keeping watch…` until its first frame, then the
terminal. Failure replaces it with retry + back, never a permanent
pulse.

### Destructive confirmations

Cascading closes (a field that closes N lanes, a linked-worktree group
that closes M fields) render a **preview list** of what will disappear —
kind, name, cardinality, one per row — instead of a prose summary. A
single-entity close renders no list.

```text
let field-a rest?
this closes:
  · lane build      (2 cards)
  · lane deploy     (1 card)
these sessions end and cannot be recovered.
[ keep ]   [ close field ]
```

- The dialog initially focuses `keep` / `cancel`, not the destructive
  action.
- The primary label is a verb from the care vocabulary
  (`rest` / `close field`); the secondary is `keep` / `cancel`.
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

### URL is state

The rail is a **navigator**, not a filter. Every scoping decision is in
the URL:

- `/` — all pens, all fields, all lanes.
- `/workspace/:id` — scoped to a field.
- `/workspace/:id/tab/:id` — scoped to a lane.
- `/pane/:host/:id` — detail view.

A scope pill above the board mirrors the URL and offers `clear`. If a
user shares a URL, the recipient sees the same board. If the scoped
entity no longer exists, show the unavailable state — never silently
resolve to something else.

## Empty states as tutorials

Every **page-level** empty state is a next step, not a message.

- **No pens**: `kanhrd.config.yaml` snippet with a `LucideCopy` action,
  the `pnpm --filter @kanhrd/bridge dev` command, a link to
  `docs/OPERATING.md`, and the ochre dot pulse with `waiting for a pen…`.
- **Pen connected, no cards**: an open-a-card action, offered **only if**
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
- Status columns become a horizontal scroll-snap strip: one column
  occupies ~85vw so the next column's edge is visible as an affordance,
  `scroll-snap-type: x mandatory`, one column per snap position.
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
- There is no mobile multi-pane view, no split view, and no pane
  switcher. Do not build one and do not hint at one.
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
- Field / lane rows meet the touch-target minimum, and their actions are
  in an overflow menu, never inline hover icons.
- Long field and lane names truncate inside the drawer; they never widen
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
- Persistent connection notices behave the same as desktop: one per pen,
  deduplicated by id, removed by id on reconnect.

### Horizontal overflow rule

Exactly one element may scroll horizontally on the board route: the
status-column strip. Everything else fits.

- `document.documentElement.scrollWidth` must not exceed
  `clientWidth` on any route at 390px.
- Snippet blocks, terminal output and any wide table scroll inside their
  own `overflow-x: auto` container.
- Card text elements are never wider than the viewport.

### E2E-assertable requirements

The following are written to be turned directly into Playwright
assertions in `apps/web/e2e/mobile.spec.ts` under the existing `mobile`
project. They are the acceptance criteria for the mobile test lane.

#### Assertions — board, populated

1. `document.documentElement.scrollWidth <= clientWidth + 1` on `/`.
2. `nav.rail` is hidden on load.
3. Every visible card matches the compact variant (single row: the
   card's bounding-box height equals the compact row height token).
4. For each card, the bounding boxes of `.agent-name`, the host seal and
   the overflow trigger are each ≤ viewport width and do not intersect.
5. Every card exposes a `LucideMoreHorizontal` overflow trigger queryable
   by role without simulating hover.
6. Opening a card's overflow menu renders every action; each menu item's
   bounding box is ≥ 40 × 40.
7. `.board-grid` has `scroll-snap-type: x mandatory`; scrolling by one
   viewport width lands on the next column's snap position.
8. Every `.chip` in the filter bar is ≥ 40 × 40 (already asserted).
9. The `+` menu, when open, has `x >= 0` and `x + width <= viewport
width` (already asserted).
10. Header hamburger, theme toggle and settings link are all visible and
    each ≥ 40 × 40.

**Board — empty** 11. With no pens configured, the config snippet block's own
`scrollWidth > clientWidth` is permitted, while the document's is
not. 12. The copy button and the operating-guide link are both visible and
≥ 40 × 40.

**Pane detail** 13. Tapping a card navigates to `/pane/:host/:id` and xterm renders
non-empty content (already asserted). 14. The back control is visible without scrolling and is the first
focusable element in the header. 15. `document.documentElement.scrollWidth <= clientWidth + 1` on the
pane route. 16. With the terminal focused, `page.keyboard.press('Escape')` and
`'?'` do not change the URL and do not open the help overlay.

**Settings** 17. `document.documentElement.scrollWidth <= clientWidth + 1` on
`/settings`. 18. Each `.setting-row` is stacked: the label's bounding box bottom is
≤ the control's bounding box top. 19. The terminal-theme `<select>`, the poll `<input>`, both density
segments and the theme button are each ≥ 40 × 40.

**Drawer** 20. Tapping the hamburger shows `nav.rail` and `.rail-backdrop`; tapping
the backdrop hides both (already asserted). 21. While the drawer is open, `document.activeElement` is inside the
drawer, and Tab cycles without leaving it. 22. Escape closes the drawer and focus returns to `.hamburger`. 23. Every drawer row is ≥ 40 × 40. 24. Resizing the viewport to 1000px wide while the drawer is open leaves
`nav.rail` visible as the inline rail and `.rail-backdrop` hidden.

**Toasts** 25. A toast raised at 390px has a bounding-box top ≥ the header's
bounding-box bottom. 26. With a confirm dialog open and a toast visible, the dialog's `keep`
and destructive buttons are still hittable
(`toBeVisible` + a successful click).

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
- Calling a board grouping a "lane".
- The display serif on a repeated identifier.
- Any drag affordance on a status column.
- A global unmodified `Escape` or `?` binding.
- Per-pane terminal themes; the terminal palette is app-wide.
- Fabricated data for decoration — a server-sounding duration that is
  really observed client time, or a card fetching terminal output it
  does not need.
- Virtualizing at 20 cards; compact is 20, virtualization is 50.
- Constraining the board to a reading width.
- A mobile multi-pane or split terminal view.
