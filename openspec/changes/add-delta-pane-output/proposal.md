## Why

Two problems, one cause: `pane.output` is one full snapshot, fanned out
identically to every subscriber of a loop keyed by host and pane.

**A deep depth multiplies the live payload.** `add-terminal-scrollback-depth`
defaulted to 250 lines although herdr serves 1000, because the poller
(`apps/bridge/src/output/poller.ts`) pushes the whole snapshot on every
content change and a busy pane changes on nearly every 150 ms poll.
Measured against herdr 0.8.2 in an isolated session (method and per-frame
numbers in `design.md`):

| pane                                         | 80 full   | 250 full  | 1000 full | 1000 delta | fell back to full |
| -------------------------------------------- | --------- | --------- | --------- | ---------- | ----------------- |
| streaming output, a line every 50 ms         | 14.3 KB/s | 29.2 KB/s | 86.0 KB/s | 2.1 KB/s   | 0 of 63           |
| status line rewritten every 100 ms           | 6.1 KB/s  | 18.4 KB/s | 73.3 KB/s | 1.9 KB/s   | 0 of 49           |
| screen cleared and redrawn every 150 ms      | 4.1 KB/s  | 14.8 KB/s | 63.4 KB/s | 3.1 KB/s   | 0 of 43           |
| `top`, a full-screen TUI on the alternate screen | 2.7 KB/s  | 2.7 KB/s  | 2.7 KB/s  | 2.7 KB/s   | 6 of 6            |

That is per open terminal, for as long as it is open — the storm class
this repo already paid for once (`58c7624`,
`fix-bridge-subscription-backlog-storm`). As deltas, 1000 lines cost less
than herdr's own 80-line default did as full frames.

The alternate-screen row is the honest limit. A TUI that owns the
alternate screen has no scrollback in `recent`, so depth does nothing for
it, and it repaints every row, so every delta falls back to a full frame.
It gains nothing and loses nothing: the fallback costs exactly what a full
frame costs today. What the delta pays for is output above a changing
region on the primary screen — streaming logs, a status line, a redraw
under retained history. Whether a given coding agent's TUI renders inline
or on the alternate screen was not measured here; that decides which row
an agent falls in.

**A second browser at a different depth gets the first one's.** Recorded
in the backlog (_A second browser at a different scrollback depth gets the
first one's_): loops are keyed by host and pane because ADR-0004 (lines
29-31) shares one loop and one event across every subscriber, so the first
subscriber's `lines` wins. Delta frames break "one event for everyone"
anyway — a subscriber needs a full frame before its first delta — so the
keying is settled here, together.

## What Changes

### Opt-in line-delta frames

`pane.subscribe_output` gains `delta?: boolean`. A subscription that
passes it may receive `pane.output` frames carrying
`delta: { drop, keep, length }`, where `content` is only the new tail and
the snapshot is exactly `previous.slice(drop, drop + keep) + content`.

- The bridge holds the previous snapshot it sent, so the delta is computed
  against exact text — never inferred on the client — and verified
  character for character before it is sent. `drop` and `keep` are cut at
  line boundaries.
- A delta is sent only when it is smaller than the full frame. On the
  alternate screen (`top`, full-screen TUIs) `recent` carries no history and
  every row changes: all such frames fall back to full (6 of 6 measured), at
  no extra cost.
- A subscriber that does not pass `delta` sees `pane.output` exactly as
  today.

### Per-subscriber priming and the late joiner

A subscriber's first `pane.output` is always a full frame: its first paint
came from its own `pane.read`, not from the loop's previous snapshot. The
poller therefore keeps one bit per subscriber — _has it received the
loop's current snapshot_ — and sends a full frame to any subscriber that
has not. A browser that joins a running loop mid-stream gets a full frame
on the next change, then deltas. The client still checks the rebuilt
`length` and re-reads the pane if it disagrees, as a guard against a bug,
not as the late joiner's path.

### Loops are keyed by shape

A loop is shared only by subscriptions with the same host, pane, `source`,
`format` and `lines`; whether a subscriber takes deltas does not split a
loop, because the encoding is per subscriber. This closes the backlog entry
above, and costs a second `pane.read` loop against herdr when two browsers
watch one pane at different depths.

### The SPA takes deltas

`PaneTerminal` subscribes with `delta: true`, rebuilds each snapshot from
its `lastSnapshot`, and hands the result to `paint()` unchanged — append
detection, `RIS` redraws, the reader's scroll position and the truncation
line keep working on full snapshots, as they do now.

### ADR-0004 amended

ADR-0004 gains a dated amendment in the form of its existing one. It
narrows "never a delta" to full by default with delta opt-in; restates
"fan out the same event" as the same snapshot, encoded per subscriber;
records that loops are shared per shape, not per pane; and names the two
wrong claims in its deferred line-diff paragraph — that it would diff
`visible`-source snapshots only, and that it would not change the wire.

## Impact

- **Affected specs:** `tier-2-terminal` — MODIFIED (_Live pane content via
  bridge-side polling_: `delta` on subscribe and on `pane.output`,
  per-subscriber full first frame, loops keyed by shape).
- **Affected wire:** `pane.subscribe_output` params gain `delta`;
  `pane.output` gains an optional `delta` descriptor. Additive and opt-in.
- **Affected code:** `packages/schema/src/wire.ts`,
  `apps/bridge/src/output/poller.ts` plus a pure line-delta helper and its
  tests, `apps/web/src/app/pane-detail/pane-terminal.ts` and its spec.
- **Affected docs:** `docs/adr/0004-full-snapshot-terminal-output-via-polling.md`
  (amendment).
- **No change to:** the poll cadence, `pane.read`, the truncation line, or
  how `paint()` renders a snapshot.
- **Open for the maintainer:** whether to raise the default depth to 1000
  once this ships. It is a one-line change to
  `DEFAULT_TERMINAL_SCROLLBACK` and deliberately not part of this change.
- **Not measured:** a live coding agent (none could be run inside the
  isolated session). An agent that renders inline behaves like the
  status-line and redraw rows; one on the alternate screen behaves like
  `top` and gains nothing from this change. Checking which is which is the
  first thing to do if the numbers need confirming before building.
