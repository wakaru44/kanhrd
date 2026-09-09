# ADR-0004: Full-snapshot terminal output via bridge-side polling

Status: Accepted
Date: 2026-09-09

## Context

Tier 2 needs live terminal output for the pane behind a clicked card.
herdr's public `Method::EventsSubscribe` surface (`Subscription` enum,
`src/api/schema/events.rs:16-85` in the herdr repo) has no "push me this
pane's output as it changes" primitive. `EventKind::PaneOutputChanged`
exists internally but has no requestable `Subscription` variant — it's
excluded from `PLUGIN_HOOK_EVENT_KINDS` as "high volume" and is not public
plumbing. The nearest requestable primitive, `Subscription::PaneOutputMatched`,
fires once per line matching a caller-supplied regex and is designed for
agent automation ("wait for this text to appear"), not a continuous
content-delta stream a terminal UI can render frame-by-frame.

## Decision

The bridge polls `pane.read` for each subscribed `(host, pane_id)` at a
configurable cadence (`outputPollIntervalMs`, default 150ms), tracks the
last-seen `revision` per subscription, and pushes a `pane.output` WS event
only when `revision` advances (herdr's own monotonic counter on
`PaneReadResult` — a cheap, correct dedup key with no bridge-side hashing).
One poll in flight per subscription at a time; multiple browser connections
subscribed to the same `(host, pane_id)` share one poll loop and fan out the
same event, rather than each running an independent poll against herdr.

`pane.output.content` is always the current full snapshot at the
subscribed `source`/`format`, never a delta. Clients render it with
`term.reset(); term.write(content)` per event.

## Alternatives considered

- **A. Wait for herdr to add a public push subscription** — rejected: an
  unbounded blocker outside this project's control.
- **B. Reconstruct incremental deltas by re-parsing terminal escape
  sequences bridge-side** — rejected: `pane.read` already returns rendered
  content from herdr's own libghostty-vt-parsed grid state, not raw PTY
  bytes. Independently re-deriving cursor position, scroll region, and
  wrapped-line reflow to compute a diff duplicates libghostty-vt's job
  fragilely, for no benefit over just re-rendering the snapshot.
- **C. Use `pane.output_matched` with an "always true" regex as a
  poor-man's stream** — rejected: wrong semantics (a one-shot automation
  trigger, not a content stream) and likely to be rate-limited by design.

## Consequences

- Update latency is bounded by the poll interval, not truly event-driven —
  clients should present "live within `outputPollIntervalMs`," not assume
  sub-poll-interval freshness.
- Per-terminal herdr cost is one `pane.read` per subscription per interval;
  see `docs/OPERATING.md` for the laptop-only cost note.
- Multiple browser tabs viewing the same pane share one poll loop, keeping
  cost independent of viewer count.
- A future herdr push event for pane output would trivially replace this
  loop without any client-visible wire change — `pane.output`'s shape
  (full snapshot + `revision`) already matches what a push event would
  deliver.
- A future bridge-side optimization could line-diff two `visible`-source
  snapshots and send only changed rows; that's a bridge-internal efficiency
  improvement, not a wire-shape change, and is explicitly deferred rather
  than built speculatively now.
