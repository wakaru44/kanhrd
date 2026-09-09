## 1. Schema (this change, lane LC2)

- [x] 1.1 Extend `packages/schema/src/wire.ts` (`BridgeMethod`/`EventKind` unions, per-method params/result maps, per-event payload map, `BridgeCapabilities`) — tier-1 shapes unchanged
- [x] 1.2 Extend `packages/schema/src/herdr.ts` (`ReadSource`, `ReadFormat`, `HerdrPaneReadParams`/`Result`, `HerdrPaneSendKeysParams`/`SendTextParams`, `HerdrPaneResizeParams`, `HerdrPaneGraphicsInfoResult`, `HerdrGraphicsFrameHeader`, extended `EventKind`)
- [x] 1.3 Confirm `packages/schema/src/index.ts` wildcard re-exports cover the new types (no change needed)
- [x] 1.4 Type-check `packages/schema` under strict TS config (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`)
- [x] 1.5 Write `tmp/foreman/CONTRACT-TIER2.md` documenting the frozen contract and the two herdr-schema mismatches found (no output-push event; `pane.graphics.*` is a write path)
- [x] 1.6 Record this OpenSpec change (`proposal.md`, `specs/tier-2-terminal/spec.md`, `design.md`, `tasks.md`)

## 2. Bridge (lane L2B)

- [ ] 2.1 Implement `bridge.capabilities`: report `{ tier: 2, terminal: true, paneResize: false, paneGraphics: <bool per L2B's own build>, outputPollIntervalMs }`
- [ ] 2.2 Implement `pane.read`: forward to herdr's `Method::PaneRead` with `source`/`format` defaults (`recent`/`ansi`) applied when the browser omits them, project `PaneReadResult` into the trimmed `pane.read` result shape
- [ ] 2.3 Implement `pane.subscribe_output`/`pane.unsubscribe_output`: per-`(host, pane_id)` shared poll loop over `pane.read` at a configured cadence, revision-deduped, fanning `pane.output` events out to every subscriber on that pane; stop the loop when the last subscriber unsubscribes or disconnects
- [ ] 2.4 Implement `pane.send_keys`/`pane.send_text`: forward to herdr's `Method::PaneSendKeys`/`Method::PaneSendText` unchanged
- [ ] 2.5 Implement `pane.resize`: always respond with an error (`unsupported_operation` or similar) — do not attempt to map onto herdr's `Method::PaneResize` (split-geometry resize, not PTY size)
- [ ] 2.6 (Optional) Implement `pane.graphics.info`/`pane.graphics.stream`/`pane.graphics_frame` as a genuinely optional feature — only if/when `paneGraphics` support is actually requested; otherwise leave `paneGraphics: false` and skip
- [ ] 2.7 Handle per-pane herdr errors (pane closed mid-subscription, host disconnected) as subscription-local failures — push a terminal `pane.output`-adjacent error state or simply stop polling, not a WebSocket-fatal error

## 3. Web (lane L3B)

- [ ] 3.1 Terminal detail view: xterm.js instance per opened pane, hydrated via `pane.read`, kept live via `pane.subscribe_output`'s `pane.output` events (`term.reset(); term.write(content)` per event as the baseline correct handler)
- [ ] 3.2 Input wiring: printable text via `pane.send_text`, special keys via `pane.send_keys` (needs a browser-keyevent → herdr key-name-token mapping table for non-printable keys)
- [ ] 3.3 Capability-gated UI: call `bridge.capabilities` on connect; disable terminal detail view entirely if the call errors (tier-1 bridge), disable resize UI unconditionally (`paneResize` always `false` this tier), show graphics overlay panel only when `paneGraphics: true`
- [ ] 3.4 Subscription lifecycle: call `pane.unsubscribe_output` when the detail view closes or the user navigates away, so the bridge can retire idle poll loops

## 4. Docs (lane L1B)

- [ ] 4.1 Publish `CONTRACT-TIER2.md`'s method/event tables into whatever docs surface L1 owns for kanhrd, alongside the tier-1 tables
- [ ] 4.2 Cross-link the two corrected assumptions (`pane.send_keys` takes `keys: string[]`; `pane.graphics.*`/`pane.resize` don't do what their names suggest) so they don't resurface in later planning or tier-3 scoping

## 5. Validator

- [x] 5.1 `openspec validate add-tier-2-terminal --strict` passes with zero errors
