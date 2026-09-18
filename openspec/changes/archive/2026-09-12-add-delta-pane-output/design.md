# Design — add-delta-pane-output

## Measurement

herdr **0.8.2**, throwaway `kanhrd-test-*` session, raw herdr socket. One
pane, polled at 150 ms at three depths in parallel (no `lines`, 250, 1000);
a frame is counted only when the content changed, as the poller does. The
delta column runs the prototype algorithm below over the 1000-line frames,
adding 40 bytes per frame for the descriptor, and falls back to the full
frame when that is not smaller. Each pane first printed 1500 lines of
history so every depth was truncated.

| pane                                                 | depth     | frames | KB/s | bytes/frame | full fallbacks |
| ---------------------------------------------------- | --------- | ------ | ---- | ----------- | -------------- |
| streaming: `echo` every 50 ms, 10 s                  | 80 full   | 66     | 14.3 | 2223        | —              |
|                                                      | 250 full  | 63     | 29.2 | 4744        | —              |
|                                                      | 1000 full | 64     | 86.0 | 13762       | —              |
|                                                      | 1000 Δ    | 64     | 2.1  | 335         | 0 / 63         |
| status line: `\r\033[K` rewrite every 100 ms, 8 s    | 80 full   | 51     | 6.1  | 975         | —              |
|                                                      | 250 full  | 50     | 18.4 | 3015        | —              |
|                                                      | 1000 full | 50     | 73.3 | 12015       | —              |
|                                                      | 1000 Δ    | 50     | 1.9  | 306         | 0 / 49         |
| full redraw: `\033[H\033[2J` + 31 rows every 150 ms  | 80 full   | 44     | 4.1  | 768         | —              |
|                                                      | 250 full  | 43     | 14.8 | 2815        | —              |
|                                                      | 1000 full | 44     | 63.4 | 11802       | —              |
|                                                      | 1000 Δ    | 44     | 3.1  | 572         | 0 / 43         |
| `top -s 1`, alternate screen, 8 s                    | all       | 7      | 2.7  | 3159        | 6 / 6          |

Reading it:

- Where history sits above a changing region — streaming output, a status
  line, a redraw on the primary screen — the delta is the changed rows
  only, and depth stops mattering: 1000 lines as deltas cost less than
  herdr's 80-line default did as full frames.
- On the alternate screen `recent` is the screen alone, depth is
  irrelevant, and every row changes. Every frame falls back to full, at
  exactly the full-frame cost. The fallback rule is what keeps the worst
  case equal to today rather than worse.
- Coding agents are in the primary-screen rows, not the `top` row. Read
  against live Claude Code and Codex panes (see the proposal): `lines:
  1000` returns 999 and 829 rows against 21- and 48-row viewports, so their
  output accumulates in herdr's scrollback like the redraw pane's.

## The delta

`next === previous.slice(drop, drop + keep) + content`, `next.length ===
length`.

Split both snapshots on `\n`. For each line `k` of `previous` equal to the
first line of `next`, extend the common run `p` over whole lines (a kept
line must end in `\n` in both). Take the `k` that keeps the most
characters: `drop` is the offset of line `k`, `keep` the length of the run.
Stop early once a run reaches the end of `previous`, since nothing further
down can keep more.

Before sending, the bridge checks `next.startsWith(previous.slice(drop,
drop + keep))` and sends the full frame if that ever fails. It also sends
the full frame when `content.length` plus the descriptor is not smaller
than the snapshot. So the delta is exact by construction and verified by
check; repeated lines (blank rows, borders) can only change which exact
delta is chosen, never make one wrong. This is why a shallow live stream
behind a deep first paint was rejected in `add-terminal-scrollback-depth`:
the client, unlike the bridge, does not hold the text the stream was
diffed against, so it would have to guess.

Cost: at 1000 lines the candidate scan is bounded by the lines of
`previous` equal to `next`'s first line. A screen of identical rows is the
worst case, O(n²) string compares over 1000 lines, once per changed poll —
low milliseconds. The helper is pure and benchmarked in its unit tests.

## Per-subscriber state

Today every subscriber of a loop receives the identical event. With
deltas, one subscriber may need a full frame while another takes a delta,
so the encoding becomes per subscriber while the snapshot stays per loop:

- The loop keeps `lastContent`, the snapshot it last sent.
- Each subscriber keeps `primed`: whether it has received `lastContent`.
- On a change, the delta against `lastContent` is computed once. A primed
  subscriber that asked for deltas gets it; everyone else gets the full
  frame. Then every subscriber is primed.

Every change is sent to every subscriber, so a primed subscriber has
always received exactly `lastContent`. One bit per subscriber is therefore
enough; no per-subscriber copy of the snapshot is kept. A subscriber that
joins mid-stream is unprimed, receives a full frame on the next change,
and takes deltas after that — the late join is an ordinary path, not a
recovery.

The dedup key moves from `lastContentHash` to `lastContent` itself (the
hash exists only to compare; the delta needs the text anyway).

## Loops keyed by shape

A loop is shared by subscriptions with the same host, pane, `source`,
`format` and `lines`. `delta` does not split a loop. Two browsers watching
one pane at different depths now run two `pane.read` loops against herdr
instead of one — the cost ADR-0004 avoided — and in exchange each receives
the snapshot it asked for. One operator in one browser, the common case,
still runs one loop per pane.

## Client

`PaneTerminal` subscribes with `delta: true`. On a frame with `delta`, it
rebuilds `lastSnapshot.slice(drop, drop + keep) + content`; if the result's
length is not `length`, it logs and re-runs `load()` for the pane in view
instead of painting. The rebuilt snapshot goes through `paint()` as a full
snapshot does today, so append detection, the `RIS` redraw, the scrolled-up
reader and the truncation line are untouched.

## ADR-0004

Amended with a dated block after the existing 2026-09-11 amendment, not
rewritten in place:

- "never a delta" → full snapshots by default; a subscription may opt in
  to verified line-delta frames;
- "fan out the same event" → fan out the same snapshot, encoded per
  subscriber;
- one loop per `(host, pane_id)` → one loop per `(host, pane_id, source,
format, lines)`;
- the deferred line-diff paragraph assumed `visible` snapshots and called
  the optimisation "not a wire-shape change"; the diff runs on `recent`
  and is on the wire.

## The default depth

`add-terminal-scrollback-depth` set the default to 250 against full-frame
cost. On the same measurements, per open terminal on a busy pane:

| default                   | streaming | status line | redraw    |
| ------------------------- | --------- | ----------- | --------- |
| before: 250, full frames  | 29.2 KB/s | 18.4 KB/s   | 14.8 KB/s |
| after: 1000, delta frames | 2.1 KB/s  | 1.9 KB/s    | 3.1 KB/s  |

The deeper default costs 7–14× less than the shallower one did, so the
default becomes the ceiling. An alternate-screen pane costs the same at
either default.
