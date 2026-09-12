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
frame costs today.

The coding agents kanhrd watches are not in that row. Read-only
`pane.read` against three live agent panes on the operator's own herdr
(foreman diagnostic, 2026-09-12; reads only, no input, not a test):

| pane   | agent       | `lines: 80` | `lines: 1000` | `visible` |
| ------ | ----------- | ----------- | ------------- | --------- |
| w6:pJD | Claude Code | 79 rows     | 999 rows      | 21 rows   |
| w6:pJG | Claude Code | 79 rows     | 999 rows      | 21 rows   |
| w6:pAS | Codex       | 80 rows     | 829 rows      | 48 rows   |

Both render inline on the primary screen and accumulate into herdr's
scrollback, far past their viewport. An agent's live pane is the
clear-and-redraw row — 63.4 KB/s full at 1000 lines, 3.1 KB/s as deltas,
no fallbacks — and its report lands in the scrollback depth exposes. This
check is answered; it does not need re-running.

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
loop keeps one `lastContent`; each subscriber keeps one bit — _has it
received `lastContent`_ — and any subscriber without it gets a full frame,
then deltas. No subscriber holds its own copy of the snapshot.

A browser that joins a running loop mid-stream is therefore an ordinary
path with no failure in it: it is unprimed, so its next frame is full.
The client's check of the rebuilt `length` is a guard against a bug in the
bridge or the client, and re-reads the pane if it ever trips. It is not how
a late joiner recovers, and on a correct bridge it never trips.

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
  tests, `apps/web/src/app/pane-detail/pane-terminal.ts` and its spec,
  `apps/web/src/app/state/terminal-scrollback.service.ts` (default).
- **Affected docs:** `docs/adr/0004-full-snapshot-terminal-output-via-polling.md`
  (amendment).
- **No change to:** the poll cadence, `pane.read`, the truncation line, or
  how `paint()` renders a snapshot.
- **Default depth rises to 1000.** 250 was chosen only because 1000-line
  full frames cost 63–86 KB/s. As deltas, 1000 lines cost 2.1–3.1 KB/s,
  less than the shipped 250-line default's 14.8–29.2 KB/s, so the ceiling
  becomes the default (foreman ruling, 2026-09-12, on these numbers).
- **Answered by live agents, not the isolated session:** whether coding
  agents render inline or on the alternate screen (inline — see Why).
