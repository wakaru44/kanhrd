## 1. Schema (this change, lane LC)

- [x] 1.1 Author `packages/schema/src/wire.ts` (browser ↔ bridge envelope, methods, events, REST fallback types)
- [x] 1.2 Author `packages/schema/src/herdr.ts` (mirrored herdr types + bridge-projected `Pane`/`HostSummary`)
- [x] 1.3 Re-export both from `packages/schema/src/index.ts`
- [x] 1.4 Type-check `packages/schema` under strict TS config
- [x] 1.5 Write `tmp/foreman/CONTRACT.md` documenting the frozen contract and deviations from the original brief
- [x] 1.6 Record this OpenSpec change (`proposal.md`, `specs/tier-1-kanban/spec.md`, `design.md`, `tasks.md`)

## 2. Bridge (lane L2)

- [ ] 2.1 Implement per-host `ApiClient`-equivalent: connect to each configured herdr host's socket, speak the newline-delimited JSON protocol (see `src/api/client.rs` in herdr)
- [ ] 2.2 Implement `pane.list` handler: fetch `PaneInfo[]` from herdr, join with `workspace.list`/`tab.list` results to resolve `{id, name}` pairs, project into `Pane`
- [ ] 2.3 Maintain a workspace/tab name cache per host; refresh on connect/reconnect (tier-1 does not subscribe to rename events — documented gap)
- [ ] 2.4 Implement `events.subscribe`: call herdr's `events.subscribe` for the three tier-1 kinds, mint a `subscription_id`, fan out matching `EventEnvelope`s as `WsEvent` frames per subscribing browser connection
- [ ] 2.5 Implement the WebSocket envelope: `WsRequest` in, `WsResponseSuccess`/`WsResponseError` out, correlated by `id` and scoped by `host`
- [ ] 2.6 Implement REST fallback: `GET /api/hosts`, `GET /api/hosts/:host/panes`, `GET /` (SPA index)
- [ ] 2.7 Handle host connection failures as client-local `HostSummary.last_error`, not as WebSocket-fatal errors

## 3. Web (lane L3)

- [ ] 3.1 Angular SPA kanban view rendering `Pane[]` as cards grouped/columned by `agent_status`
- [ ] 3.2 WebSocket client speaking `wire.ts`'s envelope: send `pane.list`/`events.subscribe` per host, apply `pane.created`/`pane.closed`/`pane.agent_status_changed` events to the in-memory board
- [ ] 3.3 REST fallback path when the WebSocket is unavailable, using the same `Pane`/`HostSummary` types
- [ ] 3.4 Host picker/summary using `GET /api/hosts`

## 4. Docs (lane L1)

- [ ] 4.1 Publish CONTRACT.md's method/event/type tables into whatever docs surface L1 owns for kanhrd
- [ ] 4.2 Cross-link the `pane.closed` (not `pane.destroyed`) naming correction so it doesn't resurface in later planning

## 5. Validator

- [x] 5.1 `openspec validate add-tier-1-kanban --strict` passes with zero errors
