## 1. Schema (this change, lane LC)

- [x] 1.1 Author `packages/schema/src/wire.ts` (browser ↔ bridge envelope, methods, events, REST fallback types)
- [x] 1.2 Author `packages/schema/src/herdr.ts` (mirrored herdr types + bridge-projected `Pane`/`HostSummary`)
- [x] 1.3 Re-export both from `packages/schema/src/index.ts`
- [x] 1.4 Type-check `packages/schema` under strict TS config
- [x] 1.5 Write `tmp/foreman/CONTRACT.md` documenting the frozen contract and deviations from the original brief
- [x] 1.6 Record this OpenSpec change (`proposal.md`, `specs/tier-1-kanban/spec.md`, `design.md`, `tasks.md`)

## 2. Bridge (lane L2)

- [x] 2.1 Implement per-host `ApiClient`-equivalent: connect to each configured herdr host's socket, speak the newline-delimited JSON protocol (see `src/api/client.rs` in herdr) — `apps/bridge/src/herdr/client.ts`, `apps/bridge/src/herdr/hosts.ts`
- [x] 2.2 Implement `pane.list` handler: fetch `PaneInfo[]` from herdr, join with `workspace.list`/`tab.list` results to resolve `{id, name}` pairs, project into `Pane` — `apps/bridge/src/herdr/project.ts`, `apps/bridge/src/ws/dispatch.ts` (`case "pane.list"`)
- [x] 2.3 Maintain a workspace/tab name cache per host; refresh on connect/reconnect (tier-1 does not subscribe to rename events — documented gap) — `apps/bridge/src/herdr/names.ts`
- [x] 2.4 Implement `events.subscribe`: call herdr's `events.subscribe` for the three tier-1 kinds, mint a `subscription_id`, fan out matching `EventEnvelope`s as `WsEvent` frames per subscribing browser connection — `apps/bridge/src/ws/dispatch.ts` (`case "events.subscribe"`), `apps/bridge/src/ws/server.ts`
- [x] 2.5 Implement the WebSocket envelope: `WsRequest` in, `WsResponseSuccess`/`WsResponseError` out, correlated by `id` and scoped by `host` — `apps/bridge/src/ws/server.ts`, `apps/bridge/src/ws/dispatch.ts`
- [x] 2.6 Implement REST fallback: `GET /api/hosts`, `GET /api/hosts/:host/panes`, `GET /` (SPA index) — `apps/bridge/src/http/rest.ts`
- [x] 2.7 Handle host connection failures as client-local `HostSummary.last_error`, not as WebSocket-fatal errors — `apps/bridge/src/herdr/hosts.ts`, `apps/bridge/src/herdr/hosts.test.ts`

## 3. Web (lane L3)

- [x] 3.1 Angular SPA kanban view rendering `Pane[]` as cards grouped/columned by `agent_status` — `apps/web/src/app/board/board.ts`, `column.ts`, `card.ts`
- [x] 3.2 WebSocket client speaking `wire.ts`'s envelope: send `pane.list`/`events.subscribe` per host, apply `pane.created`/`pane.closed`/`pane.agent_status_changed` events to the in-memory board — `apps/web/src/app/state/panes.store.ts`
- [x] 3.3 REST fallback path when the WebSocket is unavailable, using the same `Pane`/`HostSummary` types — `apps/web/src/app/state/panes.store.ts` (httpResource-backed initial fetch)
- [x] 3.4 Host picker/summary using `GET /api/hosts` — `apps/web/src/app/board/filter-bar.ts`, `apps/web/src/app/rail/rail.ts`

## 4. Docs (lane L1)

- [~] 4.1 Publish CONTRACT.md's method/event/type tables into whatever docs surface L1 owns for kanhrd — deferred; `tmp/foreman/CONTRACT.md` exists but its tables were never reproduced or linked from `docs/` (checked `docs/CONTEXT.md`, `docs/OPERATING.md`, `docs/adr/**`; none reference `CONTRACT.md`). Later tiers adopted this pattern for their own CONTRACT-TIER2/3.md docs, tier-1's own docs task was never circled back to.
- [~] 4.2 Cross-link the `pane.closed` (not `pane.destroyed`) naming correction so it doesn't resurface in later planning — deferred; no occurrence of `pane.destroyed` or an explicit correction note found anywhere under `docs/`. In practice the naming never resurfaced as a bug (later tiers use `pane.closed` correctly), so the risk this task guarded against didn't materialize, but the documentation itself was never written.

## 5. Validator

- [x] 5.1 `openspec validate add-tier-1-kanban --strict` passes with zero errors
