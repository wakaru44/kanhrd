## Context

See proposal.md - Why. The original brief assumed herdr might expose
keybinds through its JSON API (`herdr` socket methods) or its CLI. Neither
exists: grepping the herdr source (`src/api/*.rs`) for "keybinds"/
"Keybinds" is zero hits, and there is no `herdr keybinds show` or
`herdr config get` subcommand. The only available path is reading herdr's
own `config.toml` directly off disk (source `A3` from the original design
options), which this change implements. herdr's config lives at
`<config_dir>/config.toml`; `config_dir()` resolves `$XDG_CONFIG_HOME` if
set, else a platform default (`~/.config/herdr` on macOS/Linux,
`%APPDATA%\herdr` on Windows), using the release app-dir name `"herdr"`
(not the debug `"herdr-dev"` name — this bridge is reading a real user's
config, not a herdr dev build's).

## Goals / Non-Goals

**Goals:**
- Let a user who rebinds herdr's prefix get the same default in kanhrd
  without a separate manual step.
- Keep an explicit kanhrd-side override fully authoritative when the user
  wants the two to differ.
- Declare the wire field in a way that degrades safely for any bridge that
  doesn't implement it (optional field, `"default"` source as an honest
  fallback value, not an error).

**Non-Goals:**
- Fixing "a browser extension eats Ctrl+B before Angular sees it" — a
  separate, per-user browser-configuration problem, not something kanhrd's
  default-prefix source can fix.
- Reading anything beyond `[keys].prefix` from herdr's config — per-mode or
  macro keybind overrides are out of scope (documented limitation).
- Live-reloading the mirrored prefix if herdr's `config.toml` changes while
  the bridge is already running — cached per bridge-process lifetime
  (documented limitation; see "Risks" below for the upgrade path).
- Per-host prefix mirroring for multi-host setups — mirrors one "primary"
  host's prefix bridge-wide, same simplification `PanesStore` already uses
  for other primary-host-gated actions (new pane / new tab / new workspace).

## Decisions

**Config-file read (A3), not a new herdr API method or CLI flag.** herdr
has neither today. Inventing one would mean carrying a herdr-repo change as
a dependency of this kanhrd-only feature, and CLAUDE.md's herdr-repo rules
explicitly keep this kind of protocol addition inside herdr's own
maintainer-controlled workflow, not something a kanhrd change proposes on
herdr's behalf. `source: "herdr-api" | "herdr-cli"` are still declared in
the wire union for forward compatibility — if herdr later grows a real API
for this, the bridge can start reporting a more precise source without a
breaking wire change — but only `"config-file"`/`"default"` are actually
produced today.

**`hostKeybinds` lives on `BridgeCapabilities`, not a new wire method.**
`bridge.capabilities` is already the place a bridge advertises "what this
build/host supports," including things that aren't booleans in spirit
(`outputPollIntervalMs` is a number). A `{ prefix, source }` object fits
the same shape without inventing a new request/response round trip for one
small piece of host-sourced config.

**Cached per-process, not filesystem-watched.** `hosts.ts` has no existing
config-file watcher to hook into (its watch-like machinery is all
herdr-socket reconnect/backoff, not local `fs.watch`), and adding one for a
value that "rarely changes" (per the brief) is more machinery than this
feature justifies. Alternative considered: `fs.watch` on `config.toml` and
push a `bridge.capabilities`-changed notification — rejected as
over-engineering for a value a user can pick up with a bridge restart, same
tradeoff the brief itself calls out. Documented as a known limitation
instead.

**Primary-host selection reuses the existing "first host in config order"
idea, not a new selection mechanism.** `PanesStore.findHostForCapability`
(web) and `Board`'s local `primaryHost` computed both already pick "the
first host in `hostsSignal`/config order that has X" for bridge-level
UI actions gated by a specific host. The bridge side doesn't have an
equivalent existing helper (its `bridge.capabilities` handler answers with
one shared constant regardless of the requested `host` already), so this
adds one: `HostRegistry.list()[0]` — first-registered host, config order —
is the "primary" host whose `config.toml` is read. No new concept, just
extending `DispatchHost`-adjacent access with the `list()` the registry
already has, into the one place (`dispatch.ts`) that needs it.

**New dependency: `smol-toml`.** No TOML parser exists anywhere in this
workspace (checked `pnpm-lock.yaml` and every `apps/*/package.json`,
`packages/*/package.json`). `smol-toml` is small, has no further
dependencies, and is TOML 1.0-spec-compliant — added only to
`apps/bridge/package.json` (the SPA and schema package have no reason to
parse TOML themselves).

## Risks / Trade-offs

- [Stale-until-restart prefix] → a user who rebinds herdr's prefix while
  kanhrd's bridge is already running won't see the mirrored default change
  until the bridge restarts. Mitigation: documented limitation; upgrade
  path is an `fs.watch` on `config.toml` invalidating the per-host cache,
  should this prove to matter in practice.
- [Multi-host prefix mismatch] → a user with two herdr hosts on different
  custom prefixes only gets the primary host's prefix mirrored into
  kanhrd, which is single-prefix (kanhrd's `KeyboardService` has exactly
  one active prefix, not a per-pane one). Mitigation: documented
  limitation; this mirrors an existing kanhrd constraint (one active
  keyboard prefix for the whole app), not a new one this change
  introduces.
- [Normalization isn't a full replica of herdr's key-combo parser] →
  uncommon modifier/key names might not title-case exactly like herdr's own
  UI would show them. Mitigation: documented limitation; MVP
  capitalize-each-segment transform, revisit only if a real mismatch is
  reported.

## Migration Plan

Additive only. `hostKeybinds` is a new optional `BridgeCapabilities` field;
every existing bridge, and every existing kanhrd SPA build, keeps working
unchanged whether or not the new field is present. `KeyboardService`'s
prefix resolution changes from "always hardcoded default, persisted to
storage on first render" to "explicit override (if the user has ever
called `setPrefix`) > herdr-mirrored default > hardcoded default" — the
default value seen by a user who has never touched Settings > Keyboard and
whose bridge doesn't report `hostKeybinds` is unchanged (`"Ctrl+B"`).
