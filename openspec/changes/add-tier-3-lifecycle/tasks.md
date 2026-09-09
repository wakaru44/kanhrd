## 1. Schema (this change, lane LC3)

- [x] 1.1 Extend `packages/schema/src/wire.ts` (`BridgeMethod`/`EventKind` unions, per-method params/result maps, per-event payload map, `BridgeCapabilities`) — tier-1/tier-2 shapes unchanged
- [x] 1.2 Extend `packages/schema/src/herdr.ts` (`SplitDirection`, `HerdrPaneSplitParams`, `HerdrPaneMoveParams`/`Destination`/`Result`/`Reason`, `HerdrTabCreateParams`/`RenameParams`/`MoveParams`/`Detail`, `HerdrWorkspaceCreateParams`/`CloseParams`/`RenameParams`/`Detail`/`WorktreeInfo`, `WorkspaceSummary`/`TabSummary` bridge projections, extended `EventKind`/`HerdrEventEnvelope`)
- [x] 1.3 Confirm `packages/schema/src/index.ts` wildcard re-exports cover the new types (no change needed)
- [x] 1.4 Type-check `packages/schema` (`pnpm --filter @kanhrd/schema typecheck`)
- [x] 1.5 Write `tmp/foreman/CONTRACT-TIER3.md` documenting the frozen contract, the six herdr protocol quirks found, and the L2C/L3C notes (cache invalidation, cascading-close event loss, UI guardrails)
- [x] 1.6 Record this OpenSpec change (`proposal.md`, `specs/tier-3-lifecycle/spec.md`, `design.md`, `tasks.md`)

## 2. Bridge (lane L2C)

- [ ] 2.1 Extend `bridge.capabilities`: report `{ tier: 3, ..., paneCreate, paneClose, paneMove, tabCrud, workspaceCrud }` per what this bridge build actually implements — partial support is allowed and expected to be honest per-flag
- [ ] 2.2 Implement `pane.split`/`pane.close`/`pane.move`: forward to herdr's `Method::PaneSplit`/`PaneClose`/`PaneMove` unchanged, project `PaneInfo`/`PaneMoveResult` into the bridge's `Pane`/`WorkspaceSummary`/`TabSummary` result shapes
- [ ] 2.3 Implement `tab.create`/`tab.rename`/`tab.close`/`tab.move` and `workspace.create`/`workspace.rename`/`workspace.close`: forward unchanged, project results the same way
- [ ] 2.4 Subscribe to the eight tier-3 `EventKind`s alongside tier-1's three; forward as `BridgeEventPayload` after projecting to `WorkspaceSummary`/`TabSummary`/`Pane`
- [ ] 2.5 Keep the workspace/tab name cache warm: update on `*.created`/`*.renamed`, purge on `*.closed` (including purging every cached child of a closed workspace/tab per CONTRACT-TIER3.md section 6, since intermediate close events are NOT guaranteed), relocate on `pane.moved` — closes the gap LC2 flagged for tier-1/tier-2
- [ ] 2.6 Handle `workspace_group_close_required` from herdr as an ordinary typed error response (not a WebSocket-fatal error) so the SPA can surface the linked-worktree-group confirmation prompt

## 3. Web (lane L3C)

- [ ] 3.1 Pane actions on the kanban card / terminal detail view: split (direction picker), close (with confirm), move (destination picker: existing tab / new tab / new workspace)
- [ ] 3.2 Tab and workspace management UI: create, rename (inline edit), close (with confirm; special-case the `workspace_group_close_required` error into its own "close N linked workspaces?" prompt per CONTRACT-TIER3.md section 5.4/6)
- [ ] 3.3 Guardrails: block closing the last remaining workspace from the UI (herdr allows it at the wire level; don't let a user strand themselves with zero workspaces); warn when a `tab.close` will cascade to closing its workspace (last tab in that workspace)
- [ ] 3.4 Capability-gated UI: call `bridge.capabilities` on connect; hide/disable each lifecycle action independently based on `paneCreate`/`paneClose`/`paneMove`/`tabCrud`/`workspaceCrud`
- [ ] 3.5 Local tree maintenance: on any `*.closed` event, purge cached children (tabs under a closed workspace, panes under a closed tab) per CONTRACT-TIER3.md section 6 rather than waiting for events that cascading closes don't emit

## 4. E2E

- [ ] 4.1 End-to-end test: create workspace → create tab in it → split a pane → move the split pane into a new tab → close the original tab → close the workspace, asserting the kanban board reflects each step via the tier-3 events (not re-fetch polling)
- [ ] 4.2 Test the cascading-close event-loss path explicitly: close a tab that is the last tab in its workspace, assert the client purges the workspace's cached panes even though no per-pane `pane.closed` arrives
- [ ] 4.3 Test `workspace_group_close_required`: attempt to close one workspace in a linked-worktree group without `close_group`, assert the typed error surfaces and the group-close retry with `close_group: true` succeeds

## 5. Docs (lane L1C)

- [ ] 5.1 Publish `CONTRACT-TIER3.md`'s method/event tables into whatever docs surface L1 owns for kanhrd, alongside the tier-1/tier-2 tables
- [ ] 5.2 Cross-link the six corrected assumptions (no `pane.kill`; two-variant `SplitDirection`; `pane.move` vs `tab.move`/`workspace.move` naming trap; `close_group` is worktree-specific; no last-workspace guard; cascading closes are event-lossy) so they don't resurface in later planning or tier-4 scoping

## 6. Validator

- [x] 6.1 `openspec validate add-tier-3-lifecycle --strict` passes with zero errors
