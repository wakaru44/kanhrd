## 1. Schema (this change, lane LC3)

- [x] 1.1 Extend `packages/schema/src/wire.ts` (`BridgeMethod`/`EventKind` unions, per-method params/result maps, per-event payload map, `BridgeCapabilities`) — tier-1/tier-2 shapes unchanged
- [x] 1.2 Extend `packages/schema/src/herdr.ts` (`SplitDirection`, `HerdrPaneSplitParams`, `HerdrPaneMoveParams`/`Destination`/`Result`/`Reason`, `HerdrTabCreateParams`/`RenameParams`/`MoveParams`/`Detail`, `HerdrWorkspaceCreateParams`/`CloseParams`/`RenameParams`/`Detail`/`WorktreeInfo`, `WorkspaceSummary`/`TabSummary` bridge projections, extended `EventKind`/`HerdrEventEnvelope`)
- [x] 1.3 Confirm `packages/schema/src/index.ts` wildcard re-exports cover the new types (no change needed)
- [x] 1.4 Type-check `packages/schema` (`pnpm --filter @kanhrd/schema typecheck`)
- [x] 1.5 Write `tmp/foreman/CONTRACT-TIER3.md` documenting the frozen contract, the six herdr protocol quirks found, and the L2C/L3C notes (cache invalidation, cascading-close event loss, UI guardrails)
- [x] 1.6 Record this OpenSpec change (`proposal.md`, `specs/tier-3-lifecycle/spec.md`, `design.md`, `tasks.md`)

## 2. Bridge (lane L2C)

- [x] 2.1 Extend `bridge.capabilities`: report `{ tier: 3, ..., paneCreate, paneClose, paneMove, tabCrud, workspaceCrud }` per what this bridge build actually implements — partial support is allowed and expected to be honest per-flag — `apps/bridge/src/ws/dispatch.ts`
- [x] 2.2 Implement `pane.split`/`pane.close`/`pane.move`: forward to herdr's `Method::PaneSplit`/`PaneClose`/`PaneMove` unchanged, project `PaneInfo`/`PaneMoveResult` into the bridge's `Pane`/`WorkspaceSummary`/`TabSummary` result shapes — `apps/bridge/src/ws/dispatch.ts` (`case "pane.split"`/`"pane.close"`/`"pane.move"`)
- [x] 2.3 Implement `tab.create`/`tab.rename`/`tab.close`/`tab.move` and `workspace.create`/`workspace.rename`/`workspace.close`: forward unchanged, project results the same way — `apps/bridge/src/ws/dispatch.ts`
- [x] 2.4 Subscribe to the eight tier-3 `EventKind`s alongside tier-1's three; forward as `BridgeEventPayload` after projecting to `WorkspaceSummary`/`TabSummary`/`Pane` — `apps/bridge/src/ws/server.ts`
- [x] 2.5 Keep the workspace/tab name cache warm: update on `*.created`/`*.renamed`, purge on `*.closed` (including purging every cached child of a closed workspace/tab per CONTRACT-TIER3.md section 6, since intermediate close events are NOT guaranteed), relocate on `pane.moved` — closes the gap LC2 flagged for tier-1/tier-2 — `apps/bridge/src/herdr/names.ts` (`purgeWorkspace`/`purgeTab`)
- [x] 2.6 Handle `workspace_group_close_required` from herdr as an ordinary typed error response (not a WebSocket-fatal error) so the SPA can surface the linked-worktree-group confirmation prompt — `apps/bridge/src/ws/dispatch.ts`, `apps/bridge/src/herdr/client.ts`

## 3. Web (lane L3C)

- [x] 3.1 Pane actions on the kanban card / terminal detail view: split (direction picker), close (with confirm), move (destination picker: existing tab / new tab / new workspace) — `apps/web/src/app/board/card.ts` (`splitPane`, `confirmClose`)
- [x] 3.2 Tab and workspace management UI: create, rename (inline edit), close (with confirm; special-case the `workspace_group_close_required` error into its own "close N linked workspaces?" prompt per CONTRACT-TIER3.md section 5.4/6) — `apps/web/src/app/rail/rail.ts`/`rail.html`
- [x] 3.3 Guardrails: block closing the last remaining workspace from the UI (herdr allows it at the wire level; don't let a user strand themselves with zero workspaces); warn when a `tab.close` will cascade to closing its workspace (last tab in that workspace) — `apps/web/src/app/rail/rail.ts` (refusal copy "zero open workspaces"), `rail.html` (last-tab cascade warning)
- [x] 3.4 Capability-gated UI: call `bridge.capabilities` on connect; hide/disable each lifecycle action independently based on `paneCreate`/`paneClose`/`paneMove`/`tabCrud`/`workspaceCrud` — `apps/web/src/app/board/card.ts`
- [x] 3.5 Local tree maintenance: on any `*.closed` event, purge cached children (tabs under a closed workspace, panes under a closed tab) per CONTRACT-TIER3.md section 6 rather than waiting for events that cascading closes don't emit — `apps/web/src/app/state/panes.store.ts` (test: "tab.closed purges only that tab's panes, not sibling tabs in the same workspace")

## 4. E2E

- [~] 4.1 End-to-end test: create workspace → create tab in it → split a pane → move the split pane into a new tab → close the original tab → close the workspace, asserting the kanban board reflects each step via the tier-3 events (not re-fetch polling) — deferred/partial; `apps/web/e2e/tier3.spec.ts` covers tab create/rename/close, pane split/close-with-confirm, and cascade purge as separate scenarios, but no single e2e test chains through `pane.move` into a new tab — `pane.move` itself is only covered at the bridge unit level (`apps/bridge/src/ws/dispatch.test.ts`), not in Playwright
- [x] 4.2 Test the cascading-close event-loss path explicitly: close a tab that is the last tab in its workspace, assert the client purges the workspace's cached panes even though no per-pane `pane.closed` arrives — `apps/web/e2e/tier3.spec.ts` ("closing a tab cascades to purge its pane from the board client-side, even with no pane.closed on the wire")
- [~] 4.3 Test `workspace_group_close_required`: attempt to close one workspace in a linked-worktree group without `close_group`, assert the typed error surfaces and the group-close retry with `close_group: true` succeeds — deferred/partial; no Playwright coverage found in `apps/web/e2e/tier3.spec.ts` (would need a real linked-worktree host fixture), but the error path has unit coverage in `apps/bridge/src/ws/dispatch.test.ts` and `apps/web/src/app/state/panes.store.spec.ts`

## 5. Docs (lane L1C)

- [x] 5.1 Publish `CONTRACT-TIER3.md`'s method/event tables into whatever docs surface L1 owns for kanhrd, alongside the tier-1/tier-2 tables — `docs/CONTEXT.md` "Lifecycle (tier 3)" section, referencing `tmp/foreman/CONTRACT-TIER3.md` §3/§5.6 directly
- [x] 5.2 Cross-link the six corrected assumptions (no `pane.kill`; two-variant `SplitDirection`; `pane.move` vs `tab.move`/`workspace.move` naming trap; `close_group` is worktree-specific; no last-workspace guard; cascading closes are event-lossy) so they don't resurface in later planning or tier-4 scoping — `docs/CONTEXT.md` and `docs/adr/0005-client-side-cascade-purge-and-destructive-op-confirmations.md` cover most of these; the full six-quirk enumeration is now also captured verbatim as a "Known protocol quirks" requirement in `specs/tier-3-lifecycle/spec.md`

## 6. Validator

- [x] 6.1 `openspec validate add-tier-3-lifecycle --strict` passes with zero errors
