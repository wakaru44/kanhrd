## Purpose

Client-side brand and design-system layer for kanhrd, sitting on top of
tier-1/2/3, ux-theme-and-polish, and L-UX2. Introduces a tokenized
paper-cream primary theme (washi), separately tuned dark theme (sumi),
ochre accent, Japanese-shepherd voice on empty/error/lifecycle
surfaces, always-visible affordances, torii-framed modals, hanko host
chips, signboard lane treatment, a lucide icon set, a wordmark with
brushstroke crook, and a domain-vocabulary rename (pen / field /
lane / card) applied in user-facing copy only. No bridge, wire-contract,
or capability-flag changes.

## Design intent and scope

The board is a working signboard: warm paper, disciplined ink, clear
status, and quiet controls. The primary visual hierarchy is **attention
→ agent identity → location → activity → actions**. Display typography
and the crook provide identity; repeated cards remain fast to scan.
No gradients, texture overlays, ornamental imagery, card shadows,
animated entrances per card, or extra dashboard metrics are introduced.

This change improves the existing Angular/CDK/SCSS application. It
preserves terminal input, capability gates, routes, stored preferences,
and bridge contracts. This is a specification revision, not evidence
that the proposed visuals or performance have already been validated.

### Reconciliation with the design documents

`BRAND.md` owns identity and voice, `DESIGN-SYSTEM.md` owns visual
primitives, and `UX-GUIDELINES.md` owns interactions. The following are
proposed corrections to those drafts, required to be synchronized as
part of implementation. They deliberately resolve conflicts rather
than silently inheriting both alternatives. See `../../design.md` for
code evidence and rationale.

| Draft conflict | Decision for this change |
| --- | --- |
| Both a wire tab and a status column are called “lane” | Keep `lane` for tabs; call board groupings `status columns` in copy/help. Headers use the status itself. |
| Serif titles on every repeated card | Shippori Mincho for wordmark, column headings, modal and empty-state headings; Inter 500 for agent titles and pane-detail titles. |
| `@lucide/angular` proposed despite installed Lucide | Reuse `@lucide/angular`; do not add a second icon package. |
| Per-pane terminal palettes versus current global preference | Extend the existing global selector and `kanhrd.terminal-theme` key. |
| `pane.move` proposed for dragging between statuses | Status comes from herdr. No status-column drag affordances; relocation is a separate feature. |
| Same dot shape offered as an alternative to colour | Provide visible status text or distinct status symbols, plus accessible text. |
| Ochre fills paired with cream text | Use verified contrast-safe foregrounds for each fill/state; palette colours are not automatically accessible text colours. |
| Toasts at top-right versus bottom-right | One bottom-right desktop stack; top on mobile. Persistent connection notices share it and are removed by id. |
| Empty states always require actions, but empty columns forbid copy | Individual empty columns keep header/count only; page-level empty states offer recovery or creation. |
| Token-only rules prohibit all numeric CSS | Tokenize design decisions; allow structural values such as `0`, `100%`, `1fr`, and documented media-query breakpoints. |
| Modal elevation token resembles a shadow | Implement actual top/bottom borders; no box-shadow token for modal framing. |

## ADDED Requirements

### Requirement: Design system is documented as the source of truth
The repository SHALL contain `docs/BRAND.md`, `docs/DESIGN-SYSTEM.md`,
and `docs/UX-GUIDELINES.md` describing identity, tokens, and interaction
patterns respectively. `docs/CONTEXT.md` and the top-level `README.md`
SHALL link to these three documents.

#### Scenario: A contributor looks up the primary accent
- **WHEN** a contributor opens `docs/DESIGN-SYSTEM.md`
- **THEN** the ochre accent hex, the CSS custom property name, and the states it applies to are listed in one section

#### Scenario: A contributor looks up product voice for an empty state
- **WHEN** a contributor opens `docs/BRAND.md`
- **THEN** the voice table gives concrete approved copy for empty state, lifecycle confirm, disconnect toast, and 404 surfaces

### Requirement: All style values consumed by components are tokens
The SPA SHALL define colour, spacing, radius, typography size, motion
timing, and icon-size values as CSS custom properties in
`apps/web/src/app/shared/tokens.scss` and
`apps/web/src/app/shared/typography.scss`. Component-level SCSS SHALL
consume tokens and SHALL NOT contain raw hex values, ad-hoc pixel
radii, or ad-hoc `rem` font sizes. `apps/web/src/styles.scss` SHALL
import the token files and hold only resets and document defaults.

#### Scenario: A component adds a new colour
- **WHEN** a contributor adds a background colour to a card component
- **THEN** the SCSS uses `var(--paper-sunk)` (or another token) and the pre-commit lint rule fails if a raw hex is used

#### Scenario: Font sizes are consistent
- **WHEN** a template introduces a new title
- **THEN** the SCSS uses one of `var(--fs-caption|small|body|lead|h3|h2|h1)` and does not declare a numeric `rem` size

### Requirement: Light theme (washi) is the primary theme
The SPA SHALL default to a paper-cream light theme (`--paper: #f4ede0`,
`--ink: #1a1815`, `--ochre: #c8842a`) when no `kanhrd.theme` key is
stored and the browser reports no `prefers-color-scheme` preference.
When the browser reports `prefers-color-scheme: dark`, the SPA SHALL
render the sumi dark theme. Both themes SHALL be separately tuned
palettes, not a mechanical inversion of the same values.

#### Scenario: First visit with no OS preference
- **WHEN** a user opens kanhrd for the first time with no `prefers-color-scheme` signal and no stored theme
- **THEN** the SPA renders in the washi light theme

#### Scenario: First visit prefers dark
- **WHEN** a user opens kanhrd for the first time and the browser reports `prefers-color-scheme: dark`
- **THEN** the SPA renders in the sumi dark theme

#### Scenario: Existing `kanhrd.theme = 'light'` still works
- **WHEN** a user with `kanhrd.theme = 'light'` in `localStorage` opens the redesigned SPA
- **THEN** the SPA renders in washi, and the stored key is preserved

### Requirement: Status colours are mapped through tokens
The SPA SHALL expose `--status-working`, `--status-blocked`,
`--status-done`, `--status-idle`, and `--status-unknown` tokens. Every
card, badge, and toast rendering an agent status SHALL read the colour
from these tokens and MUST NOT reference the underlying accent
variables (`--ochre`, `--vermilion`, etc.) directly. A status SHALL have visible text or a distinct symbol per status,
with an accessible status name. Identically shaped coloured dots and
ARIA-only labels do not satisfy the visible non-colour requirement.

#### Scenario: A card renders a working agent
- **WHEN** a card displays a pane with `agent_status = 'working'`
- **THEN** the status dot fill is `var(--status-working)` and the card shows `working` visibly (or a distinct working symbol with a visible legend) and exposes the accessible status name

### Requirement: Iconography is provided by a single icon set
The SPA SHALL import icons from `@lucide/angular` via
`apps/web/src/app/shared/icons.ts`. Templates MUST NOT render HTML
entity glyphs (`✎`, `×`, `⟶`, `☾`, `☀`, `⚙`, `☰`, or similar) or
emoji as UI chrome.

#### Scenario: Settings button uses lucide
- **WHEN** the app header renders the settings action
- **THEN** the DOM contains a lucide `settings` icon component, not the `⚙` character

#### Scenario: Card overflow menu uses lucide
- **WHEN** a card renders its overflow action affordance
- **THEN** the DOM contains a lucide `more-horizontal` icon component

### Requirement: Product copy for lifecycle, empty, and error surfaces is centralised
All user-facing copy strings used on empty states, lifecycle
confirmations, error toasts, disconnect/reconnect toasts, 404, and
setup surfaces SHALL be defined in `apps/web/src/app/shared/copy.ts`
and referenced from templates by name. Templates SHALL NOT inline
these strings. Data readouts (durations, byte counts, revision ids,
pane ids) are not product copy and remain in templates.

#### Scenario: The "no hosts" empty state
- **WHEN** the SPA renders the empty state because no hosts are configured
- **THEN** the headline reads `no pens yet.` and is sourced from `copy.emptyState.noPens`

#### Scenario: A pane close confirmation
- **WHEN** the SPA opens the close-pane confirmation
- **THEN** the prompt reads `let this one rest?` sourced from `copy.confirm.closePane`

#### Scenario: A disconnect toast
- **WHEN** the bridge reports a host disconnected for more than the grace period
- **THEN** the toast reads `lost sight of <host>. retrying.` sourced from `copy.toast.hostDisconnected`

### Requirement: Interactive affordances are visible without hover
Every action reachable on a card (split, close, overflow), a rail row
(rename, close, overflow), or a modal (primary, secondary) SHALL be
visible on initial render. Where density constraints require it, the
action MAY be routed through an overflow menu (lucide
`more-horizontal`), which itself is visible on initial render.
Hover-only opacity reveals are prohibited.

#### Scenario: A card exposes split and close on load
- **WHEN** the board renders and no cursor has moved
- **THEN** the split action and close (or its overflow trigger) are both queryable via `getByRole('button')` without simulating hover

#### Scenario: Touch device renders card actions
- **WHEN** the SPA renders under a `pointer: coarse` media query
- **THEN** card actions are exposed via the overflow menu with a hit area of at least 40×40 CSS pixels

### Requirement: Cascading confirmations render a preview list
When a lifecycle action would close more than one entity (a workspace
that closes N tabs, a linked-worktree group that closes M
workspaces), `ConfirmModal` SHALL render a bulleted preview of every
entity that will disappear, showing kind, name, and cardinality, in
place of a prose summary. Single-entity confirmations SHALL NOT render
the preview list.

#### Scenario: Cascading workspace close
- **WHEN** a user triggers close on a workspace with 2 tabs and 3 panes
- **THEN** the confirm modal lists each tab and each pane that will close, one per row

#### Scenario: Single pane close
- **WHEN** a user triggers close on a single pane with no dependents
- **THEN** the confirm modal shows the copy `let this one rest?` and no preview list

### Requirement: Empty states are next steps
Every page-level empty state (no hosts, no matches, 404) SHALL contain the
next-step affordance a user needs at that surface rather than a bare
message. The no-hosts empty state SHALL show a sample
`kanhrd.yaml` snippet, a start command, and a link to `docs/OPERATING.md`.

#### Scenario: No hosts empty state
- **WHEN** no hosts have been configured
- **THEN** the empty state displays a copy-able `kanhrd.yaml` snippet, the `pnpm --filter @kanhrd/bridge dev` command, and a link to the operating guide

#### Scenario: Empty lane
- **WHEN** a status column has zero cards
- **THEN** the lane collapses to a single hairline row containing its title and the mono count `0`, with no prose message

### Requirement: Wordmark and browser identity are branded
The SPA SHALL set `<title>kanhrd — a shepherd's console</title>` in
`apps/web/index.html`. The app header SHALL render the wordmark
`kanhrd` in the display serif with the ochre brushstroke crook SVG
mark positioned optically above the `n` (which has no descender). The favicon SHALL be
`apps/web/public/favicon.svg` (the crook alone in ochre on cream) and
SHALL include a dark-mode variant selectable via
`<link rel="icon" media="(prefers-color-scheme: dark)">`.

#### Scenario: Page title
- **WHEN** a user opens kanhrd
- **THEN** the browser tab shows `kanhrd — a shepherd's console`

#### Scenario: Favicon adapts to system theme
- **WHEN** the OS reports `prefers-color-scheme: dark`
- **THEN** the browser loads the dark-variant favicon

### Requirement: Domain vocabulary rename applies to copy only
User-facing copy strings SHALL use `pen` (host), `field` (workspace),
`lane` (tab), `status column` (board grouping), and `card` (pane, on the board only) per
`docs/BRAND.md`. Wire-protocol messages, TypeScript identifiers,
capability names, API method names, error messages that quote wire
responses, and any code that talks to herdr's JSON socket SHALL keep
herdr's original terminology.

#### Scenario: Filter chip label
- **WHEN** the board renders a host filter chip
- **THEN** its accessible label is prefixed with `pen: ` (not `host: `)

#### Scenario: Bridge error passthrough
- **WHEN** the SPA renders an error toast that quotes a wire response mentioning `host`
- **THEN** the wire term `host` is preserved in the quoted portion, while the framing copy uses `pen`

### Requirement: Modals adopt the torii framing
Modal surfaces (`ConfirmModal`, keyboard help overlay) SHALL render
with a top and bottom `1px solid var(--rule-strong)` and no side
borders or corner radius. Their fill SHALL be `var(--paper-raised)`.
Drop shadows SHALL NOT appear on modal chrome; only the backdrop
scrim may use opacity.

#### Scenario: Confirm modal open
- **WHEN** a lifecycle action opens `ConfirmModal`
- **THEN** the modal element has a top and bottom hairline rule, `border-left` and `border-right` of `0`, and `box-shadow: none`

### Requirement: Host chip renders as a hanko seal
Wherever a host is labelled inline (cards, pane detail header, filter
bar), the host SHALL render as a compact rectangular seal with `--radius-sm`, a
`1px solid var(--ochre)` outline, no fill, and its glyph set in
`var(--font-mono)`.

#### Scenario: Card host chip
- **WHEN** a card renders its host
- **THEN** the host chip has an ochre outline, no background fill, and a monospace glyph

### Requirement: Terminal offers washi and sumi palettes
The existing global terminal theme selector SHALL include
`washi` (light) and `sumi` (dark) palettes tuned for the brand,
alongside the existing selectable themes. The existing `kanhrd.terminal-theme` preference SHALL remain global.
`auto` SHALL follow washi/sumi with the app theme; explicit existing
palettes SHALL remain selected. New palettes SHALL provide at least
4.5:1 contrast for default text and each normal/bright ANSI foreground
on the default background, with legible cursor and selection states.
Arbitrary application-supplied ANSI background/foreground combinations
are outside this guarantee.

#### Scenario: User selects washi
- **WHEN** a user selects the `washi` terminal theme in settings
- **THEN** xterm.js renders with background `#f4ede0`, foreground `#1a1815`, and the choice persists globally and applies to every terminal

### Requirement: Card renders in a compact single-row variant when density warrants it
The SPA SHALL render a compact card variant when the density setting
is `compact`, or when a status column contains more than 20 cards. The
compact variant SHALL contain a status dot, agent name, host hanko,
elapsed duration, a visible status cue independent of colour, and an
overflow trigger, on a single row. Below 900px compact is mandatory.
The title may truncate; the overflow trigger and status cue SHALL NOT.
The full name and location SHALL be available on keyboard focus and
through pane detail, not only through a hover tooltip.

#### Scenario: Dense lane collapses to compact cards
- **WHEN** a lane contains 25 cards under default density
- **THEN** every card in that lane renders in the single-row compact variant

### Requirement: Failure paths surface in the UI, not only in console
Every failed lifecycle action, bridge disconnect, and pane-read error
SHALL post a deduplicated toast and log diagnostic context. Editable
fields SHALL also show associated inline errors and retain entered
values. Connection notices SHALL persist by host id until reconnect;
repeated failures SHALL NOT create a toast storm. `console.warn` and
`console.error` MAY log the same failure for diagnostics but MUST NOT
be the sole user-visible signal.

#### Scenario: Pane split fails
- **WHEN** a call to `pane.split` returns an error
- **THEN** a toast appears with copy sourced from `copy.toast.splitFailed` and quoting the wire error message

### Requirement: Motion respects the reduced-motion preference
Animations SHALL honor the `prefers-reduced-motion: reduce` media
query. Non-essential transitions (route change, modal open, toast
enter/leave decoration) SHALL be disabled in the reduced-motion
branch, while status changes and focus rings remain instant and
visible.

#### Scenario: Reduced motion
- **WHEN** the browser reports `prefers-reduced-motion: reduce`
- **THEN** the modal open transition, toast slide, and route-change fade are removed, and status-dot colour changes update instantly


### Requirement: Board composition communicates attention before decoration
The board SHALL use unfilled status columns with hairline headings,
mono tabular counts, and stable column positions. Blocked SHALL receive
the strongest status emphasis, working the next; other statuses use
quiet labels and small indicators. Colour SHALL NOT fill whole columns
or create five equally prominent summary badges. Existing user status
visibility preferences SHALL remain effective.

The shell SHALL use the available viewport width. Column minimum width
SHALL be 260px; when columns do not fit, the board region SHALL scroll
horizontally instead of shrinking cards or overflowing the whole page.
Below 900px the rail becomes a drawer and columns use horizontal snap
scroll. Empty columns retain their horizontal slot and header; only
their empty body collapses. Settings and long explanatory copy SHALL
use a readable content width rather than stretching across the board.

#### Scenario: Small laptop
- **WHEN** the populated board renders at 1280×800 with the rail open
- **THEN** column headings and the first card row are visible without vertical scrolling, and horizontal overflow is confined to the board

#### Scenario: A column becomes empty
- **WHEN** the final card leaves a status column
- **THEN** its header and zero count remain in the same position, and neighbouring columns do not jump

### Requirement: Typography distinguishes identity from operational data
The SPA SHALL use Shippori Mincho for the wordmark and display headings,
Inter for repeated agent names and controls, and JetBrains Mono for ids,
durations and terminal output. Card titles SHALL use `--fs-lead` at
weight 500 in standard density and `--fs-body` in compact density.
Counts and durations SHALL use tabular numerals. No font size below
`--fs-caption` SHALL be introduced to make a dense layout fit.
Fonts SHALL be locally served with suitable fallbacks and `font-display:
swap`; missing font files SHALL NOT block the board. User-supplied
names, paths and quoted errors SHALL retain their original case.

#### Scenario: Long agent name
- **WHEN** a card contains a long agent name, path, and pen name
- **THEN** the title has the strongest text emphasis, metadata recedes, and neither text nor the host seal overlaps actions

### Requirement: Operational controls remain legible in every state
Chrome SHALL meet the documented text contrast targets in both themes,
including captions, enabled muted actions, selected controls, and
hover/pressed states. Essential control boundaries and focus indicators
SHALL have at least 3:1 contrast against adjacent surfaces. Brand accent
values MAY remain decorative, but separate semantic foreground and
focus tokens SHALL be introduced where the base palette fails.
Ochre buttons SHALL use a contrast-tested foreground, not automatically
`--ink-invert`. Disabled controls SHALL communicate their unavailable
state without being confused with loading. Selected scope SHALL use
text and an active marker in addition to colour.

#### Scenario: Muted action on paper
- **WHEN** an enabled card overflow action renders without hover in either theme
- **THEN** its icon remains discernible at 3:1 and its text label, if present, meets 4.5:1

### Requirement: Focus and terminal input survive navigation
Card opening and action buttons SHALL be separate semantic controls;
buttons SHALL NOT be nested inside a link. Overflow menus SHALL support
keyboard opening, arrow navigation, Escape dismissal, and focus return.
Dialogs and the mobile drawer SHALL contain focus, make background
content inert, and return focus to their trigger on close. Destructive
confirmations SHALL initially focus `keep` or `cancel` and state plainly
that closing terminates the affected session; care copy SHALL NOT imply
pause or undo.

Board arrow navigation SHALL use stable pane identity. Returning from
detail SHALL restore scope, horizontal/vertical scroll, and focus to
the originating card, or a predictable neighbour if it disappeared.
Unmodified Escape, question mark and arrow keys SHALL continue to reach
xterm while terminal input is focused; existing explicit app shortcuts
and a visible back control provide navigation from the terminal.

#### Scenario: Keyboard opens an overflow menu
- **WHEN** a user opens a card menu and dismisses it with Escape
- **THEN** focus returns to that card's overflow button without opening its pane

#### Scenario: Terminal receives input
- **WHEN** xterm has focus and the user types `?` or Escape
- **THEN** the terminal receives the keystroke and the app does not open help or leave the pane

### Requirement: Loading, absence, and disconnection are distinguishable
Initial board loading SHALL render static skeleton columns rather than
showing the no-pens state before discovery finishes. Pane detail SHALL
show `keeping watch…` until its first frame; failure replaces loading
with a visible retry/back path. Existing content SHALL remain visible
but clearly marked stale during reconnect, with affected actions gated
by availability. One failed pen SHALL NOT blank healthy pens.
No configured pens SHALL show setup instructions; a connected empty pen
SHALL offer creation only when supported. A filter/scope with no matches
SHALL show a clear-filter or clear-scope action. A missing scoped entity
SHALL show unavailable/not-found recovery, never silently show a previous
scope. The 404 SHALL offer a working board link.

#### Scenario: Filter hides all cards
- **WHEN** configured pens contain cards but the active filters match none
- **THEN** the board offers to clear filters and does not display setup instructions

### Requirement: Density and virtualization preserve interaction
Compact density SHALL activate above 20 cards per status column or by
user preference, and always below 900px. Virtualization SHALL activate
above 50 cards per column using the existing CDK dependency. Virtual
item size SHALL match the compact row including its gap; counts SHALL
represent the complete filtered collection. Focused items and open menu
anchors SHALL not silently disappear through recycling. No new per-card
terminal subscriptions SHALL be introduced for visual polish.

#### Scenario: Density boundaries
- **WHEN** a desktop column grows from 20 to 21 and then 50 to 51 cards
- **THEN** it first becomes compact, then virtualized, with no clipped rows, lost card identity, or inaccessible offscreen cards

### Requirement: Status columns do not imply manual status control
Status membership SHALL remain driven by herdr's reported agent status.
This redesign SHALL expose no drag handle, grab cursor, or drop target
on status columns. `pane.move` SHALL NOT be invoked to move a card from
working to done: its destination is a tab or workspace, not a status.
A future relocation flow requires separate destination, capability,
keyboard, error, and reconciliation requirements.

#### Scenario: User inspects a status card
- **WHEN** the pointer or keyboard focuses a card in any status column
- **THEN** the interface offers supported pane actions without implying that its status can be dragged or manually reassigned

### Requirement: Motion and feedback remain quiet under load
Status changes SHALL update immediately without waiting for animation.
At most one decorative animation SHALL run at a time; status emphasis
has priority over toast, modal and route effects. Repeated cards SHALL
NOT pulse or stagger into view. Loading MAY use one shared indicator;
reduced motion SHALL make it static. Desktop toasts SHALL share a
bottom-right stack and mobile toasts a top stack without obscuring the
active dialog controls. Reconnect SHALL remove the matching persistent
notice by id. Long-action progress SHALL use one updatable notice after
300ms, resolved on completion or failure.

#### Scenario: Several pens disconnect together
- **WHEN** several connection failures arrive while a modal is open
- **THEN** notices are deduplicated by pen, controls remain accessible, and decorative animations do not compete

### Requirement: Visual quality is validated with representative content
Implementation SHALL provide before/after captures for populated and
empty board, pane detail, settings, confirmation and mobile drawer in
both themes. Fixtures SHALL include long names, duplicate agent names
on different pens, blocked/unknown/stale states, and 15 pens with 40
panes each. Review SHALL cover 390×844, 899px and 900px breakpoint
boundaries, 1280×800, 1440×900, and 200% browser zoom. The first stable
shell/skeleton SHALL appear within one second in the documented local
production-build fixture run; this does not promise remote data arrival
within one second. Record browser, machine, fixture and timing method.

#### Scenario: Release review
- **WHEN** the redesign is proposed for merge
- **THEN** captures and recorded contrast checks demonstrate readable text, stable alignment, reachable controls, and both density modes; keyboard, capability and preference regression checks pass
