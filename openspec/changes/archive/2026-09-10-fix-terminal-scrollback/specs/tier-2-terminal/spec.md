## MODIFIED Requirements

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

A subscription that does not name a `source` SHALL be polled at
`source: "recent"` — viewport **plus scrollback** — the same default the
bridge already applies to a one-shot `pane.read`. Because `pane.output`
carries a full snapshot that the client paints over the whole terminal,
polling at a narrower source than the initial read deletes the pane's
scrollback on the first poll; the live stream and the first paint SHALL
describe the same pane. A caller that wants the cheaper viewport-only
stream SHALL get it by passing `source: "visible"` explicitly.

#### Scenario: Output changes are pushed without browser re-polling
- **WHEN** a subscribed pane's content changes between two bridge polls
- **THEN** the bridge pushes exactly one `pane.output` event carrying the new `revision` and full current `content`, without the browser having called `pane.read` again

#### Scenario: Unchanged content produces no event
- **WHEN** two consecutive polls of a subscribed pane return the same `revision`
- **THEN** the bridge pushes no `pane.output` event for that poll cycle

#### Scenario: A subscription with no requested source carries scrollback
- **WHEN** the browser calls `pane.subscribe_output` with only `{ pane_id }`
- **THEN** the bridge polls that pane at `source: "recent"`, so every pushed snapshot carries the pane's scrollback and not just its viewport

#### Scenario: An explicitly requested source is honoured
- **WHEN** a caller subscribes with `source: "visible"`
- **THEN** the bridge polls that pane at `visible`, unchanged by the default above

#### Scenario: Unsubscribing stops the poll loop
- **WHEN** the browser calls `pane.unsubscribe_output` for an active `subscription_id`, or the owning WebSocket connection closes
- **THEN** the bridge stops polling that pane on behalf of that subscription promptly, and shares/keeps polling only if another subscriber still needs the same `(host, pane_id)`
