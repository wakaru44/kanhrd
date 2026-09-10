## Why

kanhrd's `KeyboardService` hardcodes `Ctrl+B` as the tmux/herdr-style
prefix-chord default. herdr itself already has a user-rebindable prefix
(`[keys].prefix` in herdr's own `config.toml`, default `"ctrl+b"`). A user
who rebinds herdr's prefix (e.g. because their terminal emulator or a
browser extension eats `Ctrl+B`) today has to separately, manually rebind
kanhrd's prefix in Settings > Keyboard to match, or the two tools disagree
about what "prefix" means. Mirroring herdr's configured prefix as kanhrd's
*default* removes that duplicate manual step while still letting a user's
explicit kanhrd-side override win, for the case where someone wants the two
tools to intentionally differ.

Not in scope: browser extensions (e.g. Vimium C) intercepting `Ctrl+B`
before Angular's keydown handler ever sees it. That's a separate, per-user
browser-configuration problem, unrelated to which prefix string kanhrd
defaults to.

## What Changes

- Extend `BridgeCapabilities` (`packages/schema/src/wire.ts`) with an
  optional `hostKeybinds?: { prefix: string; source: "herdr-api" |
  "herdr-cli" | "config-file" | "default" }` field. Optional so older/other
  bridges that don't report it don't break capability discovery, following
  the same per-flag-optionality spirit as `paneResize`/`paneGraphics`.
- Bridge (`apps/bridge/src/herdr/hosts.ts`): `HostRuntime` gains
  `getHostKeybinds()`, which reads `<config_dir>/config.toml` from the
  bridge process's own filesystem (herdr has no JSON API method or CLI
  subcommand for reading keybinds as of this writing — confirmed by
  grepping herdr's `src/api/*.rs` and its CLI surface — so config-file
  reading, source `A3`, is the only available path), extracts
  `[keys].prefix`, normalizes it to a display string (`"ctrl+b"` →
  `"Ctrl+B"`), and returns `{ prefix, source }`. Result is cached per host
  for the life of the bridge process (config.toml is not watched).
- `apps/bridge/src/ws/dispatch.ts`'s `bridge.capabilities` handler
  populates `hostKeybinds` from the primary host (first host in
  `HostRegistry.list()` order, the same "first host in config order" idea
  `PanesStore.findHostForCapability` already uses client-side). The
  response stays a single bridge-level object answered the same way
  regardless of which `host` the request names, matching how
  `bridge.capabilities` already behaves today.
- `apps/web/src/app/state/keyboard.service.ts`: prefix resolution becomes
  three-tier — (1) an explicit user override, set via Settings > Keyboard
  and persisted to `localStorage`, always wins; (2) else the primary host's
  `hostKeybinds.prefix` from `PanesStore.capabilitiesSignal`, if the bridge
  reports one; (3) else the hardcoded `"Ctrl+B"` fallback. This replaces the
  previous "always hardcoded default, persisted to storage on first load"
  behavior, which made "has the user actually overridden this" and "this is
  just the app's own default" indistinguishable once storage held any
  value.
- Settings > Keyboard shows the effective prefix and a short label for
  where it came from ("from herdr config" / "your override" / "default").

## Capabilities

### New Capabilities
- `host-keybinds-passthrough`: bridge-reported, herdr-config-sourced
  default keybind prefix, mirrored into kanhrd's `KeyboardService` default
  and visible in Settings > Keyboard, with an explicit user override still
  taking precedence.

### Modified Capabilities
(none — additive: existing `bridge.capabilities` shape, `KeyboardService`
prefix-chord behavior, and Settings > Keyboard UI all keep working exactly
as before for a bridge or user that doesn't touch this feature)

## Known Limitations

- Only herdr's top-level `[keys].prefix` field is read. Per-mode or macro
  keybind overrides elsewhere in herdr's config are not honored.
- Config-file reading only works for hosts whose `config.toml` is on the
  bridge process's own local filesystem. Every host this bridge currently
  supports is a local Unix-domain-socket host (`HostConfig.socket`), so
  this covers every configured host today; a future remote/SSH host would
  need its own resolution path and, until then, would just omit
  `hostKeybinds`.
- `hostKeybinds` is reported bridge-level, sourced from one "primary" host
  (first in config order), not per-host. A user running multiple herdr
  hosts with different custom prefixes only gets the primary host's prefix
  mirrored.
- The bridge reads `config.toml` once per process lifetime and caches the
  result. A prefix changed in herdr's `config.toml` while the bridge is
  already running is not picked up until the bridge restarts.
- TOML-to-display normalization is a simple capitalize-each-`+`-segment
  transform (`"ctrl+space"` → `"Ctrl+Space"`), not a full replica of
  herdr's own key-combo parser/formatter. Uncommon key names may not
  title-case exactly the way herdr's own UI would render them.

## Impact

- Affected code: `packages/schema/src/wire.ts`, `apps/bridge/src/herdr/hosts.ts`,
  `apps/bridge/src/ws/dispatch.ts`, `apps/bridge/package.json` (new `smol-toml`
  dependency), `apps/web/src/app/state/keyboard.service.ts`,
  `apps/web/src/app/state/panes.store.ts`, `apps/web/src/app/settings/settings.ts`
  (+ template).
- Affected systems: reads (does not modify) herdr's `config.toml` on the
  bridge's local filesystem. No herdr JSON API or CLI usage — those paths
  don't exist for keybinds. No wire-protocol breaking change: the new field
  is optional and additive to an already-tiered-optional capabilities
  object.
