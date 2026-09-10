# host-keybinds-passthrough Specification

## Purpose
Mirrors herdr's own configured keybind prefix (`[keys].prefix` in herdr's
`config.toml`) as kanhrd's default prefix-chord binding, so a user who
rebinds herdr's prefix doesn't have to separately rebind kanhrd's. An
explicit kanhrd-side user override always takes precedence over the
mirrored default.
## Requirements
### Requirement: Bridge reports a host-sourced keybind prefix via `bridge.capabilities`
The bridge SHALL report an optional `hostKeybinds: { prefix: string;
source: "herdr-api" | "herdr-cli" | "config-file" | "default" }` field on
`bridge.capabilities`. `prefix` SHALL be a human-readable display string
(e.g. `"Ctrl+B"`, `"Ctrl+Space"`, `"F12"`). A bridge that does not
implement this feature SHALL omit the field entirely rather than send a
null or empty value; the SPA SHALL treat an absent field exactly the same
as any other missing optional capability.

#### Scenario: Bridge resolves the prefix from herdr's config.toml
- **WHEN** the primary host's `config.toml` has `[keys]\nprefix = "ctrl+space"`
- **THEN** `bridge.capabilities.hostKeybinds` is `{ prefix: "Ctrl+Space", source: "config-file" }`

#### Scenario: Missing config file falls back to herdr's own default
- **WHEN** the primary host has no `config.toml` at its resolved config
  directory, or the file exists but has no `[keys]` section or `prefix`
  field, or the file fails to parse as TOML
- **THEN** `bridge.capabilities.hostKeybinds` is `{ prefix: "Ctrl+B", source: "default" }`, matching herdr's own compiled-in default

#### Scenario: Older or non-implementing bridge omits the field
- **WHEN** a bridge build predates this feature or has no readable local
  host to resolve a prefix from
- **THEN** `bridge.capabilities` has no `hostKeybinds` key at all, and the
  SPA falls back to its own hardcoded default without erroring

### Requirement: Bridge resolves the prefix from the primary host's local filesystem, cached per process
The bridge SHALL resolve `hostKeybinds` from the first host in its
configured host order ("primary host"), reading
`<config_dir>/config.toml` on the bridge process's own filesystem where
`config_dir` follows herdr's own resolution (`$XDG_CONFIG_HOME` if set,
else the platform default, using herdr's release app-dir name `"herdr"`).
The bridge SHALL read and parse this file at most once per process
lifetime for a given host (cached thereafter), and SHALL only read the
top-level `[keys].prefix` field — per-mode or macro keybind overrides
elsewhere in herdr's keybind configuration are not read.

#### Scenario: A config.toml change while the bridge is running is not picked up until restart
- **WHEN** herdr's `config.toml` prefix is edited after the bridge has
  already resolved and cached `hostKeybinds` for that host
- **THEN** `bridge.capabilities.hostKeybinds` continues to report the
  previously cached value until the bridge process restarts

#### Scenario: A future non-local-filesystem host omits hostKeybinds gracefully
- **WHEN** the primary host's `config.toml` is not reachable on the bridge
  process's own filesystem (e.g. a future remote/SSH-backed host)
- **THEN** the bridge omits `hostKeybinds` from `bridge.capabilities`
  rather than erroring or blocking the response

### Requirement: SPA prefix resolution precedence
`KeyboardService`'s effective prefix SHALL resolve in this order: (1) an
explicit user override, set via Settings > Keyboard and persisted to
`localStorage`; (2) else the primary host's `hostKeybinds.prefix` from
`PanesStore.capabilitiesSignal`, if any configured host reports one; (3)
else the hardcoded default `"Ctrl+B"`. Only step (1) SHALL be written to
`localStorage`; loading the app SHALL NOT itself write a value to storage
merely because a default (herdr-mirrored or hardcoded) was computed.

#### Scenario: No user override, bridge reports a custom herdr prefix
- **WHEN** the user has never changed the keyboard prefix in Settings, and
  the primary host's `bridge.capabilities.hostKeybinds.prefix` is `"Ctrl+Space"`
- **THEN** `KeyboardService.prefix()` is `"Ctrl+Space"`, and prefix-chord
  detection arms on `Ctrl+Space` rather than `Ctrl+B`

#### Scenario: User override wins over the herdr-mirrored default
- **WHEN** the user has set an explicit prefix (`"Ctrl+A"`) via Settings,
  and the primary host separately reports `hostKeybinds.prefix: "Ctrl+Space"`
- **THEN** `KeyboardService.prefix()` is `"Ctrl+A"`, the user's explicit choice

#### Scenario: No override and no hostKeybinds falls back to the hardcoded default
- **WHEN** the user has never changed the keyboard prefix, and no
  configured host's capabilities include `hostKeybinds`
- **THEN** `KeyboardService.prefix()` is `"Ctrl+B"`

### Requirement: Settings > Keyboard shows the effective prefix's source
The Settings > Keyboard section SHALL display the currently effective
prefix alongside a short label identifying where it came from: an explicit
user override, the herdr-mirrored default, or the hardcoded default.

#### Scenario: Source label reflects a herdr-mirrored prefix
- **WHEN** the effective prefix comes from the primary host's
  `hostKeybinds` (no user override set)
- **THEN** Settings > Keyboard shows the prefix with a label indicating it
  came from herdr's configuration

#### Scenario: Source label reflects an explicit override
- **WHEN** the user has set an explicit prefix via Settings
- **THEN** Settings > Keyboard shows the prefix with a label indicating
  it's the user's own override, not herdr's config

