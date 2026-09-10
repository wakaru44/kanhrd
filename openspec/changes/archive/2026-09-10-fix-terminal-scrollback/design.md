# Design — terminal scrollback survives live polling

## Finding 1: the diagnosis holds, and it is a source mismatch

Three facts, each read from source rather than inferred:

| Where | What it asks for | herdr's meaning |
| --- | --- | --- |
| `pane-detail.ts` initial `pane.read` | `source: "recent"` | viewport **+ scrollback** (`packages/schema/src/herdr.ts`, `ReadSource`) |
| `HerdrHost.paneRead` default (`apps/bridge/src/herdr/hosts.ts`) | `params.source ?? "recent"` | same |
| `OutputPoller.subscribe` (`apps/bridge/src/output/poller.ts`) | `source ?? "visible"` | **viewport only**, `cols x rows` |

The SPA's `pane.subscribe_output` passed no `source`, so the poller's
`"visible"` default applied to every live subscription. `pane.output` is a
FULL snapshot the client paints with `term.reset(); term.write(content)`
(ADR-0004, and `handleOutputEvent`). So the sequence on any pane with
history was: paint scrollback → ~150ms later, `reset()` → paint one
screenful. The 5000-line `scrollback` on the xterm instance was never the
problem; it was being emptied on a timer.

Verified in a real browser rather than argued: pushing a viewport-only
frame behind a `recent` initial read collapses the reachable history to
exactly that one screenful (`visibleOnlyControl.topLineReachable`, below).

The diagnosis was also **incomplete in one way that matters**. Fixing only
the source gives a reader 5000 lines of history and still yanks them to the
bottom several times a second, because `reset()` is unconditional. The
user's complaint — "tough to read output like a long table" — is only
answered when both are fixed. Hence two changes, not one.

## Finding 2: which of the two fixes, and why both

The brief's question was: does the poller switch to `recent`, does the
client stop resetting, or both? Both, but they solve different halves and
neither substitutes for the other.

- **Poller → `recent` alone.** History arrives, and a scrolled-up reader is
  still thrown to the bottom on every frame. Necessary, not sufficient.
- **Client stops resetting alone.** Nothing to preserve: the frames still
  carry one screenful, so an append-only client would concatenate
  screenfuls into nonsense, or fall back to a repaint that loses history
  anyway. Not viable on its own.

### The poller default, not a new parameter

`source` is already on `pane.subscribe_output`'s wire shape and already
documented. The change is one word — the default becomes `"recent"`,
matching what `HerdrHost.paneRead` already defaults a one-shot read to. The
cheap viewport-only stream stays available to any caller that asks for it
by name. **No schema change**: `packages/schema/src/herdr.ts` and
`wire.ts` already describe everything this needs, so neither is touched.

### The client: append fast path, then anchored repaint

ADR-0004 stays intact — the wire still carries full snapshots, the bridge
still has no delta protocol, and its "clients render it with `reset();
write()`" line remains the correct fallback. What changes is that the
client recognises the case where a repaint is unnecessary:

1. **Append.** `content.startsWith(lastSnapshot)` — a program printing more
   lines. Write only the suffix. No reset, so scrollback is never cleared,
   and xterm.js already leaves a scrolled-up viewport alone when rows
   arrive at the bottom. This is the overwhelming majority of frames.
2. **Redraw.** Anything else (vim, htop, `clear`, a width reflow). Keep
   `reset(); write()`, but capture `buffer.active.viewportY` first and
   restore it in `write`'s completion callback — unless
   `viewportY >= baseY` (the reader was at the bottom), where following the
   tail is exactly what they want.

This is a client-local rendering decision, not a protocol one: nothing
about it is visible on the wire, and deleting it degrades to today's
behaviour rather than breaking. ADR-0004 needs no amendment.

**Known ceiling, named rather than hidden:** the redraw anchor is an
absolute line index. If herdr trims its own scrollback between two
snapshots, the new snapshot is no longer a prefix (so we take the redraw
path) and the restored anchor is off by however many lines were trimmed.
The upgrade path — anchor on a content fingerprint of the top row instead
of an index — costs more than it buys until someone reports drift on a
pane long enough to hit herdr's own scrollback cap.

## Payload and cost, measured

Measured against the built bundle in headless Chromium (harness in the
lane report; ANSI lines of a realistic coloured table, 58 bytes/line
measured, not assumed):

| Snapshot | Bytes | At the 150ms default poll |
| --- | ---: | ---: |
| 400-line pane (typical) | 23,092 (23 KB) | ~154 KB/s |
| 5000-line pane (client buffer full) | 293,893 (287 KB) | ~1.96 MB/s |
| viewport only (41 rows, the old behaviour) | ~2.4 KB | ~16 KB/s |

Render cost, same harness: a full 5000-line redraw completed in **26ms**
end-to-end (push → the last line on screen), against a 150ms poll budget;
the append path measured **28ms** for one line, which is the harness's own
round-trip floor rather than a real difference — the honest reading is
"both are well inside one poll interval, and the redraw of a full buffer is
the worse of the two."

That worst case is real but bounded, by four things that already exist:

1. **Change dedup.** The bridge pushes nothing when the content hash and
   revision are unchanged (`poller.ts`), so an idle pane costs zero bytes
   on the wire regardless of source.
2. **herdr's own scrollback.** `recent` is viewport + herdr's retained
   scrollback for that pane, not an unbounded log.
3. **One loop per `(host, pane_id)`.** Cost is independent of how many
   browsers are watching.
4. **One pane at a time.** Only the pane on `/pane/:host/:id` is
   subscribed; the board does not subscribe to output.

1.96 MB/s is the cost of a pane whose full 5000-line buffer changes on
every single poll — a pane scrolling continuously at full speed, over
loopback or a LAN to a laptop, which is the deployment ADR-0004 and
`docs/OPERATING.md` already scope. That is worth the scrollback. If it ever
stops being worth it, the two upgrade paths are already sketched and
neither needs a wire change: pass `lines` on the poll (herdr's
`PaneReadParams.lines` exists and `HerdrHost.paneRead` already forwards
it) to cap a snapshot at the client's 5000-line buffer, or take ADR-0004's
explicitly-deferred bridge-side line diff. Neither is built now, on the
same reasoning ADR-0004 gave for deferring the second one: no evidence yet
that it is needed.

## Alternatives rejected

- **Client-side only: keep `visible` polls and re-`pane.read` at `recent`
  on some interval.** Two sources of truth for one terminal, a second
  request per pane, and a visible seam where the two disagree. The poller
  is the one place that decides what "live" means; it should decide it once.
- **Bridge-side line diff now (ADR-0004's deferred option C).** Solves
  payload, not the reader's scroll position, and re-derives terminal
  semantics the client already has. Deferred, still.
- **Suppress the repaint while the reader is scrolled up.** Freezes the
  pane's content behind their back, then jumps on release. The append path
  gives them live output *and* their place at the same time.
- **`scrollback` above 5000 on the xterm instance.** The buffer was never
  the constraint; it was being reset.
