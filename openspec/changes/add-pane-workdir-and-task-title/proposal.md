## Why

A card today shows the agent name, `field / lane`, a status word and an
elapsed time. That is not enough to tell two cards apart. Ten Claude
Code cards named `claude` across three checkouts are indistinguishable,
and the one fact that actually separates them — **which directory the
agent is working in** — is discarded by the bridge even though herdr
sends it on every `pane.list` response.

Two identity layers are missing:

1. **Where** the agent is working. herdr's `PaneInfo` carries `cwd` and
   `foreground_cwd`; the bridge's trimmed projection drops both, so the
   board cannot show a location and the user cannot tell a checkout from
   its worktree.
2. **What** the agent is working on. herdr's `label` / `title` are
   herdr's own facts (a shell name, an agent-reported title) and change
   under the user's feet. There is no place for a human sentence like
   `fix the subscription backlog storm` that survives an agent restart
   and belongs to the operator, not to herdr.

Both are cheap. Neither requires a new bridge subsystem.

## What Changes

### Subfeature 1 — pane working directory (wire-visible)

- `packages/schema` models the two `PaneInfo` fields the bridge already
  receives and throws away: `cwd` and `foreground_cwd`.
- The bridge-projected `Pane` gains one optional field, `cwd`, resolved
  as `cwd ?? foreground_cwd` — the same "prefer the display value, fall
  back to the raw one" precedence `projectPane` already uses for
  `display_agent ?? agent`.
- The card renders the workdir as a compact monospace location line; the
  pane-detail header renders the full absolute path.
- No new bridge state, no new herdr call, no new capability flag. A host
  running a herdr too old to send `cwd` simply yields no field and the
  card renders no location line.

### Subfeature 2 — user-defined task title (client-only)

- A new per-device store, `localStorage['kanhrd.task-titles']`, holds an
  operator-authored task title per `(pen, card)` pair.
- herdr's own label / title / agent name is **never written to and never
  replaced**. When a task title exists it becomes the card's primary
  title and herdr's name drops to the meta row in `--ink-mute`; both stay
  visible, so the two layers can disagree without either being lost.
- The rename entry point is a visible overflow-menu item on the card and
  a visible control in the pane-detail header — never a hover-only
  pencil.
- Card titles stay `--font-ui` at weight `500` per
  `docs/DESIGN-SYSTEM.md` § Typography. The display serif does not land
  on a repeated per-card identifier.

## Impact

- `packages/schema/src/herdr.ts` — `HerdrPaneInfo` gains `cwd` and
  `foreground_cwd`; `Pane` gains `cwd`.
- `apps/bridge/src/herdr/project.ts` — `projectPane` resolves and
  forwards `cwd`.
- `apps/web/src/app/board/card.ts` / `card.html` / `card.scss` — location
  line, title resolution, overflow-menu rename item.
- `apps/web/src/app/pane-detail/**` — full path in the header, rename
  control.
- New: `apps/web/src/app/state/task-title.service.ts` and a rename
  modal component.
- `apps/web/src/app/shared/copy.ts` — new copy keys (the seam introduced
  by `add-l-brand-neo-shepherd-redesign`).
- Depends on `add-l-brand-neo-shepherd-redesign` for the card's overflow
  menu, compact density and copy seam. Subfeature 1 is independent of
  that change and can land first.

## Non-goals

- **No bridge-side persistence.** The bridge stays stateless; task
  titles are not stored server-side, so they do not follow the operator
  to a second browser or device. See `design.md` for the migration path
  if that becomes a requirement.
- **No writes to herdr.** `pane.rename` and `pane.report_metadata` are
  not called. herdr's label stays herdr's; the agent-authority metadata
  channel stays the agents'.
- **No filtering, searching, sorting or grouping** by workdir or task
  title. Follow-on.
- **No project inference.** No git repo detection, no repo-name
  derivation, no `~` collapsing, no monorepo-package guessing. The
  workdir is displayed as herdr reports it.
- **No new capability flag.** Absence of `cwd` on a pane is the signal;
  a per-host feature gate is not introduced for one optional string.
- **No status-column, drag or lifecycle change.** Status membership
  remains herdr's fact.
