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

## What depth costs on the live stream

`pane.output` stays a full snapshot on every change, polled at
`OUTPUT_POLL_INTERVAL_MS` (150 ms). The snapshot's size follows the depth:
~1.2 KB at herdr's 80-line default, ~2.7 KB at 200 lines, ~13 KB at 1000
(measured above, on plain `seq` output — SGR-heavy agent output is larger).
A pane whose content changes on every poll ships that much up to ~6.5
times a second, per open terminal.

So the default is **250**: about three times what herdr sent before, and a
fifth of the ceiling. 500 and 1000 stay reachable — an operator who picks
1000 has chosen that cost for the terminals they open; the risk worth
guarding is a deep default applied to everyone. The cost is not in the
settings copy: bandwidth is not the operator's vocabulary.

Making a deep default affordable — line-delta `pane.output` frames — is
its own change. It alters `pane.output`'s contract, gives the poller
per-subscriber state, and amends ADR-0004's shared-fan-out and
"never a delta" decisions, none of which a depth setting should carry.

### Known limit: a shared loop keeps its first shape

The poller shares one loop per host and pane, and the first subscriber's
`source` and `format` already win that loop (`poller.ts`). `lines` joins
them: a second browser at a different depth on the same pane receives
snapshots at the first browser's depth. With one operator — the common
case — every subscription for a pane asks for the same depth, so nothing
changes. Keying loops by shape as well, and giving up the loop sharing
ADR-0004 chose, belongs with the delta change above.

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

Steps: 250, 500, 1000; default 250. The maximum is
`HERDR_READ_LINE_CEILING`. The settings note interpolates the same
constant, so a herdr that lifts the cap moves the control and the copy
together.

xterm's client-side `scrollback` stays at 5000. Appended suffixes
accumulate past the requested depth between redraws, so the client buffer
still earns its size.
