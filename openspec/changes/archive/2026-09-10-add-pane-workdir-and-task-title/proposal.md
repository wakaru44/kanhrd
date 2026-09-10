## Why

A card today shows the agent name, `field / lane`, a status word and an
elapsed time. Ten `claude` cards across three checkouts are
indistinguishable, and there is no way to say what any of them is
working on.

The first framing of this change assumed both fixes needed new
plumbing: a per-pane `cwd` field and a per-pane task title in browser
storage. Investigation of the installed herdr 0.8.2 says otherwise.
**Almost everything this feature wants already exists in herdr and is
already arriving on the bridge's existing calls — the bridge throws it
away.**

Three facts drive the reframe:

1. **herdr has a first-class, user-authored pane rename.**
   `herdr pane rename <pane_id> <label>|--clear` — `PaneRenameParams` is
   `{ pane_id, label?: string | null }`, only `pane_id` required. It is
   persistent, cross-device, survives restarts and broadcasts on a
   requestable `Subscription::PaneUpdated`. The user's ask — "an easy way
   of renaming the panels in a task-based fashion" — is a herdr feature
   we are not exposing.
2. **The bridge already receives the pane's `label` and drops it.**
   `pane.list` returns whole `PaneInfo` objects;
   `apps/bridge/src/herdr/project.ts:20-31` builds `Pane` from a fixed
   field list that omits `label`. Rename a pane in herdr today and the
   card does not change.
3. **Project identity already exists at workspace level.**
   `WorkspaceInfo.worktree` is
   `{ repo_key, repo_name, repo_root, checkout_path, is_linked_worktree }`
   — structured git provenance, already returned by the `workspace.list`
   call the bridge makes on every connect, and already discarded by a
   name cache that keeps only `workspace_id → label`.

So the feature is mostly a rendering and projection job, not a storage
job. No new browser storage, no new bridge state, no new herdr calls
beyond one rename write and one subscription kind.

## What Changes

### Layer 1 — render the identity herdr already sends

- `Pane` gains `label?: string` (herdr's user-authored pane name) and
  `project?: { repo_name, checkout_path, is_linked_worktree }` (from the
  owning workspace's `worktree`).
- `projectPane` forwards `label`; the workspace name cache widens from
  `Map<id, string>` to `Map<id, { label, worktree? }>` so the join can
  reach `worktree`. Both values already arrive on existing calls.
- The card's title becomes `label ?? display_agent ?? agent ?? title ??
  pane-id prefix`. When `label` wins, the agent identity drops to the
  meta row in `--ink-mute` so neither is lost.
- The card renders the project as `repo_name`, with `checkout_path`
  truncated beside `field / lane`. Pane detail shows the full path.
- `Pane.title` needs no plumbing — it is already projected. It is herdr's
  display-only metadata slot, written by user hooks or agent
  integrations via `pane.report_metadata`, and today the card only falls
  back to it when a pane has no agent at all. Its precedence is stated
  rather than changed.

### Layer 2 — expose herdr's native rename on the card

- New wire method `pane.rename` (`{ pane_id, label?: string | null }`),
  a `paneRename` capability flag, bridge dispatch, and a
  `Subscription::PaneUpdated` subscription so a rename made anywhere —
  our board, herdr's TUI, another client — reaches every board.
- The rename entry point is a visible card overflow-menu item, mirroring
  the rail's existing field/lane rename. `label: null` clears.
- `tab.rename` and `workspace.rename` need **no work**: they are already
  plumbed end to end (wire method, `tabCrud` / `workspaceCrud`
  capability, dispatch, store event handling, inline rail rename, and a
  `rename-tab` keyboard shortcut). Naming a task at lane or field level
  is a shipped feature; only the card level was missing.

### Layer 3 — our own storage: not needed, and dropped

The original per-pane `localStorage['kanhrd.task-titles']` layer is
**obsolete** and is not part of this change. herdr's `pane.rename`
delivers the same capability with better properties: shared across
devices, durable, event-broadcast, and visible in herdr's own sidebar
next to the operator's other names. `design.md` records it as the
rejected fallback and the one condition that would revive it.

## Impact

- `packages/schema/src/herdr.ts` — `HerdrPaneInfo` gains `label` in the
  projection's consumed set; add `HerdrPaneRenameParams`; `Pane` gains
  `label` and `project`; `HerdrWorkspaceDetail.tokens` corrected to
  optional.
- `packages/schema/src/wire.ts` — `pane.rename` method, params, result;
  `paneRename` capability; `pane.updated` event payload.
- `apps/bridge/src/herdr/names.ts` — cache value widens to carry
  `worktree`; new `workspaceWorktree(id)` accessor.
- `apps/bridge/src/herdr/project.ts` — forward `label`, join `project`.
- `apps/bridge/src/herdr/hosts.ts` — `paneRename` method,
  `pane.updated` in the subscription spec set and event handler.
- `apps/bridge/src/ws/dispatch.ts` — `pane.rename` case, capability.
- `apps/web/src/app/board/card.*` — title precedence, project line,
  overflow rename item.
- `apps/web/src/app/pane-detail/**` — full checkout path, rename control.
- `apps/web/src/app/shared/copy.ts` — rename copy keys.
- Depends on `add-l-brand-neo-shepherd-redesign` for the card overflow
  menu and the `copy.ts` seam. Layer 1 does not.

## Non-goals

- **No new browser storage.** No `kanhrd.*` key is added.
- **No new bridge state.** The bridge stays stateless; identity stays
  herdr's.
- **No per-pane `cwd`.** herdr does expose `PaneInfo.cwd` and
  `foreground_cwd` (evidence in `design.md`), but workspace
  `worktree.checkout_path` covers "which project, where" for the common
  one-workspace-per-checkout case. Deferred to a follow-on, which
  matters only when panes in one workspace sit in different directories
  (reachable via `pane.split --cwd`).
- **No use of herdr's `tokens` metadata bag.** It is writable and
  general-purpose (`design.md`), but `pane.rename` is the purpose-built
  surface and `tokens` is display-only with a 24h TTL ceiling.
- **No writes to `pane.report_metadata`.** `title`, `display_agent` and
  `state_labels` stay read-only facts owned by hooks and integrations.
- **No `terminal_title` rendering.** herdr's OSC-derived terminal title
  is a separate field we do not model; adding it is not in scope.
- **No filtering, searching, sorting or grouping** by name or project.
- **No git inference of our own.** No repo detection, no `~`
  collapsing, no monorepo-package guessing.
- **No status-column, drag or lifecycle change.**
