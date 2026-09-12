## MODIFIED Requirements

### Requirement: Live updates via `events.subscribe`
The bridge SHALL expose an `events.subscribe` method accepting
`{ kinds: EventKind[] }` that, for the three tier-1 kinds
(`pane.created`, `pane.closed`, `pane.agent_status_changed`), streams
matching events for that host as they occur, without requiring the
browser to re-poll `pane.list`. The bridge MAY synthesize
`pane.agent_status_changed` from its own internal polling of herdr rather
than a herdr push subscription (the same synthesis pattern already used
for tier-2's `pane.output`) — this is an internal delivery detail and
SHALL NOT change the event shape, timing model, or the browser's
"pushed, not polled" contract.

The bridge SHALL treat `pane.list` as the authority on which panes exist.
A pane the bridge has tracked that is absent from a subsequent
`pane.list` SHALL be reported to the browser as a `pane.closed` frame
even when herdr pushed no such event — a pane whose process exits on its
own, or that is closed outside kanhrd, produces no client-initiated call
and on some herdr builds no push either. The synthesized frame SHALL be
indistinguishable in shape from a pushed one, and SHALL be emitted at
most once per disappearance.

The bridge SHALL NOT report a pane closed merely because it was absent
from a `pane.list` snapshot taken before that pane existed.

The bridge's underlying connection(s) to herdr for these subscriptions
SHALL remain stable across pane, tab, and workspace lifecycle churn: the
bridge SHALL NOT tear down and re-establish its herdr event subscription
merely because a pane was created or closed. It MAY re-establish a
subscription after an actual socket-level disconnect from herdr.

#### Scenario: Subscribing to pane.created delivers new panes live
- **WHEN** the browser subscribes to `pane.created` for a host and a new pane starts on that host
- **THEN** the bridge pushes a `{ host, event: "pane.created", payload: { pane } }` frame without a further browser request

#### Scenario: Subscribing to pane.closed reflects removal
- **WHEN** a pane the browser has already seen via `pane.list` is closed on herdr
- **THEN** the bridge pushes a `{ host, event: "pane.closed", payload: { id, host, workspace: { id } } }` frame so the browser can drop that card

#### Scenario: A pane that dies without a herdr push is still reported closed
- **WHEN** a pane the bridge has tracked disappears from `pane.list` and herdr pushes no `pane.closed` for it
- **THEN** the bridge pushes exactly one `{ host, event: "pane.closed", payload: { id, host, workspace: { id } } }` frame for that pane, carrying the workspace it was last known to be in, and pushes no further frames for it on later polls

#### Scenario: Pane churn does not reset the lifecycle event stream
- **WHEN** panes are repeatedly created and closed on a host while a browser client is subscribed to lifecycle events
- **THEN** the bridge does not re-open its herdr event subscription connection as a result, and the browser receives exactly one `pane.created`/`pane.closed` frame per real herdr event — no duplicate or replayed frames for ids that no longer exist

#### Scenario: A steady-state host produces no phantom events
- **WHEN** a browser client subscribes to lifecycle event kinds for a host with no actual pane/tab/workspace activity
- **THEN** the bridge pushes zero events for that host until a real lifecycle change occurs
