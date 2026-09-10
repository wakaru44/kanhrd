# kanhrd — design system

The token layer that implements [`docs/BRAND.md`](BRAND.md). This document
is the **authoritative contract**: every custom property below is defined
with the exact name and exact value given here, and every implementation
lane consumes it verbatim.

Source files:

```text
apps/web/src/
  styles.scss                     # imports the two below; resets + document defaults only
  app/
    shared/
      tokens.scss                 # every custom property in this document
      typography.scss             # @font-face, family + scale + weight tokens
      icons.ts                    # the lucide icon list in this document
      copy.ts                     # the copy strings in docs/BRAND.md
```

## Principles

1. **Tokens over ad-hoc values.** No raw hex in components. No hardcoded
   `0.7rem`. Structural values (`0`, `100%`, `1fr`, `1px`, documented
   media-query breakpoints) are allowed — they are layout, not design
   decisions.
2. **Paper is primary.** Light theme is the reference; dark theme is
   separately tuned, not an inversion.
3. **Colour signals status, not chrome.** Chrome is ink on paper. The one
   bounded brand exception is the ochre hairline outline of the host
   seal (see _Host seal_).
4. **Hairlines over shadows.** Elevation is a rule, not a blur.
5. **One type family per role.** Serif = display and wordmark only. Sans
   (Inter) = all UI including repeated agent titles. Mono = terminal,
   ids, counts and durations.
6. **A brand swatch is not a foreground colour.** Every foreground and
   every essential boundary has its own measured token. See
   _Accessibility_ for the arithmetic.

## Colour tokens

Defined at `:root` (light/washi) and overridden on `[data-theme="dark"]`
(sumi). Both palettes are tuned independently. Every value below has been
contrast-measured; see _Accessibility_.

### Light — washi (default)

```scss
/* surfaces */
--paper: #f4ede0; /* washi cream — app background */
--paper-sunk: #ebe2d1; /* recessed surfaces, card body */
--paper-raised: #fbf6ea; /* popovers, dialogs, toasts */
--paper-scrim: rgba(26, 24, 21, 0.44); /* modal / drawer backdrop */

/* rules */
--rule: #d8cdb8; /* decorative hairline, card border */
--rule-strong: #b8ad96; /* structural divider under headers */
--rule-control: #8a7f6a; /* essential control boundary (>= 3:1) */

/* ink */
--ink: #1a1815; /* sumi — primary text */
--ink-soft: #4a463f; /* secondary text */
--ink-mute: #6b6459; /* captions, enabled muted actions */
--ink-disabled: #a09786; /* disabled only — never an enabled control */

/* accent */
--ochre: #c8842a; /* brand swatch: seal outline, crook, fills */
--ochre-line: #aa6f20; /* accent as an essential boundary (>= 3:1) */
--ochre-ink: #85571b; /* accent as text (>= 4.5:1) */
--ochre-tint: #f0dcb6; /* accent background wash */
--accent-fill: #c8842a; /* primary button resting fill */
--accent-fill-press: #85571b; /* primary button pressed fill */
--on-accent: #1a1815; /* foreground on --accent-fill */
--on-accent-press: #f4ede0; /* foreground on --accent-fill-press */
--danger-fill: #b6412a; /* irrecoverable-loss button fill only */
--on-danger: #f4ede0; /* foreground on --danger-fill */
--focus-ring: #aa6f20; /* == --ochre-line */

/* brand swatches — identity references, never used directly as a
   foreground or as an essential boundary; see the status tokens */
--vermilion: #b6412a;
--matcha: #6b7d4a;
--indigo: #2f4a6b;
--stone: #8a8578;

/* status — dot / indicator fills (>= 3:1 on --paper and --paper-sunk) */
--status-working: #aa6f20;
--status-blocked: #b6412a;
--status-done: #6b7d4a;
--status-idle: #2f4a6b;
--status-unknown: #827d70;

/* status — text labels (>= 4.5:1 on all three surfaces) */
--status-working-ink: #85571b;
--status-blocked-ink: #a53a25;
--status-done-ink: #5b6a3f;
--status-idle-ink: #2f4a6b;
--status-unknown-ink: #69655b;
```

### Dark — sumi

```scss
/* surfaces */
--paper: #161311;
--paper-sunk: #1e1a17;
--paper-raised: #24201c;
--paper-scrim: rgba(8, 7, 6, 0.6);

/* rules */
--rule: #2f2a25;
--rule-strong: #423b34;
--rule-control: #75695c;

/* ink */
--ink: #ece3d1;
--ink-soft: #b4ab98;
--ink-mute: #8f8776;
--ink-disabled: #5c554a;

/* accent */
--ochre: #d69746;
--ochre-line: #d69746;
--ochre-ink: #e0a75c;
--ochre-tint: #3a2c17;
--accent-fill: #d69746;
--accent-fill-press: #b47826;
--on-accent: #161311;
--on-accent-press: #161311;
--danger-fill: #d0765f;
--on-danger: #161311;
--focus-ring: #d69746;

/* brand swatches */
--vermilion: #c4553d;
--matcha: #86975f;
--indigo: #5f7ea0;
--stone: #8f8879;

/* status — dot / indicator fills */
--status-working: #d69746;
--status-blocked: #c4553d;
--status-done: #86975f;
--status-idle: #5f7ea0;
--status-unknown: #8f8879;

/* status — text labels */
--status-working-ink: #e0a75c;
--status-blocked-ink: #d0765f;
--status-done-ink: #9aab72;
--status-idle-ink: #7c97b5;
--status-unknown-ink: #a49c8b;
```

### Status token rules

- Components render a status **dot or symbol** with `--status-*` and a
  status **text label** with `--status-*-ink`. They never reference
  `--ochre`, `--vermilion`, `--matcha`, `--indigo`, or `--stone`
  directly.
- Colour is never the only carrier. Every status renders a visible text
  label (compact cards included) alongside the dot.
- `--status-*` values are literal hex, not `var()` aliases of the brand
  swatches: `working` is a darkened ochre and `unknown` a darkened stone
  precisely because the raw swatches fail 3:1 on paper.

### Colour usage rules

- Chrome is `--ink*` on `--paper*`. No accent fills in chrome.
- One `--accent-fill` primary action per screen.
- `--danger-fill` is reserved for irrecoverable data loss (clear local
  data). Closing a pane, tab or workspace is **not** danger-filled — it
  uses the primary accent with honest copy.
- `--ink-disabled` marks disabled controls only. An enabled muted action
  is `--ink-mute`. Loading is never expressed by dimming.

## Typography

### Families

```scss
--font-display: 'Shippori Mincho', Georgia, 'Times New Roman', serif;
--font-ui: 'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif;
--font-mono: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace;
```

**Family roles are binding.**

| Surface                                                                  | Family                      |
| ------------------------------------------------------------------------ | --------------------------- |
| Wordmark                                                                 | `--font-display`            |
| Status column heading                                                    | `--font-display`            |
| Modal title                                                              | `--font-display`            |
| Page-level empty-state headline, 404 headline                            | `--font-display`            |
| Settings section heading                                                 | `--font-display`            |
| **Agent card title**                                                     | `--font-ui` at weight `500` |
| **Pane-detail title**                                                    | `--font-ui` at weight `500` |
| Buttons, labels, body copy, help overlay                                 | `--font-ui`                 |
| Pane ids, host seal glyph, durations, counts, byte/line counts, terminal | `--font-mono`               |

The display serif never appears on a repeated per-card surface. Hundreds
of serif identifiers dilute hierarchy and slow scanning; the serif earns
its weight by being rare.

### Scale

```scss
--fs-caption: 0.75rem;
--lh-caption: 1.3;
--fs-small: 0.8125rem;
--lh-small: 1.4;
--fs-body: 0.9375rem;
--lh-body: 1.5;
--fs-lead: 1.0625rem;
--lh-lead: 1.5;
--fs-h3: 1.25rem;
--lh-h3: 1.35;
--fs-h2: 1.625rem;
--lh-h2: 1.25;
--fs-h1: 2.25rem;
--lh-h1: 1.15;
```

| Token          | Use                                                              |
| -------------- | ---------------------------------------------------------------- |
| `--fs-caption` | timestamps, host seal glyph, column count                        |
| `--fs-small`   | card meta row, badges, compact card title                        |
| `--fs-body`    | default UI, buttons, modal body                                  |
| `--fs-lead`    | standard-density card title, section intro                       |
| `--fs-h3`      | modal titles, status column headings                             |
| `--fs-h2`      | settings section headings, in-app wordmark, empty-state headline |
| `--fs-h1`      | onboarding, 404, mark-only pages                                 |

Nothing below `--fs-caption` may be introduced to make a dense layout
fit. Compact density reduces padding, not the type ladder.

### Weights

```scss
--fw-regular: 400; /* body */
--fw-medium: 500; /* UI emphasis, card and pane-detail titles */
--fw-semi: 600; /* interactive labels, buttons */
```

No `700` in chrome — the display serif carries emphasis.

### Numerals

Counts, durations, revisions and byte/line counts set
`font-variant-numeric: tabular-nums` so columns of numbers do not
shimmer as they update.

### Loading

Fonts are served locally from `apps/web/public/fonts/` with
`font-display: swap` and the fallback stacks above. A missing font file
degrades to the fallback and MUST NOT block the board.

User-supplied names, paths and quoted wire errors keep their original
case; `text-transform` is never applied to them.

## Spacing

Base = 4px. All layout spacing is a multiple.

```scss
--sp-1: 4px;
--sp-2: 8px;
--sp-3: 12px;
--sp-4: 16px;
--sp-5: 20px;
--sp-6: 24px;
--sp-8: 32px;
--sp-10: 40px;
--sp-12: 48px;
```

Density multipliers (already stamped on `<html>` by `SettingsService`):

```scss
--density-scale: 1; /* [data-density="compact"] → 0.65 */
--density-text-scale: 1; /* [data-density="compact"] → 0.92 */
```

`--density-scale` multiplies component padding only. Grid gaps stay at
their token so column alignment survives a density change.

Layout constants:

```scss
--column-min-width: 260px; /* status column minimum */
--content-max-width: 68ch; /* settings + explanatory copy only */
--touch-target-min: 40px;
--breakpoint-mobile: 900px;
--card-compact-height: 44px; /* compact card row, excluding gap */
--card-gap: 8px; /* vertical gap between cards in a column */
--switcher-height: 40px; /* mobile status switcher, also its tap target */
```

`--card-compact-height` + `--card-gap` = **52px**, which is the exact
`itemSize` the CDK virtual viewport must use. A mismatch clips rows.
`--card-compact-height` is ≥ `--touch-target-min`, so a compact card is
already a safe tap target.

There is deliberately **no** mobile column-width token. Below
`--breakpoint-mobile` a status column is `flex: 0 0 100%` of the paging
strip — a structural value, not a design decision, and a token holding
`100%` would only invite a value other than 100%. The earlier
`--column-snap-width: 85vw` is **removed**: a partly visible neighbouring
column turns paging back into hunting. See `UX-GUIDELINES.md`
§ Board paging model.

`--content-max-width` constrains explanatory text. It is never applied to
the board: the board uses the full viewport width.

## Radii

```scss
--radius-sm: 4px; /* chips, host seals (hanko) */
--radius-md: 6px; /* cards, inputs, buttons */
--radius-lg: 10px; /* popovers, overflow menus */
--radius-pill: 999px; /* scope pill only */
```

Modals have **no** radius (see _Modal_). Prefer square + hairline over
large radii.

## Elevation (there is no elevation)

No `box-shadow` in chrome. Elevation is expressed as a rule:

```scss
--elev-1: 1px solid var(--rule); /* resting card, toast */
--elev-2: 1px solid var(--rule-strong); /* hover */
--elev-3: 1px solid var(--rule-control); /* enabled control boundary */
```

Torii framing on modals is implemented as real borders, not a shadow
token:

```scss
border-block: 1px solid var(--rule-strong);
border-inline: 0;
border-radius: 0;
box-shadow: none;
```

The only permitted non-border depth is `--paper-scrim` on the modal and
mobile-drawer backdrop — opacity, not blur.

## Motion

```scss
--motion-fast: 90ms;
--motion-med: 180ms;
--motion-slow: 320ms;
--ease-out: cubic-bezier(0.2, 0, 0, 1);
--ease-in-out: cubic-bezier(0.4, 0, 0.2, 1);
```

| Token           | Use                                |
| --------------- | ---------------------------------- |
| `--motion-fast` | hover, focus, border colour change |
| `--motion-med`  | modal open, toast enter/leave      |
| `--motion-slow` | route change, empty-state entrance |

Status changes are **instant** — they never wait on a transition. Under
`prefers-reduced-motion: reduce`, all non-essential transitions are set
to `0s`; focus rings and status colour changes stay instant and visible.
The shared loading indicator becomes static.

## Iconography

Single icon set: **`@lucide/angular`** — already a dependency of
`apps/web`. Do **not** install `lucide-angular` or any second icon
package. Icons are re-exported from `apps/web/src/app/shared/icons.ts`;
templates import from there, never from the package directly.

```scss
--icon-sm: 14px; /* inline in text */
--icon-md: 16px; /* buttons (default .icon size) */
--icon-lg: 20px; /* header */
--icon-xl: 24px; /* empty state */
```

Icon colour is `currentColor`. The only accent-filled mark in the app is
the ochre crook glyph in the wordmark and favicon.

### The icon list

Verified against `@lucide/angular@1.43.0`. Component class ← selector ←
purpose:

| Component              | Template selector           | Used for                                            |
| ---------------------- | --------------------------- | --------------------------------------------------- |
| `LucideMenu`           | `svg[lucideMenu]`           | rail / mobile-drawer toggle                         |
| `LucideX`              | `svg[lucideX]`              | close pane, close dialog, clear scope, clear filter |
| `LucidePlus`           | `svg[lucidePlus]`           | create menu (pane / lane / field)                   |
| `LucideSettings`       | `svg[lucideSettings]`       | settings link                                       |
| `LucideSun`            | `svg[lucideSun]`            | switch to washi                                     |
| `LucideMoon`           | `svg[lucideMoon]`           | switch to sumi                                      |
| `LucidePencil`         | `svg[lucidePencil]`         | rename field / lane                                 |
| `LucideArrowRight`     | `svg[lucideArrowRight]`     | split right                                         |
| `LucideArrowDown`      | `svg[lucideArrowDown]`      | split down                                          |
| `LucideArrowLeft`      | `svg[lucideArrowLeft]`      | back to board                                       |
| `LucideChevronRight`   | `svg[lucideChevronRight]`   | rail disclosure, scope breadcrumb                   |
| `LucideMoreHorizontal` | `svg[lucideMoreHorizontal]` | overflow menu trigger                               |
| `LucideTriangleAlert`  | `svg[lucideTriangleAlert]`  | error toast, failed state                           |
| `LucideCheck`          | `svg[lucideCheck]`          | success toast, confirmed selection                  |
| `LucideInfo`           | `svg[lucideInfo]`           | info toast                                          |
| `LucideCopy`           | `svg[lucideCopy]`           | copy config snippet / command                       |
| `LucideRefreshCw`      | `svg[lucideRefreshCw]`      | retry a failed load                                 |
| `LucideUnplug`         | `svg[lucideUnplug]`         | disconnected pen, stale marker                      |

Eighteen icons. Adding a nineteenth is a change to this document first.

`LucideMoreHorizontal` is an alias of `LucideEllipsis` and
`LucideTriangleAlert` supersedes the deprecated `LucideAlertTriangle`;
use the names in the table.

HTML entity glyphs (`✎ × ⟶ ☾ ☀ ⚙ ☰`) and emoji are prohibited as UI
chrome. The remaining `×` in `shared/keyboard-help-overlay.html` migrates
to `LucideX`.

There is no spinner icon: the shared loading indicator is a CSS ochre dot
pulse, static under reduced motion.

## Components

### Card (agent, on the board)

- Background `--paper-sunk`, border `--elev-1`, radius `--radius-md`.
- Status dot 8px, filled `--status-*`, inset `--sp-2` from the top-left.
- Title: `--font-ui`, `--fw-medium`, `--fs-lead` (standard) /
  `--fs-small` (compact). **Not the display serif.**
- Meta row: `--fs-small`, `--font-mono` for durations, ids and counts.
  Elapsed is observed client time since the status was first seen by
  this client — never presented as a server-authoritative duration.
- Visible status label in `--status-*-ink` next to the dot.
- Host seal (hanko) as below.
- Hover: border becomes `--elev-2`. No translate, no shadow, no scale.
- **Actions are visible on first render.** Split and close render at
  `--ink-mute` (measured 4.5:1) and lift to `--ink-soft` on hover/focus,
  or route through a visible `LucideMoreHorizontal` overflow trigger.
  Hover-opacity reveals are prohibited.
- Card opening and card actions are separate semantic controls; a
  `<button>` is never nested inside the card's `<a>`.
- Compact variant: a single row of dot · title · host seal · elapsed ·
  status label · overflow trigger. The title may truncate; the status
  label and overflow trigger may not. The full name and location are
  reachable by keyboard focus and in pane detail, not by hover tooltip
  alone.
- No card fetches terminal output for decoration.

### Status column

The board grouping is a **status column**, never a "lane" (a lane is a
tab — see `BRAND.md`).

- No background fill. Header is a `--rule-strong` hairline with the
  status name in `--font-display` `--fs-h3` and a `--font-mono`
  tabular count on the right.
- Minimum width `--column-min-width`. When columns do not fit, the board
  region scrolls horizontally; cards never shrink and the page never
  overflows.
- Below `--breakpoint-mobile` the columns become a one-column-per-screen
  pager: each column is `flex: 0 0 100%` of the paging strip, with
  `scroll-snap-align: start` and `scroll-snap-stop: always`, driven by
  the status switcher. No neighbouring column is visible at rest.
- An empty column keeps its horizontal slot and header; only its body
  collapses to a single hairline row with the count `0`. No prose.
- Emphasis order: `blocked` strongest, `working` next; `done`, `idle`,
  `unknown` are quiet labels with small indicators. No column is
  colour-filled and no five-badge equal-weight summary bar exists.
- **No drag affordance.** Status membership is herdr-owned. No drag
  handle, no grab cursor, no drop target, no `cdkDrag` enabled on a
  status column. `pane.move` targets a tab or workspace, not a status.

### Host seal (hanko)

- Compact rectangle, `--radius-sm`, `1px solid var(--ochre)`, never
  filled, padding `0 var(--sp-2)`.
- Glyph in `--font-mono` at `--fs-caption`, coloured `--ink-soft` — the
  host name is read from ink, not from the ochre.
- This 1px ochre outline is the **single, bounded, deliberate brand
  exception** to otherwise colour-free chrome. It is decorative: it
  carries no state and no information, so it is exempt from the 3:1
  boundary rule. Nothing else in chrome may take an accent outline.

### Scope pill (rail navigator)

- The only pill in the system. `--radius-pill`, `--paper-raised`,
  `--elev-1`, an `--status-working` dot to signal an active scope.
- Clear-scope is a `LucideX` button inside the pill, visible on render.

### Status switcher (mobile only)

Rendered below `--breakpoint-mobile` only; the desktop board has
side-by-side columns and no switcher.

- A segmented control, `role="tablist"`, one `role="tab"` segment per
  **visible** status in `STATUS_COLUMN_ORDER`.
- Height `--switcher-height` (40px) — every segment therefore already
  meets `--touch-target-min`. `--sp-1` between segments, a `--rule`
  hairline underneath the control.
- Segments are `flex: 1 1 0`, `min-width: --touch-target-min`; the
  selected segment is `flex: 1.6 1 0` so its label plus count fits.
- Label: the status name at `--fs-caption` in `--font-ui`. The selected
  segment appends the current column's card count in `--font-mono` with
  tabular numerals; unselected segments show no count.
- Selected state: `--fw-semi` plus a 2px `--ochre-line` underline. No
  filled background, and never colour alone.
- Resting fill is transparent; the control adds no surface of its own.

See `UX-GUIDELINES.md` § Board paging model for its behaviour, its
filter-bar interaction, and its e2e criteria.

### Buttons

| Variant         | Fill                  | Foreground                           | Border     |
| --------------- | --------------------- | ------------------------------------ | ---------- |
| Primary         | `--accent-fill`       | `--on-accent`                        | none       |
| Primary pressed | `--accent-fill-press` | `--on-accent-press`                  | none       |
| Secondary       | `--paper-raised`      | `--ink`                              | `--elev-3` |
| Quiet / icon    | transparent           | `--ink-mute` → `--ink-soft` on hover | none       |
| Danger          | `--danger-fill`       | `--on-danger`                        | none       |
| Disabled        | `--paper-sunk`        | `--ink-disabled`                     | `--elev-1` |

Primary hover keeps the fill and adds a 1px inset `--ochre-ink` ring;
the fill only changes on press, where the foreground swaps with it.
Disabled controls also carry `aria-disabled` and an explanatory title —
they must never be mistaken for a loading state.

### Toast

- **One stack, bottom-right on desktop; top on mobile** (so the drawer
  does not cover it). There is no top-right stack.
- `--paper-raised`, `--elev-1`, a hairline left border in the semantic
  colour: `--status-blocked` for errors, `--status-idle` for info,
  `--status-done` for success.
- Icon: `LucideTriangleAlert` / `LucideInfo` / `LucideCheck`.
- Motion: 8px slide + fade over `--motion-med`; static under reduced
  motion.
- Persistent connection notices carry a host id, are deduplicated by it,
  and are removed by id on reconnect. Repeated failures update the
  existing notice instead of stacking.
- A long action posts one updatable notice after 300ms, resolved on
  completion or failure. Never a modal spinner.

### Modal (torii framing)

- Centred, `max-width: 480px`, fill `--paper-raised`.
- Top and bottom `1px solid var(--rule-strong)`; `border-inline: 0`;
  `border-radius: 0`; `box-shadow: none`.
- Backdrop `--paper-scrim`.
- Title `--fs-h3` in `--font-display`. Primary action uses the accent;
  secondary is ink on paper.
- Focus is trapped, background content is `inert`, and focus returns to
  the trigger on close. A destructive confirmation initially focuses
  `keep` / `cancel`.
- Cascading closes render a preview list of the entities that will
  disappear (kind, name, cardinality) — one row each, no prose summary.
  A single-entity close renders no list.

### Empty state

- Headline `--font-display` at `--fs-h2` (page-level) or `--fs-h1`
  (404 / onboarding).
- Body in `--font-ui` at `--fs-body`, constrained to
  `--content-max-width`.
- Config snippet in `--font-mono` inside a `--paper-sunk` block with a
  `LucideCopy` copy action.
- Small ochre crook glyph above the headline, decorative.
- Individual empty status columns get header + count only — no copy.
  Page-level empty states always offer the next step.

### Loading / stale / unavailable

- Initial board: static skeleton columns (header rule + placeholder card
  outlines). The no-pens empty state never renders before discovery
  finishes.
- Pane detail: the ochre dot pulse plus `keeping watch…` until the first
  frame. On failure the loading state is _replaced_ by a visible retry
  (`LucideRefreshCw`) and a back path — never left spinning.
- Reconnecting: existing content stays visible, marked stale with a
  `LucideUnplug` marker and `--ink-mute` caption; actions that need the
  connection are gated. One failed pen never blanks healthy pens.
- These four states are visually distinct from each other and from
  "empty".

### Terminal (xterm.js)

Terminal palettes are **app-wide, not per-pane**.
`state/terminal-theme.service.ts` applies one palette to every terminal
and persists it under `kanhrd.terminal-theme`. That model is preserved;
no per-pane theming is introduced.

Two palettes are added alongside the existing ones. `auto` follows the
app theme (washi in light, sumi in dark); an explicitly selected existing
palette stays selected.

**Washi (light)** — background `#f4ede0`, foreground `#1a1815`:

```text
black         #1a1815     brightBlack     #6b6459
red           #b6412a     brightRed       #9c3522
green         #5e6e41     brightGreen     #566a3a
yellow        #8f5e1e     brightYellow    #8a5b1d
blue          #2f4a6b     brightBlue      #25405e
magenta       #8a4a6b     brightMagenta   #743a5a
cyan          #2f6b6b     brightCyan      #265c5c
white         #4a463f     brightWhite     #1a1815
cursor        #1a1815     selectionBackground  #ebe2d1
```

**Sumi (dark)** — background `#161311`, foreground `#ece3d1`:

```text
black         #8a7f70     brightBlack     #8f8776
red           #c9634d     brightRed       #d9836c
green         #86975f     brightGreen     #9aab72
yellow        #d69746     brightYellow    #e0a75c
blue          #6684a4     brightBlue      #7c97b5
magenta       #b07a9a     brightMagenta   #c795b1
cyan          #5f9d9d     brightCyan      #7db5b5
white         #b4ab98     brightWhite     #ece3d1
cursor        #ece3d1     selectionBackground  #2a2521
```

Every foreground above, and the default foreground, is ≥ 4.5:1 against
its own default background at 16px (measured — see _Accessibility_).

Two honest caveats:

1. Sumi's `black` is deliberately lifted to `#8a7f70` rather than sitting
   near the background, so a program that prints ANSI black stays
   readable. This departs from the conventional dark-theme mapping on
   purpose.
2. On a selected region the worst-case ANSI foreground drops to 4.31:1
   (washi) and 3.86:1 (sumi). Any tinted selection costs some contrast;
   the AA guarantee is scoped to the default background, as the spec
   states.

Arbitrary application-supplied ANSI foreground/background _combinations_
are outside this guarantee.

## Accessibility

### Targets

- Text: 4.5:1 (WCAG AA). Large display text (≥ 24px or ≥ 18.66px bold):
  3:1.
- Essential control boundaries, focus indicators and non-text status
  indicators: 3:1 against every adjacent surface.
- Decorative rules (`--rule`, `--rule-strong`, the ochre seal outline)
  carry no information and are exempt.

### Measured pairs

Ratios computed as `(L1 + 0.05) / (L2 + 0.05)` with WCAG 2.x relative
luminance (`0.2126R + 0.7152G + 0.0722B` over sRGB-linearised channels).
Worst-case surface shown.

#### Light (washi)

| Pair                                         | Ratio   | Need | Verdict       |
| -------------------------------------------- | ------- | ---- | ------------- |
| `--ink` on `--paper`                         | 15.22:1 | 4.5  | AAA           |
| `--ink` on `--paper-sunk`                    | 13.78:1 | 4.5  | AAA           |
| `--ink-soft` on `--paper-sunk`               | 7.29:1  | 4.5  | AAA           |
| `--ink-mute` on `--paper-sunk`               | 4.55:1  | 4.5  | AA            |
| `--ink-mute` on `--paper`                    | 5.02:1  | 4.5  | AA            |
| `--on-accent` on `--accent-fill`             | 5.73:1  | 4.5  | AA            |
| `--on-accent-press` on `--accent-fill-press` | 5.34:1  | 4.5  | AA            |
| `--on-danger` on `--danger-fill`             | 4.77:1  | 4.5  | AA            |
| `--ink` on `--ochre-tint`                    | 13.18:1 | 4.5  | AAA           |
| `--ochre-ink` on `--paper-sunk`              | 4.84:1  | 4.5  | AA            |
| `--rule-control` on `--paper-raised`         | 3.66:1  | 3.0  | AA (non-text) |
| `--focus-ring` on `--paper`                  | 3.60:1  | 3.0  | AA (non-text) |
| `--status-working` dot on `--paper-sunk`     | 3.26:1  | 3.0  | AA (non-text) |
| `--status-blocked` dot on `--paper-sunk`     | 4.32:1  | 3.0  | AA (non-text) |
| `--status-done` dot on `--paper-sunk`        | 3.51:1  | 3.0  | AA (non-text) |
| `--status-idle` dot on `--paper-sunk`        | 7.06:1  | 3.0  | AA (non-text) |
| `--status-unknown` dot on `--paper-sunk`     | 3.19:1  | 3.0  | AA (non-text) |
| `--status-working-ink` on `--paper-sunk`     | 4.84:1  | 4.5  | AA            |
| `--status-blocked-ink` on `--paper-sunk`     | 5.05:1  | 4.5  | AA            |
| `--status-done-ink` on `--paper-sunk`        | 4.56:1  | 4.5  | AA            |
| `--status-idle-ink` on `--paper-sunk`        | 7.06:1  | 4.5  | AAA           |
| `--status-unknown-ink` on `--paper-sunk`     | 4.52:1  | 4.5  | AA            |

#### Dark (sumi)

| Pair                                         | Ratio   | Need | Verdict        |
| -------------------------------------------- | ------- | ---- | -------------- |
| `--ink` on `--paper`                         | 14.51:1 | 4.5  | AAA            |
| `--ink-soft` on `--paper-raised`             | 7.10:1  | 4.5  | AAA            |
| `--ink-mute` on `--paper-raised`             | 4.54:1  | 4.5  | AA             |
| `--on-accent` on `--accent-fill`             | 7.38:1  | 4.5  | AAA            |
| `--on-accent-press` on `--accent-fill-press` | 4.98:1  | 4.5  | AA             |
| `--on-danger` on `--danger-fill`             | 5.67:1  | 4.5  | AA             |
| `--ink` on `--ochre-tint`                    | 10.61:1 | 4.5  | AAA            |
| `--ochre-ink` on `--paper-raised`            | 7.59:1  | 4.5  | AAA            |
| `--rule-control` on `--paper-raised`         | 3.03:1  | 3.0  | AA (non-text)  |
| `--focus-ring` on `--paper`                  | 7.38:1  | 3.0  | AAA (non-text) |
| `--status-working` dot on `--paper-raised`   | 6.45:1  | 3.0  | AA (non-text)  |
| `--status-blocked` dot on `--paper-raised`   | 3.63:1  | 3.0  | AA (non-text)  |
| `--status-done` dot on `--paper-raised`      | 5.09:1  | 3.0  | AA (non-text)  |
| `--status-idle` dot on `--paper-raised`      | 3.83:1  | 3.0  | AA (non-text)  |
| `--status-unknown` dot on `--paper-raised`   | 4.59:1  | 3.0  | AA (non-text)  |
| `--status-working-ink` on `--paper-raised`   | 7.59:1  | 4.5  | AAA            |
| `--status-blocked-ink` on `--paper-raised`   | 4.96:1  | 4.5  | AA             |
| `--status-done-ink` on `--paper-raised`      | 6.50:1  | 4.5  | AAA            |
| `--status-idle-ink` on `--paper-raised`      | 5.35:1  | 4.5  | AA             |
| `--status-unknown-ink` on `--paper-raised`   | 5.94:1  | 4.5  | AA             |

**Rejected values** — these were in the earlier draft and fail; they are
recorded so nobody reintroduces them:

| Rejected pair                                         | Ratio  | Why it was rejected                                |
| ----------------------------------------------------- | ------ | -------------------------------------------------- |
| `--ink-invert` (`#f4ede0`) on `--ochre` (`#c8842a`)   | 2.66:1 | cream on ochre is unreadable; `--on-accent` is ink |
| `--ink-mute` `#7a7266` on `--paper`                   | 4.07:1 | darkened to `#6b6459`                              |
| `--ochre` `#c8842a` as a status dot on `--paper-sunk` | 2.41:1 | `--status-working` is `#aa6f20`                    |
| `--stone` `#8a8578` as a status dot on `--paper-sunk` | 2.86:1 | `--status-unknown` is `#827d70`                    |
| `--ochre-deep` `#9a6318` as text on `--paper`         | 4.32:1 | `--ochre-ink` is `#85571b`                         |
| `--matcha` `#6b7d4a` as text on `--paper`             | 3.87:1 | `--status-done-ink` is `#5b6a3f`                   |
| `--rule-strong` `#b8ad96` as a control boundary       | 1.91:1 | `--rule-control` `#8a7f6a` added                   |
| dark `--ink-mute` `#7f7768` on `--paper-raised`       | 3.65:1 | lifted to `#8f8776`                                |
| dark `--vermilion` `#c4553d` as text on `--paper`     | 4.15:1 | `--status-blocked-ink` is `#d0765f`                |
| dark `--indigo` `#5f7ea0` as text on `--paper`        | 4.38:1 | `--status-idle-ink` is `#7c97b5`                   |

### Non-colour rules

- Never use colour alone to convey state. Every status renders a visible
  text label; identically shaped coloured dots plus an ARIA-only label
  do **not** satisfy this.
- Focus ring: `2px solid var(--focus-ring)` at `2px` outline-offset, on
  every interactive element. `:focus-visible` is never suppressed.
- Touch targets ≥ `--touch-target-min` (40×40) under `pointer: coarse`.
- Motion honours `prefers-reduced-motion`.
- Selected scope is marked by text and an active marker, not colour
  alone.

## Migration map (from current SCSS)

| Current                                                                    | New token                                                                                                                                                                              |
| -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--bg` `#14161c` / `#f4f5f7`                                               | `--paper` (`#161311` dark / `#f4ede0` light)                                                                                                                                           |
| `--surface-1` `#1b1e26` / `#ffffff`                                        | `--paper-sunk`                                                                                                                                                                         |
| `--surface-2` `#232733` / `#eceef2`                                        | `--paper-raised`                                                                                                                                                                       |
| `--border` `#2e333f` / `#d7dae1`                                           | `--rule`                                                                                                                                                                               |
| `--border-hover` `#3c4252` / `#b9bfcb`                                     | `--rule-strong`                                                                                                                                                                        |
| _(none)_                                                                   | `--rule-control` — new, for enabled control boundaries                                                                                                                                 |
| `--text` `#e6e8ee` / `#1b1e26`                                             | `--ink`                                                                                                                                                                                |
| `--text-dim` `#8b91a1` / `#5b6273`                                         | `--ink-soft`, or `--ink-mute` for captions                                                                                                                                             |
| `--status-working` `#61c98e` / `#2f9e63`                                   | `--status-working` `#d69746` / `#aa6f20`                                                                                                                                               |
| `--status-blocked` `#e0616c` / `#c73b46`                                   | `--status-blocked` `#c4553d` / `#b6412a`                                                                                                                                               |
| `--status-idle` `#e5c07b` / `#a5760a`                                      | `--status-idle` `#5f7ea0` / `#2f4a6b`                                                                                                                                                  |
| `--status-done` `#6d8fe0` / `#3f63c0`                                      | `--status-done` `#86975f` / `#6b7d4a`                                                                                                                                                  |
| `--status-unknown` `#5a6072` / `#8b91a1`                                   | `--status-unknown` `#8f8879` / `#827d70`                                                                                                                                               |
| `card.html` `[style.background]="hostColor()"` on the host chip            | host seal: outline `--ochre`, no fill                                                                                                                                                  |
| ad-hoc `0.7 / 0.8 / 0.85 / 1 / 1.05 / 1.4rem`                              | `--fs-caption` … `--fs-h2`                                                                                                                                                             |
| `border-radius: 6px / 8px / 10px`                                          | `--radius-md` / `--radius-md` / `--radius-lg`                                                                                                                                          |
| `XTERM_THEME_DARK` `#14161c`/`#e6e8ee`                                     | Sumi palette above                                                                                                                                                                     |
| `XTERM_THEME_LIGHT` `#f4f5f7`/`#1b1e26`                                    | Washi palette above                                                                                                                                                                    |
| `.icon { width: 1rem }` in `styles.scss`                                   | `--icon-md`                                                                                                                                                                            |
| `×` in `keyboard-help-overlay.html`                                        | `LucideX`                                                                                                                                                                              |
| `&larr;` in `pane-detail.html`                                             | `LucideArrowLeft`                                                                                                                                                                      |
| `column.html` `itemSize="84"` at > 20 panes                                | compact at > 20, virtualize at > 50; `itemSize` = `--card-compact-height` + `--card-gap` = 52                                                                                          |
| `board.scss` snap-scroll at `max-width: 1100px`, `grid-auto-columns: 80vw` | below `--breakpoint-mobile` (900px): one-column-per-screen pager, columns `flex: 0 0 100%`, `scroll-snap-stop: always`, plus the status switcher; 900–1100px uses side-by-side columns |
| `tokens.scss` `--column-snap-width: 85vw` (shipped)                        | **delete**; replaced by `--switcher-height: 40px`                                                                                                                                      |
| `column.html` count `"no working panes"`                                   | mono `0` (see `copy.ts`)                                                                                                                                                               |

## Lint gate

The pre-commit lint rule (owned by the `precommit-lint-gate` lane)
fails a commit when:

- a raw hex literal appears in any `*.scss` outside `tokens.scss`;
- a numeric `rem` font-size appears outside `typography.scss`;
- an HTML entity glyph from the prohibited set appears in a template.

Structural values (`0`, `100%`, `1fr`, `1px`, `--breakpoint-mobile`
media queries) are explicitly allowed.
