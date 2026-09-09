## Why

The bridge is broadcasting a continuous storm of phantom
`pane.created`/`pane.closed`/`tab.created`/`tab.closed` lifecycle events for
ids that no longer exist on herdr (verified live: a fresh WS subscribed to
lifecycle events saw hundreds of hours-old events for panes/tabs within 12
seconds, while herdr itself was steady-state — 7 panes, 6 tabs, no churn).

Root cause, verified against both the bridge source and the herdr source at
the version the shared dev bridge is actually running (`herdr 0.8.2`,
released 2026-08-19):

1. `HostRuntime.establishSubscription()` (`apps/bridge/src/herdr/hosts.ts`)
   includes one `{ type: "pane.agent_status_changed", pane_id }` spec per
   currently-known pane, because herdr's `Subscription::PaneAgentStatusChanged`
   variant has a mandatory (non-optional) `pane_id` field — there is no
   wildcard/global agent-status subscription. Confirmed by reading
   `Subscription` in the herdr repo's `src/api/schema/events.rs` directly:
   `PaneAgentStatusChanged { pane_id: String, agent_status: Option<AgentStatus> }`.
   `ActiveAgentStatusChangedSubscription` in `src/api/subscriptions.rs` is
   likewise built from a required `pane_id`, not an alternative
   pane-id-free form — so the "subscribe once, no pane_id" option some prior
   diagnoses assumed does not exist on any herdr version.
2. Because that spec set depends on the live pane-id set, `HostRuntime`
   rebuilds (tears down and reopens) its one persistent herdr subscription
   connection on every `pane.created`/`pane.closed`/cascading tab or
   workspace close (`scheduleResubscribe()`), debounced by only 250ms.
3. herdr `0.8.2` computes a fresh subscription's starting point incorrectly:
   confirmed by diffing herdr's own git history, commit `20a500a7 fix(api):
   start lifecycle subscriptions from live events (#3134)` (merged
   2026-08-23, **after** `v0.8.2` was tagged and **not** included in it) is
   the exact fix for this — before that commit, a new `events.subscribe`
   replays herdr's buffered event history instead of starting from "now".
   `v0.8.2` predates that fix, so every resubscribe on the currently-running
   herdr replays its backlog to the bridge.
4. The bridge forwards every replayed event verbatim to every browser
   WS client subscribed to that host, showing hours-old phantom
   create/close churn for ids that no longer exist.
5. Compounding: forwarded phantom `pane.created`/`pane.closed` events
   themselves call `scheduleResubscribe()` again, so the backlog-replay
   cycle can retrigger itself under active churn.

This is user-visible right now: the kanhrd SPA shows continuous fake board
churn that has nothing to do with the real herdr state.

## What Changes

- `HostRuntime` no longer sends per-pane `pane.agent_status_changed` specs
  and no longer rebuilds its herdr subscription in response to
  pane/tab/workspace lifecycle events. It opens one subscription — covering
  only the global (pane-id-free) lifecycle kinds — at connect time and only
  reopens it on an actual socket-level disconnect. This removes the
  resubscribe-storm trigger entirely, independent of which herdr version is
  on the other end.
- Agent-status delivery to the browser moves to a bridge-side poll loop over
  `pane.list`, diffing each known pane's `agent_status` and emitting a
  synthetic `pane.agent_status_changed` bridge-event on change. This mirrors
  the polling-synthesis pattern tier-2's `pane.output` (`OutputPoller`)
  already uses for a herdr push gap — the browser-facing
  `events.subscribe`/`pane.agent_status_changed` wire contract is unchanged;
  only the bridge's internal delivery mechanism changes from
  "one push subscription per known pane" to "one poll loop per host".
- Removes the subscribe-time per-pane `pane_not_found` retry/pruning
  machinery (`subscribeWithPaneRecovery`, `stalePaneIdFromError`) and the
  `RESUBSCRIBE_DEBOUNCE_MS` resubscribe-coalescing machinery, since the
  herdr subscription no longer depends on the live pane-id set and so can
  never race against a pane closing out from under it.
- Adds an integration regression test asserting that a fresh WS subscription
  to lifecycle events against a steady-state herdr produces zero events in
  the first several seconds (the storm's live symptom).
- **Not changed**: the L3C round-4 client-side workaround in
  `apps/web/src/app/state/panes.store.ts` for `tab.renamed`/
  `workspace.renamed` not being observed for same-session resources. That
  symptom (a missing event) is unrelated to this storm (excess/duplicate old
  events) and this change does not touch `apps/web/**` or alter how
  `tab.renamed`/`workspace.renamed` subscriptions are built — both were
  already unconditional global-kind subscriptions before this change. The
  integration test suite (`apps/bridge/integration/lifecycle.test.ts`,
  D1+D2) will show empirically whether removing the resubscribe churn also
  happens to clear that symptom; the client-side workaround stays in place
  either way pending confirmation on a live herdr instance.

## Impact

- Affected code: `apps/bridge/src/herdr/hosts.ts`,
  `apps/bridge/src/herdr/hosts.test.ts`,
  `apps/bridge/integration/lifecycle.test.ts`.
- Affected specs: `tier-1-kanban` (clarifies that `pane.agent_status_changed`
  delivery MAY be bridge-side polling synthesis, and that the bridge's herdr
  subscription connection SHALL be stable across pane/tab/workspace
  lifecycle churn).
- No wire-contract change: `events.subscribe`, event shapes, and
  `bridge.capabilities` are unaffected. No `packages/schema/**` changes.

## Verification caveat

`apps/bridge/integration/*.test.ts` (`pnpm test:int`) defaults to the local
herdr socket (`~/.config/herdr/herdr.sock`) with no isolation from whatever
is actually running there. On this dev machine that turned out to be the
*user's own actively-used* herdr instance — running the suite creates real
throwaway tabs/panes the user can see. Verification for this change relies
on unit tests (fake sockets, no real herdr) plus a deterministic storm
reproduction (`HostRuntime — resubscribe-cascade storm reproduction` in
`hosts.test.ts`: a fake herdr that floods every `events.subscribe` call with
a 1000-event backlog-replay burst; asserts no second subscribe and no event
duplication). A live storm-verification smoke test against an idle herdr is
left to whoever deploys this change. A follow-up lane should add an
isolated/fake-herdr fixture for `pnpm test:int` so it stops depending on
whatever the developer's local herdr happens to be doing.
