# kanhrd context

This glossary originally lived at herdr's `CONTEXT.md` during the grill
session that shaped kanhrd (before this repo existed) and has been ported
here, since it describes kanhrd's domain, not herdr's.

Glossary for **kanhrd** — a web UI for herdr with a kanban view as its distinctive surface. Product/domain only, no implementation.

**Name**: `kanhrd` = kanban + herdr. npm and github handle both free at time of decision.

## Terms

### Card
The atomic unit on the kanban board. **A card is a pane** — one PTY hosting one agent conversation. 1:1 with herdr's `pane.*` API surface. Card lifecycle = pane lifecycle; restarting a pane creates a new card.

A second class of card, **tab-card**, may later represent a tab (grouping of related panes, e.g. worktree + agent + test-runner). Not in scope for the initial cut.

### Board
The kanban view. Columns are the herdr-native `AgentStatus` values: **Idle, Working, Blocked, Done, Unknown** (see `src/api/schema/common.rs:160`). Column moves are driven by `pane.agent_status_changed` events; the UI does not own column state.

A user-tag overlay (labels on cards, orthogonal to column) may be added later. Not in scope for the initial cut.

### Interaction model
**Full herdr client, web-native.** The web UI is a complete substitute for the herdr TUI when you want to work from a browser. Terminal render in browser (xterm.js / ghostty-web / equivalent), send-keys, workspace/tab/pane management. Kanban is the *distinctive* view — not the only one. Users pick web UI *instead* of TUI, not *in addition to* dashboarding it.

Rationale: shipping a read-only overlay would mean maintaining three clients (TUI, existing web UIs, new kanban). The point of building this is that no existing web UI has the kanban view, and users who want a browser experience want a *complete* browser experience.

### Multi-host scope
User runs herdr on N machines (currently 3). One UI session manages all of them.

**Topology: hub bridge + SSH-forwarded sockets.** A single bridge process (placement-agnostic — laptop or cloud) exposes one HTTP+WS endpoint to the browser. Each remote herdr socket is made locally-reachable via a forward or reverse SSH tunnel; the bridge treats every host as "a local Unix-socket path" with no knowledge of tunnel direction. Tunnel lifecycle lives outside the bridge (autossh / systemd).

Bridge config is a flat host list — `{name, socket_path}` — with an offline indicator per host when a socket read fails.

Rejected: A (bridge per host, multi-endpoint SPA) — 3 endpoints to secure; C (piggyback on herdr's own SSH remote) — that path speaks the private TUI wire, not the JSON API, and would couple the bridge to `PROTOCOL_VERSION`.

### Codebase relationship
Greenfield sidecar. herdr-web (Node, SGR-to-DOM) and herdr-webui (Rust/Axum, ghostty) inform patterns and pitfalls — not code lineage. SGR-to-DOM is rejected as insufficient for real agent TUIs (alt-screen, cursor management, kitty graphics).

### Terminal renderer
**xterm.js + graphics overlay.** xterm.js handles text/VT semantics; kitty-graphics/sixel blobs sourced from herdr's `pane.graphics.stream` are painted as absolutely-positioned `<img>` layers over the terminal grid. Mirrors herdr's own text/graphics separation.

Ghostty-web (libghostty-vt via wasm) deferred — no existing web binding, high project risk. Revisit only if xterm.js proves insufficient for a concrete case.

### Bridge stack
**Node.js / TypeScript.** Single sidecar process. Responsibilities: serve static SPA, proxy JSON-socket ↔ WebSocket with host tagging, expose HTTP for one-shot API methods. No SSH tunnel management inside the bridge — that stays outside (autossh/systemd).

### Frontend stack
**Angular (modern / signals + RxJS).** SPA served by the Node bridge. Angular CDK for kanban drag-drop. xterm.js embedded as a component. Multi-view: kanban board, workspace tree, terminal detail. Responsive for desktop + mobile.

### v1 scope
Full herdr client, built in three tiers:

- **Tier 1 — Kanban** (must): `pane.list` across hosts, `events.subscribe` for status changes, unified board, host chips + filters, card content = agent name, workspace/tab, last-output snippet, status, host.
- **Tier 2 — Terminal detail** (must): click card → xterm.js pane; `pane.read` backfill + live output stream; `pane.send_keys` / `pane.send_text`; `pane.resize`; kitty-graphics overlay via `pane.graphics.stream`.
- **Tier 3 — Lifecycle** (must): create/split/close pane; create/rename/delete tab, workspace; move pane between tabs.

Deferred (Tier 4, post-v1): `layout.*`, integrations, plugins, notification center, agent-view custom filters, popup surfaces, command palette.

Built iteratively — Tier 1 usable before Tier 2 starts.

### Repo & shipping
**Monorepo, two ship targets.** Single repo with `apps/bridge` (Node/TS), `apps/web` (Angular SPA), and `packages/schema` (TypeScript types generated from herdr's `schemars` output). Managed with pnpm workspaces; no Nx/Turbo until a real coordination pain appears.

Two ship channels from the same build:
- **npm / `npx`** for laptop users — one-shot install, bridge serves the pre-built SPA.
- **Docker image** for cloud placement — bind-mount local sockets or point at SSH-tunnelled ones via config.

Standalone binary (pkg/bun compile) deferred until Node install friction becomes a real complaint.

### Bridge state
**Stateless proxy.** Configuration only: a static host-list file (`{name, socket_path}` per host). No database, no persisted user data. Restarts are free — reconnect re-fetches snapshots from herdr.

UI preferences and (future) kanban tag overlays live in browser `localStorage`. If cross-device sync becomes a concrete need, the bridge grows a small persistent store (SQLite or file-based) — not before.

### Board topology
**Unified board across all hosts.** Cards from every configured host share one kanban view. Columns are agent status (Q2). Host is a facet: each card shows a host chip/badge; a filter bar lets the user hide/show hosts, statuses, or (later) tags.

Rejected: per-host boards with a switcher — degrades back to the context-switching problem multi-host was meant to solve. Rejected: host×status swimlane grid — poor mobile experience.

Consequence: every message on the bridge WS carries a `host` field; every request carries a `host` selector.

### Auth
**Delegated to a reverse proxy** (Tailscale Funnel, oauth2-proxy, Cloudflare Access, etc.). Bridge itself owns no credential store; it reads a trusted identity header (e.g. `X-Forwarded-User`) set by the proxy.

Default bind is `127.0.0.1`. Binding on `0.0.0.0` requires an explicit `--i-know-what-im-doing` flag to prevent accidental unauthenticated exposure. Documentation must be thorough — the safe operational recipe (Tailscale-in-front, laptop-only, cloud-with-oauth) is part of the deliverable, not a footnote.

### Pane / Tab / Workspace
Herdr's existing composition units, unchanged. See `src/pane/`, `src/workspace/`. The web UI does not invent new organisational concepts; it projects herdr's units onto a board.

### Agent
Detected-inside-pane process identity (`src/detect/`). An agent lives inside a pane; multiple pane lifetimes can host the same agent binary but are distinct cards.
