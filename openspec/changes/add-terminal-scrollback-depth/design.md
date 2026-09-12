# Design — add-terminal-scrollback-depth

## What herdr actually serves

Measured against herdr **0.8.2**, in a throwaway `kanhrd-test-*` session
(never the operator's socket), over the raw herdr socket so the reply is
herdr's and not the bridge's. The ceiling below is tied to that version: a
herdr that lifts it leaves kanhrd pinned at 1000 until
`HERDR_READ_LINE_CEILING` in `state/terminal-scrollback.service.ts` is
re-measured and moved.

Pane seeded with `seq -f "LINE-%06g" 1 30000`. herdr's own pane info
reported `scroll.max_offset_from_bottom: 12147` — the pane held about 12k
lines of history.

| request (`source: recent`) | lines returned | chars (`ansi`) | `truncated` | latency |
| -------------------------- | -------------- | -------------- | ----------- | ------- |
| no `lines`                 | 80             | 1154           | true        | ~105 ms |
| `lines: 200`               | 200            | 2714           | true        | ~105 ms |
| `lines: 2000`              | 1000           | 13114          | true        | ~105 ms |
| `lines: 20000`             | 1000           | 13114          | true        | ~105 ms |
| `lines: 100000`            | 1000           | 13114          | true        | ~105 ms |

- `format: text` returns the same line counts (12031 chars at 1000).
- `source: recent_unwrapped` returns the same line counts.
- `source: visible` ignores `lines`: always the viewport (39 rows),
  `truncated: false`.
- Latency is flat at ~105 ms whatever the depth; it is not depth-driven.

So herdr **caps `lines` at 1000 server-side**, even though the pane holds
twelve times that. The default of 80 is the bug the proposal describes;
1000 is a ceiling kanhrd cannot raise.

`truncated` is honest at the boundary. A pane with 990 lines of output
(plus its prompt): `lines: 500` → true; `lines: 990` → true; `lines: 1000`
→ false; `lines: 1001` → false. A 50-line pane is `truncated: false` at
every depth including the default.

`pane.subscribe_output` is not a herdr method — the bridge polls
`pane.read` — and before this change neither its wire params nor the
poller carried `lines`. Its snapshots were therefore the no-`lines` row
above: 80 lines, `truncated: true` on any pane with more history, whatever
the first paint asked for.

herdr's `ansi` snapshot is SGR-only: no cursor positioning, no erase
sequences, rows joined by `\r\n`. That fact decides the notice's rendering
below.

## Depth must not multiply the live payload

The poller pushes on every change at `OUTPUT_POLL_INTERVAL_MS` (150 ms),
and before this change every push was the whole snapshot. Moving the
stream from 80 lines to 1000 multiplies each push by ~12 — 13 KB per
change on a busy pane, per open terminal, for as long as it is open. This
repo has paid for a bridge event storm once already (`58c7624`,
`fix-bridge-subscription-backlog-storm`).

Three options were weighed.

**(a) Deep first paint, shallow live stream.** Rejected. A shallow tail
cannot be placed against a deep first paint without guessing where the two
overlap, and a terminal is full of repeated lines — blank rows, TUI
borders, repeated log lines — so the guess is sometimes wrong. A wrong
guess is wrong content on screen, which `docs/UX-GUIDELINES.md` ranks
below absent. The only non-guessing alternative is to let the shallow push
repaint, which deletes the history the first paint delivered — the exact
hazard `wire.ts` documents above `pane.subscribe_output`.

**(b) Stream at the operator's depth, send deltas.** Taken, made opt-in.
The bridge is the one party that holds, exactly, the previous snapshot it
sent on a subscription. So it can describe the next snapshot as
`previous.slice(drop, drop + keep) + tail`, cut at line boundaries, and
**verify** that reconstruction character for character before sending it.
Nothing is inferred on the client; it applies arithmetic to text it
already holds and checks the resulting `length`. Covered cases:

- appended output below the ceiling — `drop: 0`, `keep` = everything, tail
  = new lines;
- the window sliding at the ceiling — `drop` = the lines that scrolled off,
  tail = the new lines;
- a redraw of the bottom region (an agent TUI's input box, a status line)
  — `keep` = the unchanged rows above it, tail = the redrawn rows.

Anything else (`clear`, a full-screen TUI, a reflow) produces a delta no
smaller than the snapshot, and the frame goes out full. The first frame on
every subscription is full, so a subscriber never depends on a frame it
did not receive. A subscriber that does not pass `delta: true` receives
exactly what it did before.

The client check is cheap insurance, not a recovery path the design relies
on: the WebSocket is ordered and reliable, and the bridge verified the
delta. If the rebuilt length ever disagrees, the terminal re-reads the
pane rather than render something it cannot vouch for.

Poll loops are now keyed by host, pane, `source`, `format` and `lines`.
Before, the first subscriber's shape won the shared loop — harmless while
every caller sent the same shape, wrong the moment two operators pick
different depths.

**Payload, before and after.** _Measured numbers land here with task 3.4._

## The notice lives in the buffer

When `truncated` is true the terminal writes one line, in SGR dim, as the
first row of the buffer, ahead of the snapshot. It is re-prepended on every
full repaint (a redraw writes `RIS` and the whole snapshot, which would
otherwise wipe it) and dropped on the first complete snapshot.

Why in the buffer rather than a DOM line over the terminal:

- **It is where the missing history would be.** A reader who scrolls to
  the top meets the statement at the point the history stops; a DOM strip
  sits at the top of the viewport and says it about whatever is on screen.
- **It is safe to prepend.** herdr's snapshot carries no cursor
  positioning, so one extra leading row shifts nothing and cannot be
  overwritten. The append path compares against the raw snapshot, not the
  written text, so the notice never breaks append detection.
- **No new surface.** A DOM overlay needs positioning against xterm's
  scroll engine, its own touch handling under the terminal's claimed
  vertical axis, and a design-system component the docs do not define.

The cost, accepted: the line is terminal text. It is inside the selection
region, it lands in xterm's scrollback, and an operator who selects all and
copies the terminal gets a kanhrd-authored line that reads like program
output. It names herdr and the line count, so a pasted copy is still
self-describing, and it appears only on a buffer that is already missing
its start — a copy of that buffer is incomplete either way, and the line
says so. If that trade stops holding, the DOM route is open; nothing else
in this design depends on the choice.

The dim rendering uses the terminal palette's own foreground, not a design
token: xterm does not read CSS custom properties.

## Defaults and steps

Steps: 250, 500, 1000. The maximum is `HERDR_READ_LINE_CEILING`. The
settings note interpolates the same constant, so a herdr that lifts the cap
moves the control and the copy together. The default is decided once the
payload numbers are in (see the proposal's _Decided_ line).

xterm's client-side `scrollback` stays at 5000. Appended suffixes
accumulate past the requested depth between redraws, so the client buffer
still earns its size.
