# kanhrd

kanban + herdr — a web UI for [herdr](https://github.com/herdrdev/herdr) that puts every agent conversation on a single kanban board, across all your machines.

> **Status: alpha, tier 3 shipped.** Kanban board, live terminal detail, and pane/tab/workspace lifecycle all work; tier 4 (layouts, plugins, integrations) is next.

## What it is

herdr runs coding agents in terminal panes, one machine at a time, driven from a TUI. kanhrd is a browser-based client for herdr: it talks to one or more herdr instances over their JSON socket API and renders every pane as a card on a kanban board, grouped into columns by agent status (Idle, Working, Blocked, Done, Unknown). If you run herdr on more than one machine, kanhrd gives you one board instead of N terminal sessions to check on.

## Why

Two web UIs for herdr already exist — [`herdr-web`](https://github.com/eyalev/herdr-web) (Node bridge, SGR-to-DOM terminal rendering, localhost-only, mobile-focused) and [`herdr-webui`](https://github.com/alecuba16/herdr-webui) (Rust/Axum with a ghostty renderer, single-host, terminal-workspace-centric). Neither offers a kanban view, and neither is built for watching agents across multiple hosts at a glance. kanhrd exists to fill that gap — see `docs/adr/0002-greenfield-vs-forking-existing-web-uis.md` for why it's a new codebase rather than a fork of either.

## Architecture at a glance

```
 Browser (Angular SPA)
        │  HTTP + WebSocket
        ▼
 kanhrd bridge (Node/TS) ── single process, one endpoint
        │
        ├── local herdr socket ──────────────► herdr (this machine)
        │
        └── SSH-forwarded socket ────────────► herdr (remote machine)
             (forward or reverse tunnel,
              lifecycle managed outside the bridge:
              autossh / systemd)
```

- **Bridge** (`apps/bridge`, Node/TS) — the only thing the browser talks to. Serves the built SPA, proxies JSON-socket traffic from every configured herdr host over one WebSocket, and exposes a small REST fallback for one-shot calls.
- **Web app** (`apps/web`, Angular) — the SPA: kanban board first, terminal detail and pane lifecycle views layered on top in later tiers.
- **herdr JSON socket** — each herdr host's existing local API (`$XDG_CONFIG_HOME/herdr/herdr.sock`); the bridge is a client of it, not a fork of it.
- **SSH tunnels** — how a remote herdr socket becomes reachable to the bridge as if it were local. See `docs/adr/0001-hub-bridge-ssh-tunnels.md` and `docs/OPERATING.md`.

## Ship tiers

1. **Tier 1 — Kanban** ✅ shipped: unified board across hosts, `pane.list` + `events.subscribe`, host chips and filters, card = agent name / workspace / tab / status / host.
2. **Tier 2 — Terminal detail** ✅ shipped: click a card to open a live xterm.js terminal for that pane.
3. **Tier 3 — Lifecycle** ✅ shipped, current tier: create/split/close panes and create/rename/close tabs and workspaces, directly from the board.
4. **Tier 4 — Layouts, plugins, integrations** (next): `layout.*`, plugin/integration surfaces, notification center, command palette.

See `docs/CONTEXT.md` for the full domain glossary behind these tiers.

### What's in tier 2

- A terminal view for the clicked card, rendered with xterm.js.
- Live output via bridge-side polling of `pane.read` (herdr has no public
  push event for pane content — see `docs/adr/0004-full-snapshot-terminal-output-via-polling.md`).
- Input: printable text goes through `pane.send_text`, control keys (Ctrl+C,
  arrows, etc.) go through `pane.send_keys`.
- Capability probing (`bridge.capabilities`) so a tier-1 bridge or a
  tier-2 bridge with optional features missing still degrades gracefully
  instead of breaking the connection.

### What tier 2 does NOT do

- **No PTY resize.** herdr has no public API to set a pane's terminal
  dimensions from an external client, so `pane.resize` is always rejected.
  xterm.js resizes freely in the browser; herdr keeps its own dimensions.
- **No agent-drawn graphics capture.** herdr's `pane.graphics.*` API is a
  write path for pushing overlay images onto a pane (used by plugins), not a
  read path for capturing an agent's own kitty-graphics/sixel output. There
  is currently no public way to view what an agent draws in its own pane.

See `docs/CONTEXT.md`'s Capabilities section for how clients detect and
degrade around both gaps.

### What's in tier 3

- Create, split, and close panes.
- Create, rename, and close tabs.
- Create, rename, and close workspaces.
- A live tree of workspaces and tabs alongside the board, kept in sync via
  herdr's own lifecycle events (no bridge-side polling needed — see
  `docs/CONTEXT.md`'s Lifecycle section).
- Capability probing per verb (`paneCreate`, `paneClose`, `paneMove`,
  `tabCrud`, `workspaceCrud`) so a bridge can honestly report partial
  support instead of an all-or-nothing tier flag.

### What tier 3 does NOT do

- **No workspace reordering.** herdr has `workspace.move`/`workspace.move_block`,
  but tier 3 doesn't wire it up — reordering reads as a board-layout
  concern, deferred alongside tier 4.
- **No layouts.** `layout.*` (export/apply/set-split-ratio) is tier 4.
- **No plugins, integrations, notifications, or command palette.** All
  tier 4.
- Closing a pane, tab, or workspace can cascade to closing its parents —
  and linked-worktree workspaces (`close_group`) can close several
  workspaces at once from a single confirmation. See
  `tmp/foreman/CONTRACT-TIER3.md` §5 for the exact wire-level semantics.

## Getting started

```bash
pnpm install
pnpm --filter @kanhrd/bridge dev   # points at ~/.config/herdr/herdr.sock by default
```

Open the browser at the URL the bridge prints on startup. This flow targets a single local herdr instance out of the box; multi-host setups and cloud placement are configured per `docs/OPERATING.md`.

Since the bridge (`apps/bridge`) and web app (`apps/web`) are still being built out, `pnpm dev` may not yet produce a usable board — check this README's status banner and the tier list above before filing a bug about missing functionality.

## Docs

- [`docs/CONTEXT.md`](docs/CONTEXT.md) — domain glossary: what a card, board, pane, and agent mean in kanhrd.
- [`docs/BRAND.md`](docs/BRAND.md) — identity, wordmark, voice, and the pen / field / lane / card vocabulary rename.
- [`docs/DESIGN-SYSTEM.md`](docs/DESIGN-SYSTEM.md) — the authoritative token contract: colour (both themes), typography, spacing, motion, icons, component specs, measured contrast.
- [`docs/UX-GUIDELINES.md`](docs/UX-GUIDELINES.md) — interaction patterns: density thresholds, reliability states, empty states, motion budget, mobile, anti-patterns.
- [`docs/adr/`](docs/adr/) — architecture decision records for the load-bearing choices (bridge topology, greenfield vs. forking, auth model).
- [`docs/OPERATING.md`](docs/OPERATING.md) — deployment recipes: laptop-only, cloud hub, and mixed with a reverse SSH tunnel.
- [herdr](https://github.com/herdrdev/herdr) — the upstream terminal agent runtime kanhrd is a client for.
