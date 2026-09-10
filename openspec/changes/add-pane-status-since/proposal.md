## Why

The card's elapsed readout does not measure what it claims. It shows the
time since the **Card component was constructed**, so every card on the
board shows the same number and every one resets to zero on every visit
to the board.

Observed on the live board: `5s` → `26s` → `44s` → `1m` in lockstep
across all cards, then `13s` for every card after a reload. A pane that
genuinely changed status mid-session read the same value as its
untouched neighbours.

`card.ts` initialises `statusSince = signal(Date.now())` as a field
initialiser — component construction time — and only advances it if the
status changes while that instance is mounted. `Board` is remounted on
every navigation, and `cdkVirtualFor` recycles card views, so the value
resets constantly.

The documentation asserts something stronger than the code does.
`docs/DESIGN-SYSTEM.md` line 437 and `card.ts`'s own comment both say the
readout is "observed client time since the status was **first seen by
this client**". It is not; it is since the component mounted.
`docs/UX-GUIDELINES.md` line 650 lists "fabricated data for decoration —
a server-sounding duration" as a review reject, which this arguably is
today.

### There is no timestamp to read

This was checked, not assumed. herdr's `PaneInfo`
(`packages/schema/src/herdr.ts:85-95`) carries `pane_id`,
`workspace_id`, `tab_id`, `label`, `agent`, `title`, `display_agent`,
`agent_status`, `revision` — and no time field of any kind. No
`created_at`, no `changed_at`, no activity clock. Nothing else in the
herdr surface exposes one.

The bridge, however, **already computes the transition**. `pollAgentStatus()`
(`apps/bridge/src/herdr/hosts.ts:499-522`) polls `pane.list` and diffs
each pane's `agent_status` against a `paneAgentStatus` map, emitting a
synthetic `pane.agent_status_changed` when it differs. The bridge is the
first component in the system that knows a transition happened. It is
also long-lived, shared by every connected browser, and survives page
reloads — which is exactly what the SPA cannot do.

So the observation belongs in the bridge. Putting it in `PanesStore`
instead was considered and rejected: it would survive board remounts but
still reset on reload, leaving a three-day-old pane reading "2m" after a
refresh — a smaller lie, still a lie, and harder to reason about than
the current obvious one.

## What Changes

- The bridge records, per host and pane, **when it first observed the
  pane's current `agent_status`**, and re-stamps it on every transition
  it detects.
- `Pane` gains an optional `status_since` (epoch milliseconds, the
  bridge's clock). Optional because a bridge that has just started has
  not observed a transition for panes it found already in a status — see
  the honesty requirement below.
- The card renders a real duration derived from `status_since`, and
  renders nothing where the bridge cannot vouch for one.
- The two documentation lines that overstate the current behaviour are
  corrected to describe what is actually guaranteed.

This is a **wire-contract change**, which the neo-shepherd redesign
explicitly excluded ("No bridge, wire-contract, or capability-flag
changes"). That is why it is its own change rather than a fix inside
that one.

## Honesty constraints

These are the point of the change; a fast implementation that ignores
them reintroduces the original defect in a more convincing disguise.

1. **It is bridge-observed, not herdr-authoritative.** herdr does not
   report when a status began. The value means "since this bridge first
   saw this pane in this status", and no copy or doc may imply
   otherwise.
2. **It resets when the bridge restarts.** A bridge that starts and
   finds a pane already `working` does not know when that began.
3. **Absent beats wrong.** When the bridge cannot vouch for a value, it
   omits `status_since` and the card renders no duration. A missing
   readout is honest; a zero is a fabrication.
4. **Resolution is one poll interval.** The bridge learns of transitions
   by polling, so the value is accurate to that cadence, not to the
   millisecond it is expressed in.

## Impact

- Affected specs: `pane-status-since` (new). Touches `tier-1-kanban`'s
  `Pane` shape by addition only.
- Affected code: `apps/bridge/src/herdr/hosts.ts` (the existing
  `paneAgentStatus` map becomes status + observation time),
  `packages/schema/src/herdr.ts` and `wire.ts`,
  `apps/web/src/app/board/card.ts`, `apps/web/src/app/util/clock.ts`.
- Affected docs: `docs/DESIGN-SYSTEM.md` (card meta row),
  `docs/UX-GUIDELINES.md` if it describes the readout.
- Backwards compatible: an older bridge omits the field and the card
  renders no duration, which is the same path as a bridge restart.
