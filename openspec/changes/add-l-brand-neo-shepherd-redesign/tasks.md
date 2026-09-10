## 1. Design system docs

- [x] 1.1 `docs/BRAND.md` — identity, wordmark, palette summary, voice
      table, mascot policy, motifs, vocabulary rename
- [x] 1.2 `docs/DESIGN-SYSTEM.md` — full token list (colour,
      typography, spacing, radii, elevation, motion, icons), component
      specs, migration map, accessibility rules
- [x] 1.3 `docs/UX-GUIDELINES.md` — core loop, density rules,
      interaction principles, empty-state patterns, motion budget,
      mobile, anti-patterns
- [x] 1.4 Link the three docs from `docs/CONTEXT.md` and `README.md`

## 2. Token layer

- [ ] 2.1 `apps/web/src/app/shared/tokens.scss` — CSS custom properties
      for colour (light + dark), spacing, radii, motion, icon sizes
- [ ] 2.2 `apps/web/src/app/shared/typography.scss` — `@font-face` for
      Shippori Mincho, Inter, JetBrains Mono; fs-scale
      helpers
- [ ] 2.3 Rewrite `apps/web/src/styles.scss` to import tokens +
      typography and hold only resets + document defaults
- [ ] 2.4 Add `.scss` lint rule (extend precommit-lint-gate) that
      forbids raw hex outside `tokens.scss` and raw non-tokenized
      `rem` values outside `typography.scss`

## 3. Palette and theming

- [ ] 3.1 Light theme (default) uses washi paper `#f4ede0` +
      sumi ink `#1a1815` + ochre `#c8842a` per `DESIGN-SYSTEM.md`
- [ ] 3.2 Dark theme uses sumi `#161311` + lifted ink, separately
      tuned (not an inversion)
- [ ] 3.3 `ThemeService` default changes: when no valid `kanhrd.theme` is
      stored, use sumi if the OS prefers dark, otherwise washi
- [ ] 3.4 Status → token mapping: `--status-working|blocked|done|idle|unknown`
- [ ] 3.5 Terminal themes: add **Washi** and **Sumi** to
      `apps/web/src/app/state/terminal-theme.service.ts`, both WCAG-AA
      compliant on 16px

## 4. Wordmark and marks

- [ ] 4.1 Add `apps/web/public/mark/crook.svg` (ochre brushstroke crook)
- [ ] 4.2 Add `apps/web/public/favicon.svg` (crook on cream) and a
      dark-mode variant; retire `favicon.ico`
- [ ] 4.3 Update `apps/web/index.html` `<title>` to
      `kanhrd — a shepherd's console` and reference the new favicons
- [ ] 4.4 `app.html` wordmark: display-serif `kanhrd`, crook glyph
      over the `n`; remove hover underline and letterspacing hack
      in `app.scss`

## 5. Icon set

- [ ] 5.1 Reuse the installed `@lucide/angular` dependency; do not install `lucide-angular`
- [ ] 5.2 `apps/web/src/app/shared/icons.ts` re-exports the icons the
      app uses (menu, sun, moon, settings, plus, chevron-right, x,
      edit-3, more-horizontal, dot, alert-triangle, check)
- [ ] 5.3 Replace every HTML entity glyph in templates: `app.html`,
      `board/*.html`, `rail/*.html`, `pane-detail/*.html`,
      `settings/*.html`, `shared/*.html`, `card/*.html`,
      `filter-bar/*.html`

## 6. Voice source of truth

- [ ] 6.1 `apps/web/src/app/shared/copy.ts` — export string constants
      for empty states, lifecycle confirms, error toasts,
      disconnect/reconnect toasts, 404, and the setup snippet
- [ ] 6.2 Rewrite copy per `BRAND.md` care-verb table (`no pens yet`,
      `let this one rest?`, `lost sight of X. retrying.`, etc.)
- [ ] 6.3 Replace inline lifecycle/empty/error strings in templates
      with references to `copy.ts`
- [ ] 6.4 Apply the vocabulary rename (`pen`, `field`, `lane`,
      `card`) in `copy.ts` and in filter-bar / rail chip labels;
      keep herdr wire terms in code + error responses

## 7. Card redesign

- [ ] 7.1 `card.scss` uses `--paper-sunk`, `--elev-1`, no
      `box-shadow`; hover raises to `--elev-2`
- [ ] 7.2 Status dot uses `--status-*`; title in `--font-ui`;
      meta row in `--font-mono`
- [ ] 7.3 Actions always visible (verified accessible muted contrast) OR routed through an
      overflow menu (lucide `more-horizontal`); remove hover-only
      opacity reveals
- [ ] 7.4 Compact card variant (one row) activates when
      `density = compact`, a status column has > 20 cards, or viewport < 900px
- [ ] 7.5 Host chip → hanko (`hanko.scss` in `shared/`): square,
      ochre outline, mono glyph, no fill

## 8. Lane redesign

- [ ] 8.1 `column.html/scss` header: hairline under display-serif
      title, mono count on the right, no bg fill
- [ ] 8.2 Empty lane collapses to a single hairline row (title +
      count `0`); remove "No panes" prose

## 9. Modal + confirm

- [ ] 9.1 `confirm-modal.scss` uses actual tokenized top/bottom borders (torii),
      no side borders, no radius, `--paper-raised` fill
- [ ] 9.2 `ConfirmModal` accepts a `preview: { kind, name, count }[]`
      input and renders it as a list under the prompt for cascading
      closes; single-item confirms omit the list
- [ ] 9.3 Primary button label uses the care vocabulary
      (`rest`/`close`); primary style is ochre. Destructive-red
      reserved for irrecoverable data loss (clear local data)

## 10. Rail treatment

- [ ] 10.1 Remove hover-only pencil/close; add overflow menu to each
      row (lucide `more-horizontal`)
- [ ] 10.2 Scope pill uses `--radius-pill` (the sole pill in the
      system), ochre dot for active scope, lucide `x` clear action

## 11. Board layout

- [ ] 11.1 Lanes remain side-by-side with `min-width: 260px` on wide
      viewports; horizontal overflow stays inside the board; snap-scroll below 900px
- [ ] 11.2 Board initial skeleton: hairline lane titles + 3
      placeholder cards each; no spinner over the wordmark

## 12. Pane detail

- [ ] 12.1 Collapse the redundant meta rows in `pane-detail.html`
      into one: back link + UI-sans title + hanko host chip +
      mono pane id + "keeping watch…" caption (until first frame)
- [ ] 12.2 Loading state: centered ochre dot pulse + "keeping
      watch…" copy; honors `prefers-reduced-motion`

## 13. Accessibility

- [ ] 13.1 Verify every foreground/background pair in both themes at
      16px meets WCAG AA (4.5:1 body, 3:1 large display) — record
      measured text/control pairs and ANSI-on-default-background checks
- [ ] 13.2 `:focus-visible` ring uses `--focus-ring` at `2px` offset
      on every interactive; never remove
- [ ] 13.3 Touch targets ≥ 40×40 in the < 900px viewport

## 14. Tests

- [ ] 14.1 Verify rendered lifecycle/error copy preserves user names and wire
      errors verbatim; verify visible non-colour status identification
- [ ] 14.2 Component test: card exposes actions without a hover
      simulation (overflow trigger is visible on initial render; opening it exposes
      capability-supported actions)
- [ ] 14.3 Component test: cascading `ConfirmModal` renders a
      preview list when `preview.length > 0` and no list otherwise
- [ ] 14.4 Style-lint test: no raw hex outside `tokens.scss`; no HTML
      entity glyph in templates
- [ ] 14.5 Playwright: empty state renders sample config + start
      command; open a scoped URL, confirm scope pill and clear action

## 15. Migration and cutover

- [ ] 15.1 `ThemeService` migration: existing `kanhrd.theme = 'light'`
      users land on washi; `kanhrd.theme = 'dark'` users land on
      sumi; missing key follows OS `prefers-color-scheme` (default
      light on absence of signal)
- [ ] 15.2 `kanhrd.settings` `density` key preserved; no data loss
- [ ] 15.3 Screenshot review: capture before/after of board (empty +
      populated), pane detail, settings, mobile drawer under both
      themes; attach to the PR description

## 16. Documentation and release notes

- [ ] 16.1 Update `docs/CONTEXT.md` glossary with the pen/field/lane
      copy-layer rename (with the caveat that code and wire keep the
      herdr terms)
- [ ] 16.2 Update `README.md` architecture section to reference the
      three new design docs
- [ ] 16.3 Prepare a release note entry for the next preview build
      calling out the new default theme

## 17. Spec reconciliation and interaction quality

- [ ] 17.1 Synchronize the three design docs with the reconciliation table
      in the revised spec before UI implementation; use `status column`
      for board groupings and `lane` only for tabs
- [ ] 17.2 Preserve global terminal theme storage and existing selections;
      map auto to washi/sumi, with no per-pane preference migration
- [ ] 17.3 Add contrast-safe semantic foreground/focus tokens; verify
      enabled muted controls, button states and both themes
- [ ] 17.4 Implement board/card hierarchy and stable empty column slots;
      verify long names and accessible truncation
- [ ] 17.5 Virtualize above 50 cards with matching compact row geometry;
      test 20/21 and 50/51 boundaries and keyboard focus recycling
- [ ] 17.6 Add keyboard/menu/dialog/drawer focus behavior and board return
      restoration; preserve raw terminal Escape, arrows and question mark
- [ ] 17.7 Distinguish loading, no pens, no matches, stale data and invalid
      scope; add recovery and capability-aware creation paths
- [ ] 17.8 Deduplicate error/progress/connection notices; one desktop
      bottom-right stack, mobile top stack; reconnect removes by id
- [ ] 17.9 Hide status drag affordances; do not map status changes to
      pane.move. Relocation is outside this change
- [ ] 17.10 Capture the spec's viewport/state matrix and 600-pane fixture;
      record local first-shell timing, contrast and keyboard checks
- [ ] 17.11 Make closing consequences explicit; initial confirm focus on
      keep/cancel; preserve entered text on failed edits
- [ ] 17.12 Local font assets with swap/fallbacks; structural CSS values
      and documented breakpoints are exempt from design-token linting

## 18. Archive

- [ ] 18.1 `openspec validate add-l-brand-neo-shepherd-redesign --strict`
- [ ] 18.2 `openspec archive add-l-brand-neo-shepherd-redesign --yes`
      after the change lands on master
