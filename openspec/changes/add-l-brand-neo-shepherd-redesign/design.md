# Neo-shepherd design review

## Direction

Keep the warm paper, ink hairlines, ochre crook, square host seals and
restrained serif. The combination has a recognizable identity and fits
a tool used for sustained observation. Express taste through alignment,
type roles, spacing and state hierarchy. Do not add grain, glass,
parallax, extra illustrations, or a new icon/font stack merely because
a generic redesign checklist recommends them.

## Audit and evidence

This review inspected the three draft design documents, the change
proposal/tasks/spec, package manifests, and current code through
CodeGraph. It did not inspect a running UI or claim visual validation.

- `apps/web/package.json` already includes Angular 20, Angular CDK,
  `@lucide/angular`, and xterm. The original spec names a different
  Lucide package unnecessarily.
- `state/terminal-theme.service.ts` explicitly applies one palette to
  every terminal and stores `kanhrd.terminal-theme`. Preserve that
  behavior rather than introducing the draft's per-pane model.
- `board/column.ts` explains that status membership is herdr-owned.
  `HerdrPaneMoveDestination` in the schema targets tabs/workspaces,
  not agent statuses. The UX drag requirement is semantically invalid.
- `board/column.ts` currently virtualizes above 20. The new spec makes
  the intended compact (>20) and virtualization (>50) thresholds
  distinct, including geometry and focus acceptance criteria.
- `board/card.ts` uses observed client time for elapsed status and only
  optionally has output snippets. The redesign must not fabricate
  server durations or fetch terminal output per card for decoration.
- `board/board.ts` currently resolves workspace ids across hosts and
  leaves the old scope when resolution fails. Require honest recovery
  for invalid scopes; host-id collision/routing redesign remains a
  separate contract decision, not an implicit promise of this reskin.

## Decisions and tradeoffs

The spec's reconciliation table is the implementation decision record.
Synchronize the source design documents before implementing it.

1. **Reserve serif for display.** Repeating it across hundreds of
   technical identifiers dilutes both hierarchy and scan speed. Inter
   is already the documented UI family; reuse it for agent titles.
2. **Disambiguate lane.** Preserve the brand's tab rename while calling
   board groupings status columns. Avoid introducing a second metaphor.
3. **Make care copy technically honest.** “let this one rest?” may
   soften the prompt, but the body must explain session termination.
   Never suggest a pause, recoverability, or an undo that does not exist.
4. **Separate colour roles.** Brand swatches are starting points.
   Cream text on ochre and muted ink on recessed/dark paper need
   measurement; enabled controls cannot inherit disabled contrast.
   Keep small ochre host outlines as an explicit brand exception to
   colour-free chrome, with readable ink names and bounded width.
5. **Preserve working space.** Use full board width and stable column
   slots. Constrain explanatory text, not the operational canvas.
6. **Prioritize reliability states.** A quiet interface still needs
   loading, stale, failed, empty and unavailable states that tell the
   truth. Existing content should survive a single pen disconnect.
7. **Protect terminal ownership of keys.** Global unmodified Escape
   and question mark would break terminal applications. Keep visible
   app navigation and the existing explicit shortcut mechanism.

## Delivery order

1. Synchronize document conflicts and establish semantic tokens/font roles.
2. Implement shell, one standard card, one compact card, and one status
   column in both themes; review representative captures before rollout.
3. Apply the approved primitives to rail, detail, settings and dialogs.
4. Complete focus, capability, failure, density and persistence checks.
5. Record the spec's screenshot matrix and contrast/timing evidence.

No screenshot, contrast report or performance result is supplied by this
specification-only revision. Those are explicit implementation gates.
