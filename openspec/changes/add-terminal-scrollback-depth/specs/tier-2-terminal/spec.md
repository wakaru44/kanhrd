## MODIFIED Requirements

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
frame as the first frame of every subscription, and SHALL send a full frame
whenever a delta would not be smaller.

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

#### Scenario: Unsubscribing stops the poll loop

- **WHEN** the browser calls `pane.unsubscribe_output` for an active `subscription_id`, or the owning WebSocket connection closes
- **THEN** the bridge stops polling that pane on behalf of that subscription promptly, and shares/keeps polling only if another subscriber still needs the same loop
