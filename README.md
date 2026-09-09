# kanhrd

kanban + herdr — a web UI for [herdr](https://github.com/herdrdev/herdr) that puts every agent conversation on a single kanban board, across all your machines.

> **Status: alpha, tier 1 in progress.** The bridge and web app are still landing. The sections below describe the target shape of the project; treat "getting started" as aspirational until tier 1 ships.

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

1. **Tier 1 — Kanban** (current): unified board across hosts, `pane.list` + `events.subscribe`, host chips and filters, card = agent name / workspace / tab / status / host.
2. **Tier 2 — Terminal detail** (next): click a card to open a live xterm.js terminal for that pane, with graphics overlay support.
3. **Tier 3 — Pane lifecycle** (later): create/split/close panes and tabs/workspaces directly from the board.

See `docs/CONTEXT.md` for the full domain glossary behind these tiers.

## Getting started

```bash
pnpm install
pnpm --filter @kanhrd/bridge dev   # points at ~/.config/herdr/herdr.sock by default
```

Open the browser at the URL the bridge prints on startup. This flow targets a single local herdr instance out of the box; multi-host setups and cloud placement are configured per `docs/OPERATING.md`.

Since the bridge (`apps/bridge`) and web app (`apps/web`) are still being built out, `pnpm dev` may not yet produce a usable board — check this README's status banner and the tier list above before filing a bug about missing functionality.

## Docs

- [`docs/CONTEXT.md`](docs/CONTEXT.md) — domain glossary: what a card, board, pane, and agent mean in kanhrd.
- [`docs/adr/`](docs/adr/) — architecture decision records for the load-bearing choices (bridge topology, greenfield vs. forking, auth model).
- [`docs/OPERATING.md`](docs/OPERATING.md) — deployment recipes: laptop-only, cloud hub, and mixed with a reverse SSH tunnel.
- [herdr](https://github.com/herdrdev/herdr) — the upstream terminal agent runtime kanhrd is a client for.
