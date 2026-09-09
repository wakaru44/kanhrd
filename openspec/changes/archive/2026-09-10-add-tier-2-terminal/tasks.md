## 1. Schema (this change, lane LC2)

- [x] 1.1 Extend `packages/schema/src/wire.ts` (`BridgeMethod`/`EventKind` unions, per-method params/result maps, per-event payload map, `BridgeCapabilities`) — tier-1 shapes unchanged
- [x] 1.2 Extend `packages/schema/src/herdr.ts` (`ReadSource`, `ReadFormat`, `HerdrPaneReadParams`/`Result`, `HerdrPaneSendKeysParams`/`SendTextParams`, `HerdrPaneResizeParams`, `HerdrPaneGraphicsInfoResult`, `HerdrGraphicsFrameHeader`, extended `EventKind`)
- [x] 1.3 Confirm `packages/schema/src/index.ts` wildcard re-exports cover the new types (no change needed)
- [x] 1.4 Type-check `packages/schema` under strict TS config (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`)
- [x] 1.5 Write `tmp/foreman/CONTRACT-TIER2.md` documenting the frozen contract and the two herdr-schema mismatches found (no output-push event; `pane.graphics.*` is a write path)
- [x] 1.6 Record this OpenSpec change (`proposal.md`, `specs/tier-2-terminal/spec.md`, `design.md`, `tasks.md`)

## 2. Bridge (lane L2B)

- [x] 2.1 Implement `bridge.capabilities`: report `{ tier: 2, terminal: true, paneResize: false, paneGraphics: <bool per L2B's own build>, outputPollIntervalMs }` — `apps/bridge/src/ws/dispatch.ts`
- [x] 2.2 Implement `pane.read`: forward to herdr's `Method::PaneRead` with `source`/`format` defaults (`recent`/`ansi`) applied when the browser omits them, project `PaneReadResult` into the trimmed `pane.read` result shape — `apps/bridge/src/ws/dispatch.ts` (`case "pane.read"`)
- [x] 2.3 Implement `pane.subscribe_output`/`pane.unsubscribe_output`: per-`(host, pane_id)` shared poll loop over `pane.read` at a configured cadence, revision-deduped, fanning `pane.output` events out to every subscriber on that pane; stop the loop when the last subscriber unsubscribes or disconnects — `apps/bridge/src/output/poller.ts`, `apps/bridge/src/output/poller.test.ts`
- [x] 2.4 Implement `pane.send_keys`/`pane.send_text`: forward to herdr's `Method::PaneSendKeys`/`Method::PaneSendText` unchanged — `apps/bridge/src/ws/dispatch.ts` (`case "pane.send_keys"`/`"pane.send_text"`)
- [x] 2.5 Implement `pane.resize`: always respond with an error (`unsupported_operation` or similar) — do not attempt to map onto herdr's `Method::PaneResize` (split-geometry resize, not PTY size) — `apps/bridge/src/ws/dispatch.ts` (`case "pane.resize"`), `dispatch.test.ts` ("rejects pane.resize with not_supported")
- [x] 2.6 (Optional) Implement `pane.graphics.info`/`pane.graphics.stream`/`pane.graphics_frame` as a genuinely optional feature — only if/when `paneGraphics` support is actually requested; otherwise leave `paneGraphics: false` and skip — the "otherwise" branch was taken: `apps/bridge/src/ws/dispatch.ts` reports `paneGraphics: false` and rejects the graphics methods; never implemented, per spec
- [x] 2.7 Handle per-pane herdr errors (pane closed mid-subscription, host disconnected) as subscription-local failures — push a terminal `pane.output`-adjacent error state or simply stop polling, not a WebSocket-fatal error — `apps/bridge/src/output/poller.ts`

## 3. Web (lane L3B)

- [x] 3.1 Terminal detail view: xterm.js instance per opened pane, hydrated via `pane.read`, kept live via `pane.subscribe_output`'s `pane.output` events (`term.reset(); term.write(content)` per event as the baseline correct handler) — `apps/web/src/app/pane-detail/pane-detail.ts`
- [x] 3.2 Input wiring: printable text via `pane.send_text`, special keys via `pane.send_keys` (needs a browser-keyevent → herdr key-name-token mapping table for non-printable keys) — `apps/web/src/app/pane-detail/key-mapping.ts`, `key-mapping.spec.ts`
- [x] 3.3 Capability-gated UI: call `bridge.capabilities` on connect; disable terminal detail view entirely if the call errors (tier-1 bridge), disable resize UI unconditionally (`paneResize` always `false` this tier), show graphics overlay panel only when `paneGraphics: true` — `apps/web/src/app/pane-detail/pane-detail.ts` (`graphicsAvailable` computed from capabilities)
- [x] 3.4 Subscription lifecycle: call `pane.unsubscribe_output` when the detail view closes or the user navigates away, so the bridge can retire idle poll loops — `apps/web/src/app/pane-detail/pane-detail.ts` (calls `pane.unsubscribe_output` on cleanup)

## 4. Docs (lane L1B)

- [x] 4.1 Publish `CONTRACT-TIER2.md`'s method/event tables into whatever docs surface L1 owns for kanhrd, alongside the tier-1 tables — commit `d93d7c1` added a "Terminal detail (tier 2)" and "Capabilities" section to `docs/CONTEXT.md` and a polling-cost note to `docs/OPERATING.md`, documenting the actual contract in prose rather than a literal reproduced table
- [x] 4.2 Cross-link the two corrected assumptions (`pane.send_keys` takes `keys: string[]`; `pane.graphics.*`/`pane.resize` don't do what their names suggest) so they don't resurface in later planning or tier-3 scoping — `docs/CONTEXT.md` "Terminal renderer" section explicitly documents graphics as a write path, not a read path, and the "Terminal detail" section documents `send_keys`/`send_text` split and no-resize-propagation

## 5. Validator

- [x] 5.1 `openspec validate add-tier-2-terminal --strict` passes with zero errors
