# Reconcile panes that die without a herdr `pane.closed`

## Why

A pane can leave herdr three ways: closed through kanhrd (`pane.close`),
closed from herdr's own CLI/TUI, or the process inside it simply exiting
(shell `exit`, the agent finishing, a crash). Only the first is
client-initiated. For the other two the bridge depends entirely on herdr
pushing `pane.closed` — and when that push does not arrive, nothing else
in the system ever notices.

`HostRuntime.pollAgentStatus()` already sees the disappearance: it polls
`pane.list` every 5s and, since the pane is no longer in the list, drops
its own bookkeeping entry for it. It emitted no event. The browser was
therefore never told, so the board kept a card for a session that no
longer exists, the terminal view kept painting its last output, and the
output poller kept polling a dead pane forever.

The operator reports this as "the UI freezes" — the view is alive but
describes nothing real.

## What Changes

- The `pane.list` poll becomes a reconciliation, not just a status diff:
  a tracked pane absent from the list is reported gone with a synthesized
  `pane.closed` frame, in the same shape herdr's own push produces.
- The diff is taken against the pane set snapshotted *before* the request,
  so a pane created while the request was in flight is never falsely
  reported closed.
- No change to the wire shape, to the subscription spec set, or to the
  herdr event subscription's stability. Nothing resubscribes.

## Impact

- Affected specs: `tier-1-kanban`
- Affected code: `apps/bridge/src/herdr/hosts.ts`

## Not done

The detail view (`/pane/:host/:id`) still has no "this session is gone"
state: with the fix the pane leaves the store, but `PaneViewState` has no
member for it and the terminal keeps its last painted frame. Naming that
state needs copy and a design decision, so it is left for a maintainer.
