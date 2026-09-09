## Purpose

Lets a user click a pane's kanban card and get a live, interactive terminal
for that pane directly in the browser — see its output, type into it,
paste text — without attaching to the herdr host manually. Extends the
tier-1 bridge envelope; does not replace or modify it.

## ADDED Requirements

### Requirement: Bridge advertises tier-2 capability without breaking tier-1 clients
The bridge SHALL expose a `bridge.capabilities` method returning
`{ tier, terminal, paneResize, paneGraphics, outputPollIntervalMs }`. A
tier-1 SPA, which never calls this method, SHALL continue to receive
unmodified tier-1 responses from a tier-2 bridge. A tier-2 SPA calling
`bridge.capabilities` against a tier-1 bridge SHALL receive an ordinary
`WsResponseError` (not a WebSocket disconnect), which it treats as "no
tier-2 support" and disables terminal detail view UI accordingly.

#### Scenario: Tier-2 SPA probes a tier-1-only bridge
- **WHEN** a tier-2 SPA sends `{ id, host, method: "bridge.capabilities" }` to a bridge that only implements tier-1
- **THEN** the bridge responds with `{ id, host, ok: false, error: {...} }`, the WebSocket connection stays open, and the SPA falls back to kanban-only UI for that connection

#### Scenario: Tier-1 SPA against a tier-2 bridge sees no behavior change
- **WHEN** a tier-1 SPA calls `pane.list` and `events.subscribe` against a tier-2 bridge
- **THEN** it receives responses and events in the exact tier-1 shapes, with no new required fields and no rejected requests

### Requirement: One-shot pane content via `pane.read`
The bridge SHALL expose a `pane.read` method that, given `{ pane_id,
source?, format?, lines?, strip_ansi? }` for a `host`, returns
`{ content, revision, truncated, format, source }` reflecting that pane's
current content at the requested (or defaulted) `source`/`format`.

#### Scenario: Default read includes scrollback and preserves color
- **WHEN** the browser calls `pane.read` with only `{ pane_id }` (no `source`/`format`)
- **THEN** the bridge defaults to `source: "recent"` and `format: "ansi"`, returning scrollback-inclusive, color-preserving content suitable for an initial xterm.js paint

### Requirement: Live pane content via bridge-side polling
The bridge SHALL expose `pane.subscribe_output` (`{ pane_id, source?,
format? }` → `{ subscription_id }`) and `pane.unsubscribe_output`
(`{ subscription_id }` → `{}`). While a subscription is active, the bridge
SHALL poll that pane's content and push a `pane.output` event
(`{ subscription_id, pane_id, revision, content, format, truncated }`)
whenever the observed `revision` increases, deduplicating polls that
return an unchanged `revision`. The bridge SHALL NOT claim or require a
herdr-native push event for this — polling is the specified mechanism, not
an implementation detail left open.

#### Scenario: Output changes are pushed without browser re-polling
- **WHEN** a subscribed pane's content changes between two bridge polls
- **THEN** the bridge pushes exactly one `pane.output` event carrying the new `revision` and full current `content`, without the browser having called `pane.read` again

#### Scenario: Unchanged content produces no event
- **WHEN** two consecutive polls of a subscribed pane return the same `revision`
- **THEN** the bridge pushes no `pane.output` event for that poll cycle

#### Scenario: Unsubscribing stops the poll loop
- **WHEN** the browser calls `pane.unsubscribe_output` for an active `subscription_id`, or the owning WebSocket connection closes
- **THEN** the bridge stops polling that pane on behalf of that subscription promptly, and shares/keeps polling only if another subscriber still needs the same `(host, pane_id)`

### Requirement: Pane input via `pane.send_keys` and `pane.send_text`
The bridge SHALL expose `pane.send_keys` (`{ pane_id, keys: string[] }` —
herdr key-name tokens, not a single string) and `pane.send_text`
(`{ pane_id, text: string }` — raw paste), both returning `{}` on success,
forwarding to herdr's `Method::PaneSendKeys`/`Method::PaneSendText`
unchanged in meaning.

#### Scenario: Typed keystrokes reach the pane
- **WHEN** the browser sends `pane.send_keys` with `{ pane_id, keys: ["ctrl+c"] }`
- **THEN** the bridge forwards it to herdr as `Method::PaneSendKeys` for that pane and returns a success response with empty `data`

#### Scenario: Pasted text reaches the pane
- **WHEN** the browser sends `pane.send_text` with `{ pane_id, text: "echo hi\n" }`
- **THEN** the bridge forwards it to herdr as `Method::PaneSendText` for that pane and returns a success response with empty `data`

### Requirement: `pane.resize` is defined but non-functional this tier
The bridge SHALL accept `pane.resize` (`{ pane_id, cols, rows }`) as a
valid, type-checked method call, and SHALL respond with an error rather
than a false success, because herdr has no public API to set a pane's PTY
dimensions from an external client. `bridge.capabilities.paneResize` SHALL
be `false`.

#### Scenario: Resize request is rejected, not silently ignored
- **WHEN** the browser calls `pane.resize` with valid `{ pane_id, cols, rows }`
- **THEN** the bridge responds with `{ ok: false, error: {...} }` rather than `{ ok: true }`, and the pane's actual terminal dimensions are unchanged

### Requirement: Graphics overlay methods are optional and separately gated
The bridge MAY expose `pane.graphics.info`, `pane.graphics.stream`, and
the `pane.graphics_frame` event as an optional capability, reported via
`bridge.capabilities.paneGraphics`. This capability SHALL NOT be required
for `bridge.capabilities.terminal` to be `true`, and its absence SHALL
disable only the graphics overlay UI, not the terminal detail view as a
whole. Because herdr's public `pane.graphics.*` methods push overlay
images INTO a pane rather than reading an agent's own rendered graphics
out of one, this capability SHALL NOT be described to users as "view what
the agent drew."

#### Scenario: Terminal view works with graphics capability absent
- **WHEN** `bridge.capabilities.paneGraphics` is `false`
- **THEN** the browser's terminal detail view still functions fully via `pane.read`/`pane.subscribe_output`/`pane.send_keys`/`pane.send_text`, with no graphics overlay panel shown

#### Scenario: Graphics frame binary correlation is unambiguous when implemented
- **WHEN** a bridge with `paneGraphics: true` pushes a `pane.graphics_frame` control frame without a `data_base64` field
- **THEN** exactly one binary WebSocket frame follows on the same connection before any other frame for that `subscription_id`, containing the announced `header.data_length` bytes
