## Purpose

Gives a user one kanban board showing every pane (agent) across every
configured herdr host, kept live via a bridge-mediated WebSocket, so they
never have to attach to each host separately just to check agent status.

## ADDED Requirements

### Requirement: Bridge exposes a host-scoped WebSocket envelope
The bridge SHALL accept and emit only the frozen tier-1 envelope shapes:
a client request `{ id, host, method, params? }`, a server success
`{ id, host, ok: true, data? }`, a server error
`{ id, host, ok: false, error: { code, message } }`, and a server event
`{ host, event, payload }`. Every message SHALL carry the `host` it
concerns so the browser can distinguish which configured herdr host a
frame belongs to.

#### Scenario: Request is answered with a matching id
- **WHEN** the browser sends `{ id: "abc", host: "prod", method: "pane.list" }`
- **THEN** the bridge responds with either `{ id: "abc", host: "prod", ok: true, data: { panes: [...] } }` or an error response carrying the same `id` and `host`

#### Scenario: Events carry no request id
- **WHEN** the bridge pushes a `pane.agent_status_changed` event for a subscribed host
- **THEN** the frame has no `id` field and is shaped `{ host, event: "pane.agent_status_changed", payload }`

### Requirement: Board snapshot via `pane.list`
The bridge SHALL expose a `pane.list` method that, given a `host`, returns
every pane on that host projected into the tier-1 `Pane` shape (`id`,
`host`, `workspace: {id, name}`, `tab: {id, name}`, optional `title`,
optional `agent: {name}`, `agent_status`, optional
`last_output_snippet`).

#### Scenario: pane.list returns a full board snapshot for a host
- **WHEN** the browser calls `pane.list` for a connected host with panes
- **THEN** the response `data.panes` includes one entry per pane on that host, each with resolved workspace and tab names (not bare ids)

### Requirement: Live updates via `events.subscribe`
The bridge SHALL expose an `events.subscribe` method accepting
`{ kinds: EventKind[] }` that, for the three tier-1 kinds
(`pane.created`, `pane.closed`, `pane.agent_status_changed`), streams
matching events for that host as they occur, without requiring the
browser to re-poll `pane.list`.

#### Scenario: Subscribing to pane.created delivers new panes live
- **WHEN** the browser subscribes to `pane.created` for a host and a new pane starts on that host
- **THEN** the bridge pushes a `{ host, event: "pane.created", payload: { pane } }` frame without a further browser request

#### Scenario: Subscribing to pane.closed reflects removal
- **WHEN** a pane the browser has already seen via `pane.list` is closed on herdr
- **THEN** the bridge pushes a `{ host, event: "pane.closed", payload: { id, host, workspace: { id } } }` frame so the browser can drop that card

### Requirement: REST fallback mirrors the WebSocket contract
The bridge SHALL also expose `GET /api/hosts` (returning
`{ hosts: HostSummary[] }`), `GET /api/hosts/:host/panes` (returning
`{ panes: Pane[] }` in the same projected shape as `pane.list`), and
`GET /` (serving the SPA), so the board is reachable without an active
WebSocket connection.

#### Scenario: REST pane list matches WebSocket pane.list shape
- **WHEN** the browser calls `GET /api/hosts/prod/panes` for a host also queried via WebSocket `pane.list`
- **THEN** both responses contain `Pane` objects with identical field shapes for the same underlying panes

### Requirement: Tier-1 excludes terminal and lifecycle actions
The bridge SHALL NOT expose pane terminal I/O, pane creation/closing
commands, layout operations, or plugin actions to the browser as part of
this capability. Kanban board read/subscribe access only.

#### Scenario: No terminal-write method is exposed
- **WHEN** the browser inspects the set of methods the bridge documents for tier-1
- **THEN** it contains only `pane.list` and `events.subscribe` (plus the REST fallback endpoints), with no method that sends input to a pane or mutates herdr state
