# tier-2-terminal Specification

## Purpose
Lets a user click a pane's kanban card and get a live, interactive terminal
for that pane directly in the browser — see its output, type into it,
paste text — without attaching to the herdr host manually. Extends the
tier-1 bridge envelope; does not replace or modify it.
## Requirements
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
format?, lines?, delta? }` → `{ subscription_id }`) and
`pane.unsubscribe_output` (`{ subscription_id }` → `{}`). While a
subscription is active, the bridge SHALL poll that pane's content with
`pane.read` at the subscription's `source`, `format` and `lines`, and push a
`pane.output` event (`{ subscription_id, pane_id, revision, content,
format, truncated, delta? }`) whenever the observed `revision` increases or
the content changes, deduplicating polls that return neither. The bridge
SHALL NOT claim or require a herdr-native push event for this — polling is
the specified mechanism, not an implementation detail left open.

A subscription that does not name a `source` SHALL be polled at
`source: "recent"` — viewport **plus scrollback** — the same default the
bridge already applies to a one-shot `pane.read`. Because `pane.output`
describes the whole snapshot the client paints over the terminal, polling
at a narrower source or a smaller `lines` than the initial read deletes the
pane's scrollback on the first poll; the live stream and the first paint
SHALL describe the same pane. A caller that wants the cheaper viewport-only
stream SHALL get it by passing `source: "visible"` explicitly. A
subscription that names no `lines` is polled without one, at herdr's
default depth.

Subscriptions SHALL share a poll loop only when they agree on host,
`pane_id`, `source`, `format` and `lines`, so a subscriber never receives a
snapshot shaped by another subscriber's request.

By default every `pane.output` carries the full snapshot in `content`. A
subscription that passes `delta: true` MAY instead receive **line-delta
frames**: `delta: { drop, keep, length }` with `content` holding only the
new tail, where the full snapshot is exactly
`previous.slice(drop, drop + keep) + content` and has `length` characters,
`previous` being the full snapshot of the frame before it on that
subscription. The bridge SHALL verify that reconstruction before sending a
delta, SHALL cut `drop` and `keep` at line boundaries, SHALL send a full
frame to any subscriber that has not yet received the snapshot the delta
is computed against — its first frame, including a subscriber that joined
a loop already running — and SHALL send a full frame whenever a delta
would not be smaller.

#### Scenario: Output changes are pushed without browser re-polling

- **WHEN** a subscribed pane's content changes between two bridge polls
- **THEN** the bridge pushes exactly one `pane.output` event carrying the new `revision` and the current content (full, or as a verified delta for a subscription that asked for one), without the browser having called `pane.read` again

#### Scenario: Unchanged content produces no event

- **WHEN** two consecutive polls of a subscribed pane return the same `revision` and the same content
- **THEN** the bridge pushes no `pane.output` event for that poll cycle

#### Scenario: A subscription with no requested source carries scrollback

- **WHEN** the browser calls `pane.subscribe_output` with only `{ pane_id }`
- **THEN** the bridge polls that pane at `source: "recent"`, so every pushed snapshot carries the pane's scrollback and not just its viewport

#### Scenario: An explicitly requested source is honoured

- **WHEN** a caller subscribes with `source: "visible"`
- **THEN** the bridge polls that pane at `visible`, unchanged by the default above

#### Scenario: A requested depth is forwarded to herdr

- **WHEN** a caller subscribes with `lines: 500`
- **THEN** every poll for that subscription calls herdr's `pane.read` with `lines: 500`

#### Scenario: Two depths never share a loop

- **WHEN** two callers subscribe to the same pane, one with `lines: 250` and one with `lines: 1000`
- **THEN** each receives snapshots polled at its own depth

#### Scenario: A delta frame rebuilds the snapshot exactly

- **WHEN** a subscription with `delta: true` has received a frame and the pane's next snapshot appends lines or slides its window
- **THEN** the next frame carries `delta`, and applying it to the previous snapshot yields the new snapshot character for character

#### Scenario: A subscriber that did not ask for deltas never gets one

- **WHEN** a subscription omits `delta`
- **THEN** every `pane.output` it receives carries the full snapshot and no `delta`

#### Scenario: The first frame is always full

- **WHEN** a subscription with `delta: true` receives its first `pane.output`
- **THEN** that frame carries the full snapshot and no `delta`

#### Scenario: A late joiner is primed before it gets a delta

- **WHEN** a second subscription with `delta: true` joins a loop that has already pushed frames to a first one, and the pane then changes twice
- **THEN** on the first change the first subscriber receives a delta and the second a full snapshot, and on the second change both receive a delta

#### Scenario: A delta that would not be smaller is sent full

- **WHEN** every row of a delta subscriber's pane changes between two polls, as a full-screen TUI on the alternate screen repaints
- **THEN** the frame carries the full snapshot and no `delta`

#### Scenario: Unsubscribing stops the poll loop

- **WHEN** the browser calls `pane.unsubscribe_output` for an active `subscription_id`, or the owning WebSocket connection closes
- **THEN** the bridge stops polling that pane on behalf of that subscription promptly, and shares/keeps polling only if another subscriber still needs the same loop

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

