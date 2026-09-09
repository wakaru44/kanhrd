# tier-3-lifecycle Specification

## Purpose
Lets a user create/split/close panes and create/rename/close tabs and
workspaces directly from the browser, extending the tier-1 kanban board and
tier-2 terminal detail view into a lifecycle-management surface. Extends the
tier-1/tier-2 bridge envelope; does not replace or modify it.
## Requirements
### Requirement: Bridge advertises tier-3 capability per operation group
The bridge SHALL report `bridge.capabilities.tier` as `3` when it
implements any tier-3 method, and SHALL report five independent booleans —
`paneCreate`, `paneClose`, `paneMove`, `tabCrud`, `workspaceCrud` — each
`true` only when every method in that group can succeed. A bridge MAY
report `tier: 3` with some of these `false` (partial tier-3 support); the
SPA SHALL gate each lifecycle UI action on its own flag, not on `tier`
alone.

#### Scenario: Partial tier-3 bridge is honest about what it supports
- **WHEN** a bridge has implemented pane split/close but not tab or workspace CRUD
- **THEN** `bridge.capabilities` reports `{ tier: 3, paneCreate: true, paneClose: true, paneMove: false, tabCrud: false, workspaceCrud: false, ... }` and the SPA shows pane split/close controls while hiding tab/workspace create/rename/close controls

#### Scenario: Tier-1/tier-2 SPA against a tier-3 bridge sees no behavior change
- **WHEN** a tier-1 or tier-2 SPA calls its existing methods against a tier-3 bridge
- **THEN** it receives responses and events in the exact tier-1/tier-2 shapes, with no new required fields and no rejected requests

### Requirement: Pane split, close, and move
The bridge SHALL expose `pane.split` (`{ workspace_id?, target_pane_id?,
direction: "right"|"down", ratio?, cwd?, focus?, env? }` → `{ pane }`),
`pane.close` (`{ pane_id }` → `{}`), and `pane.move` (`{ pane_id,
destination, focus? }` → `{ changed, reason?, pane, previous_workspace_id,
previous_tab_id, created_workspace?, created_tab?, closed_workspace_id?,
closed_tab_id? }`), forwarding to herdr's `Method::PaneSplit`/`PaneClose`/
`PaneMove` unchanged in meaning. `destination` SHALL be herdr's
`PaneMoveDestination` union verbatim (`{ type: "tab", tab_id, ... } |
{ type: "new_tab", ... } | { type: "new_workspace", ... }`).

#### Scenario: Splitting a pane returns the new pane
- **WHEN** the browser calls `pane.split` with `{ target_pane_id, direction: "right" }`
- **THEN** the bridge forwards it to herdr as `Method::PaneSplit` and returns `{ pane }` describing the newly created pane

#### Scenario: Moving the last pane in a tab surfaces the cascade
- **WHEN** the browser calls `pane.move` on a pane that is the only pane in its tab, with a `destination` targeting a different workspace
- **THEN** the result includes `closed_tab_id` (and `closed_workspace_id` if that was also the workspace's last tab), reflecting that herdr tore down the now-empty tab/workspace as a side effect of the move

### Requirement: Tab create, rename, close, and move
The bridge SHALL expose `tab.create` (`{ workspace_id?, cwd?, focus?,
label?, env? }` → `{ tab, pane }`), `tab.rename` (`{ tab_id, label }` →
`{ tab }`), `tab.close` (`{ tab_id }` → `{}`), and `tab.move` (`{ tab_id,
insert_index }` → `{ tabs }`, the whole reordered tab list for that
workspace), forwarding to herdr's matching `Method::Tab*` unchanged.

#### Scenario: Renaming a tab updates the bridge's name cache immediately
- **WHEN** the browser calls `tab.rename` with `{ tab_id, label: "build" }`
- **THEN** the bridge forwards it to herdr, returns `{ tab }` with the new label, and updates its own workspace/tab name cache for that `tab_id` without waiting for a separate `workspace.list`/`tab.list` refetch

### Requirement: Workspace create, rename, and close
The bridge SHALL expose `workspace.create` (`{ source_workspace_id?, cwd?,
focus?, label?, env? }` → `{ workspace, tab, pane }`), `workspace.rename`
(`{ workspace_id, label }` → `{ workspace }`), and `workspace.close`
(`{ workspace_id, close_group? }` → `{}`), forwarding to herdr's matching
`Method::Workspace*` unchanged. `close_group` SHALL be forwarded verbatim
and SHALL NOT be reinterpreted as a generic destructive-action confirmation
flag — it controls only whether herdr closes an entire linked-worktree
workspace group at once.

#### Scenario: Closing one member of a linked-worktree group without close_group is rejected
- **WHEN** the browser calls `workspace.close` with `{ workspace_id }` (no `close_group`) for a workspace that shares a linked git worktree with another open workspace
- **THEN** the bridge returns `{ ok: false, error: { code: "workspace_group_close_required", ... } }` rather than closing anything, and the SPA presents this as a distinct "close N linked workspaces?" prompt, not the generic destructive-op confirmation

#### Scenario: Closing the last remaining workspace is not blocked at the wire level
- **WHEN** the browser calls `workspace.close` for the only open workspace on a host
- **THEN** the bridge forwards the call and it succeeds, leaving that host with zero open workspaces; the wire contract does not add a guard herdr itself lacks — client-side UI is responsible for warning or blocking this case before the call is made

### Requirement: Tier-3 lifecycle events mirror herdr's native subscriptions without synthesis
The bridge SHALL subscribe to and forward herdr's `workspace.created`,
`workspace.closed`, `workspace.renamed`, `tab.created`, `tab.closed`,
`tab.renamed`, `tab.moved`, and `pane.moved` events, each mapping directly
onto an existing herdr `EventKind`/`Subscription` pair with no bridge-side
polling or synthesis (unlike tier-2's `pane.output`).

#### Scenario: Cascading close emits only the directly-closed resource's event
- **WHEN** a `tab.close` call closes a tab that was the last tab in its workspace
- **THEN** the bridge forwards exactly `tab.closed` (for the closed tab) followed by `workspace.closed` (for the cascaded workspace), with no `pane.closed` events for any panes that were inside that tab

#### Scenario: Clients purge cascaded children locally
- **WHEN** a client receives a `workspace.closed` event for a workspace it had cached tabs and panes for
- **THEN** the client (bridge cache and/or SPA local state) purges every cached tab and pane it associated with that `workspace_id`, without waiting for `tab.closed`/`pane.closed` events that cascading closes do not guarantee to send

### Requirement: Bridge keeps the workspace/tab name cache warm on lifecycle events
The bridge's workspace/tab name cache (used to resolve `Pane.workspace.name`/
`Pane.tab.name` for tier-1 kanban cards) SHALL be updated in place on
`workspace.created`/`tab.created`/`workspace.renamed`/`tab.renamed`, and
purged (including cascaded children per the cascading-close requirement
above) on `workspace.closed`/`tab.closed`, without requiring a full
`workspace.list`/`tab.list` refetch. This closes the tier-1 cache staleness
gap accepted by LC2 (renames previously left the cache stale indefinitely).

#### Scenario: A tier-1 kanban card reflects a rename made through tier-3
- **WHEN** a workspace is renamed via `workspace.rename` (or by any other herdr client on the same host)
- **THEN** subsequent `pane.list`-derived kanban cards for panes in that workspace show the new name without the bridge needing a full `workspace.list` refetch

### Requirement: Known protocol quirks are documented for client implementers
The spec SHALL record the herdr protocol quirks discovered while building
tier-3, so that later work (bridge changes, additional clients, tier-4
planning) does not silently re-derive or contradict them. This is a
documentation-of-record requirement, not new bridge behavior.

#### Scenario: `pane.move` is not the same shape of operation as `tab.move`/`workspace.move`
- **WHEN** a client author assumes `pane.move`, `tab.move`, and `workspace.move` are parallel reorder operations because of the shared verb
- **THEN** they SHALL instead treat `pane.move` as a reparenting operation that can itself create or close a tab/workspace as a side effect, while `tab.move`/`workspace.move` are plain linear reorders by `insert_index`; `workspace.move`/`workspace.move_block` exist in herdr but are intentionally not exposed by this tier

#### Scenario: There is no `pane.kill`
- **WHEN** a client author looks for a separate "force kill" method for a pane
- **THEN** they SHALL use `pane.close` uniformly — herdr has no distinct kill method, only `Method::PaneClose`

#### Scenario: `pane.split`'s direction type is not herdr's four-way `PaneDirection`
- **WHEN** a client author wires up `pane.split`'s `direction` field
- **THEN** they SHALL use the two-variant `"right" | "down"` type only; herdr's four-way `Left/Right/Up/Down` `PaneDirection` (used by `pane.swap`/navigation/`pane.resize`) is a different type and is not interchangeable despite the similar name

#### Scenario: `close_group` is a linked-worktree flag, not a generic confirmation
- **WHEN** a client author sees `workspace.close`'s `close_group` parameter
- **THEN** they SHALL treat it as controlling only whether herdr closes an entire linked-git-worktree workspace group at once; it is a no-op for a workspace with no linked-worktree siblings and SHALL NOT be reused as a generic "are you sure" confirmation flag

#### Scenario: herdr does not guard against closing the last workspace
- **WHEN** a client author checks whether `workspace.close` on the only open workspace will be rejected
- **THEN** they SHALL find that it is not — herdr allows a host to reach zero open workspaces, so any guard against this must be added client-side (the SPA), not assumed from the wire contract

#### Scenario: Cascading closes never guarantee an event for every destroyed resource
- **WHEN** a client author expects one `*.closed` event per resource torn down by a cascading `pane.close`/`tab.close`/`workspace.close`
- **THEN** they SHALL instead expect only the directly-named resource's event to fire reliably (e.g. a `tab.close` that cascades into closing its workspace emits `tab.closed` then `workspace.closed`, with no `pane.closed` for panes that were inside that tab) and must locally purge cached children of any closed resource rather than wait for further events

