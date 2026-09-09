## Why

Users running multiple herdr sessions across several hosts have no single
place to see every agent's status at a glance. Each herdr host only shows
its own panes; checking on all running agents means attaching to each host
separately. kanhrd exists to give a unified, mouse-first kanban board of
every pane, across every configured herdr host, driven by herdr's existing
JSON API.

## What Changes

- Freeze the browser ↔ bridge WebSocket envelope (request/success/error/event
  frames, all host-scoped) as the wire contract for tier-1.
- Freeze the tier-1 method surface: `pane.list` (full board snapshot) and
  `events.subscribe` (live updates for `pane.created`, `pane.closed`,
  `pane.agent_status_changed`).
- Freeze the bridge-projected `Pane` card shape and the REST fallback
  endpoints (`GET /api/hosts`, `GET /api/hosts/:host/panes`, `GET /`).
- Publish the contract as TypeScript types in `packages/schema/src/` so the
  bridge (L2) and web (L3) lanes build against the same shapes without
  drifting.
- Document deviations found while mirroring herdr's real schema: herdr's
  `events.subscribe` returns no subscription id (bridge must mint one), and
  the pane-removal event is `pane.closed`, not `pane.destroyed`.

## Capabilities

### New Capabilities
- `tier-1-kanban`: unified kanban board of panes across all configured
  herdr hosts, backed by the bridge's `pane.list` + `events.subscribe`
  WebSocket contract and REST fallback, kanban view only (no terminal
  interaction, no pane lifecycle commands).

### Modified Capabilities
(none — first capability in this repo)

## Impact

- Affected code: `packages/schema/src/wire.ts`, `packages/schema/src/herdr.ts`,
  `packages/schema/src/index.ts` (new, this change). `apps/bridge/**` and
  `apps/web/**` are downstream consumers, implemented in later lanes — not
  touched here.
- Affected systems: herdr's JSON API over
  `~/.config/herdr/herdr.sock` (read-only dependency, one connection per
  configured host from the bridge).
- No breaking changes — this is the first wire contract kanhrd defines.
