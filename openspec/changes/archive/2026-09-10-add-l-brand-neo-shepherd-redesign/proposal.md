## Why

kanhrd has shipped its functional tiers (kanban, terminal, lifecycle)
plus L-UX and L-UX2 polish, but it still reads as a generic dark
devtool. An experience-first review of the SPA surfaced several
compounding issues: no design tokens (raw hex, ad-hoc `rem` sizes, HTML
entity glyphs), no brand identity (`<title>Web</title>`, placeholder
favicon, no wordmark treatment), a neutral engineering voice that
misses the herding metaphor herdr already owns, and interaction
patterns (hover-only affordances, prose confirmations, five equal
status colours) that don't scale past a demo board.

This lane redesigns kanhrd around a **neo-shepherd** identity — herdr's
herding metaphor married to a Japanese-shepherd register (paper-cream
washi surfaces, ochre and vermilion accents, serif wordmark with a
brushstroke crook, hanko host chips, torii-framed modals). Voice
softens on empty/error surfaces with care verbs, stays clinical on data
readouts. The design system introduces a single token layer that every
component consumes, replacing raw values.

No bridge or wire-contract changes. This is entirely client-side
presentation, plus documentation.

## What Changes

- **Docs.** Add `docs/BRAND.md`, `docs/DESIGN-SYSTEM.md`, and
  `docs/UX-GUIDELINES.md` as the source of truth for identity, tokens,
  and interaction patterns.
- **Token layer.** `apps/web/src/styles.scss` becomes tokens + resets
  only. Move raw hex, radii, spacing, font-size ladder, and motion
  timing into CSS custom properties defined at `:root` and overridden
  on `[data-theme="dark"]`. Add `apps/web/src/app/shared/tokens.scss`
  and `typography.scss`; components import tokens, never raw values.
- **Palette.** Light theme becomes **primary** with paper-cream surface
  (`#f4ede0`), sumi ink text, ochre accent (`#c8842a`), vermilion
  (`#b6412a`) for blocked, matcha (`#6b7d4a`) for done, indigo aizome
  (`#2f4a6b`) for idle, stone (`#8a8578`) for unknown. Dark mode
  becomes separately tuned sumi (`#161311`) rather than a straight
  inversion of the current dark palette.
- **Typography.** Serif display face (Shippori Mincho / Rozha One) for
  wordmark, empty-state headlines, and modal titles and column headings. Inter for UI and repeated card titles.
  JetBrains Mono for terminal + data ids and durations. Fixed `rem`
  scale replaces per-component sizes.
- **Icon set.** Standardize the existing `@lucide/angular` usage. Replace HTML entity glyphs
  (`✎ × ⟶ ☾ ☀ ⚙ ☰`) with lucide components across `app.html`,
  `board`, `rail`, `card`, `pane-detail`, `settings`, `shared/*`.
- **Wordmark.** Set `kanhrd` in the display serif, lowercase. Ochre
  brushstroke crook glyph above the `n` (SVG asset in
  `apps/web/public/mark/crook.svg`). Update `apps/web/index.html`
  `<title>` to `kanhrd — a shepherd's console`. Replace favicon with
  the crook alone in ochre on cream (and a dark variant).
- **Voice.** Add `apps/web/src/app/shared/copy.ts` collecting all
  lifecycle, empty-state, error, and toast strings. Rewrite them with
  care verbs per `BRAND.md` ("no pens yet. point one here:", "let this
  one rest?", "lost sight of `host-a`. retrying.", etc.). Data
  readouts and filter chips stay unchanged.
- **Card treatment.** Redraw the agent card: hairline border replaces
  shadows; status dot in `--status-*` token; title in UI sans;
  meta row in mono; actions **always visible** at verified accessible muted contrast or via
  an overflow menu (lucide `more-horizontal`) — the hover-opacity
  pattern is removed. Compact variant is a single row.
- **Lane treatment.** Signboard header — hairline `--rule-strong` under
  a display-serif title with a mono count on the right, no background
  fill. Empty lanes collapse to a single hairline row with count `0`;
  the "No panes" prose is removed.
- **Host chip → hanko.** Compact rectangular seal, `--radius-sm`, `1px solid --ochre`,
  mono glyph. Never filled.
- **Modal → torii.** Top and bottom `--rule-strong`, no side borders,
  no radius, `--paper-raised` fill.
- **Cascading confirm as a preview.** `ConfirmModal` renders a list of
  what will close (workspaces, tabs, panes) instead of prose, per
  `UX-GUIDELINES.md`.
- **Domain rename in copy.** `host → pen`, `workspace → field`,
  `tab → lane`, `pane → card` (on the board only). Applied in
  user-facing copy strings; wire protocol, code identifiers, and error
  messages that quote wire responses stay in herdr's terms.
- **Anti-patterns codified.** UX-GUIDELINES.md forbids raw hex in
  components, hover-only actions, `console.warn`-only error paths,
  emoji in chrome, and exclamation marks. A pre-commit lint rule
  (existing precommit-lint-gate lane) grows to flag raw hex in `*.scss`
  outside the token files.
- **Terminal themes.** Add two brand-aligned xterm.js palettes —
  **Washi** (light) and **Sumi** (dark) — as selectable themes
  alongside the existing themes shipped in L-UX2.

## Impact

- Affected code: `apps/web/src/styles.scss`, `apps/web/index.html`,
  `apps/web/public/`, `apps/web/src/app/app.{html,scss,ts}`,
  `apps/web/src/app/board/**`, `apps/web/src/app/rail/**`,
  `apps/web/src/app/pane-detail/**`, `apps/web/src/app/settings/**`,
  `apps/web/src/app/shared/**`, `apps/web/src/app/state/terminal-theme.service.ts`.
- New files: `apps/web/src/app/shared/tokens.scss`,
  `apps/web/src/app/shared/typography.scss`,
  `apps/web/src/app/shared/copy.ts`,
  `apps/web/src/app/shared/icons.ts`, `apps/web/public/mark/crook.svg`,
  `apps/web/public/favicon.svg` (replaces `favicon.ico`), and the three
  new docs.
- Reuse installed `@lucide/angular` and Angular CDK. No new production dependencies.
- No bridge changes. No wire-protocol changes. No new capability flags.
- No user data migration; `localStorage['kanhrd.theme']` and
  `kanhrd.settings` keys stay compatible. First light-theme visitors
  see the new washi surface immediately; dark-theme visitors see the
  new sumi surface.
- Existing tests keep passing; new tests cover copy source-of-truth,
  token-only styles, and always-visible affordances.


## Refinement of the proposed direction

The revised requirement spec and `design.md` resolve conflicts in the
initial design documents. Repeated agent titles use Inter; serif remains
on display surfaces. Board groupings are status columns, while tabs keep
the UI name lane. Terminal palettes remain global. Status drag-and-drop
is excluded because pane.move relocates panes and cannot set status.
The implementation includes document synchronization, accessible colour
roles, stable responsive composition, focus restoration, complete state
handling, and representative visual review. These decisions supersede
the corresponding original draft details; no application changes have
yet been made by this review.
