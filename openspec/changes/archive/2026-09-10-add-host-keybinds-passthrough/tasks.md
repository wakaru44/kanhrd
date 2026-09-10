## 1. Schema

- [x] 1.1 Extend `BridgeCapabilities` in `packages/schema/src/wire.ts` with optional `hostKeybinds?: { prefix: string; source: "herdr-api" | "herdr-cli" | "config-file" | "default" }`
- [x] 1.2 Type-check `packages/schema` (`pnpm --filter @kanhrd/schema typecheck`)

## 2. Bridge

- [x] 2.1 Add `smol-toml` to `apps/bridge/package.json` (no existing TOML parser in the workspace)
- [x] 2.2 `apps/bridge/src/herdr/hosts.ts` + new `apps/bridge/src/herdr/keybinds.ts`: config-dir resolution (`$XDG_CONFIG_HOME` else platform default, app-dir name `"herdr"`), `config.toml` read + `[keys].prefix` extraction, `"ctrl+b"`-style → `"Ctrl+B"`-style display normalization, `HostRuntime.getHostKeybinds()` returning `{ prefix, source }`, cached per host for the process lifetime
- [x] 2.3 `HostRegistry` exposes host order so `dispatch.ts` can resolve "primary host" (first in config order) — reused `HostRegistry.list()`, widened `DispatchHost`/`DispatchHostSource` typing
- [x] 2.4 `apps/bridge/src/ws/dispatch.ts`: populate `CAPABILITIES.hostKeybinds` from the primary host's `getHostKeybinds()`, resolved once (cached) rather than per request
- [x] 2.5 Bridge unit tests (`apps/bridge/src/herdr/keybinds.test.ts`): TOML-parsing/normalization fixtures (`"ctrl+b"` → `"Ctrl+B"`, `"ctrl+space"` → `"Ctrl+Space"`, `"f12"` → `"F12"`, missing file → `default`/`"Ctrl+B"`, missing `[keys]`/`prefix` → `default`/`"Ctrl+B"`, malformed TOML → `default`/`"Ctrl+B"`) — no live herdr socket required; also extended `apps/bridge/src/ws/dispatch.test.ts` for primary-host selection and the no-configured-host case
- [x] 2.6 `pnpm --filter @kanhrd/bridge typecheck` and `pnpm --filter @kanhrd/bridge test` (unit only) — 81/81 passing

## 3. Bridge integration test

- [x] 3.1 Added `B1b` to `apps/bridge/integration/ws-methods.test.ts` asserting `hostKeybinds.prefix` is a plausible string, gated behind the existing `requireHerdrOrSkipReason()` skip AND an additional `KANHRD_INT_HERDR_SOCKET` env-var opt-in gate per the brief — not run in this session against a live herdr socket

## 4. Web

- [x] 4.1 `apps/web/src/app/state/panes.store.ts`: `primaryHostKeybinds()` helper (mirrors `findHostForCapability`'s "first host in `hostsSignal` order" pattern)
- [x] 4.2 `apps/web/src/app/state/keyboard.service.ts`: split "default prefix" from "user override" — `loadPrefixOverride()`/`clearStoredPrefix()` added, `prefix` is now a `computed()` of override ?? herdr-mirrored ?? hardcoded default, `setPrefix()`/`resetToDefault()` explicitly write/clear the override; added `prefixSource` computed for the UI label
- [x] 4.3 Settings > Keyboard (`apps/web/src/app/settings/settings.ts`/`.html`/`.scss`): shows effective prefix + source label ("from herdr config" / "your override" / "default")
- [x] 4.4 Unit tests: `KeyboardService` uses herdr-mirrored prefix with no user override; user override wins over herdr-mirrored; missing `hostKeybinds` falls back to `"Ctrl+B"`; `resetToDefault()` falls back to the herdr-mirrored prefix, not the hardcoded one, when a host reports one. Also extended `settings.spec.ts` for the source label.
- [x] 4.5 `pnpm --filter @kanhrd/web typecheck` and `pnpm --filter @kanhrd/web test` — 147/147 passing
- [x] 4.6 `pnpm --filter @kanhrd/web build`

## 5. E2E (lowest priority tier)

- [~] 5.1 Skipped: `apps/web/e2e/**` has no existing WebSocket-mocking/fixture harness to inject a `bridge.capabilities` response with `hostKeybinds` — every e2e test in this suite drives a real bridge+herdr. Building that harness is out of this change's scope per the brief's own "lowest-priority tier" allowance; noted here rather than silently left out.

## 6. Validator

- [x] 6.1 `openspec validate add-host-keybinds-passthrough --strict` passes with zero errors
- [x] 6.2 `pnpm lint`
