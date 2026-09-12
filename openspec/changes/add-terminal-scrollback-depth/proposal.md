## Why

A full agent report does not fit in the scrollback kanhrd shows, so the top
of it cannot be read. Three facts, each checked in the code:

- **We never ask for a depth.** `pane-terminal.ts:245` sends
  `{ format: 'ansi', source: 'recent' }` and no `lines`, and the bridge
  passes `pane.read` params through untouched (`ws/dispatch.ts:154-165`).
  herdr's `PaneReadParams` HAS a `lines` field
  (`packages/schema/src/herdr.ts:381`). So the window is whatever herdr
  defaults to — 80 lines, measured — and kanhrd has never stated a
  preference.
- **The live stream cannot ask for one either.** `pane.subscribe_output` is
  not a herdr method: the bridge implements it by polling `pane.read`
  (`apps/bridge/src/output/poller.ts`), and neither its wire params nor the
  poller carry `lines`. Every live snapshot is herdr's 80-line default,
  whatever the first paint asked for — the hazard `wire.ts` already
  documents one field over: "a stream polled at a narrower source than the
  first paint deletes that pane's scrollback on the first push". A
  narrower `lines` does the same.
- **We ignore the flag that says it was cut.** `HerdrPaneReadResult` carries
  `truncated` (`herdr.ts:399`). Nothing in the SPA reads it, so a
  cut-off buffer looks exactly like a short one — the reader cannot tell
  whether the top of the report is above the scroll or was never sent.
- **The client buffer is not the binding constraint.** xterm is configured
  with `scrollback: 5000` (`pane-terminal.ts:166`). A snapshot that
  arrives with 200 lines leaves 4800 of those unused; raising 5000 alone
  would change nothing.

So the depth is decided by a parameter we do not send, and the truncation
is reported by a field we do not read.

## What Changes

### Ask for a depth, and make it the operator's

`pane.read` and `pane.subscribe_output` both carry an explicit `lines`,
from one place, so the first paint and every later snapshot agree (the
`terminal-scrollback` capability already requires `source` and `format` to
agree; `lines` joins them). `pane.subscribe_output` gains `lines` on the
wire and the poller forwards it. The depth is a setting beside the
terminal's text size and palette, which are already per-operator and
already persist under `kanhrd.*` — it is the same kind of preference and
belongs in the same place rather than being a constant a reader cannot
reach. Its maximum is herdr's own ceiling: herdr 0.8.2 serves at most 1000
lines however many are asked for (see `design.md`).

### Don't let depth multiply the live payload

The poller pushes the whole snapshot on every change, at 150ms. Taking the
stream from 80 lines to 1000 makes every push ~12× larger, per open
terminal, for as long as it is open. So a subscription may opt in to
**line-delta frames**: the bridge, which holds the previous snapshot it
sent, pushes only what changed plus enough to rebuild the full snapshot
exactly — never an approximation. The first frame to every subscriber, and
any frame a delta would not shrink, stays a full snapshot. The client
checks the rebuilt length and re-reads the pane if it ever disagrees. A
subscriber that does not opt in sees `pane.output` exactly as today.
`design.md` records why this beats a shallow stream behind a deep first
paint.

### Say when the buffer was cut

When herdr replies `truncated: true`, the terminal says so at the head of
the buffer, in one quiet line — not a toast (it is a state, not an event)
and not silence (`docs/UX-GUIDELINES.md`: reliability states tell the
truth; absent beats wrong, but a truncation that looks like a short
session is wrong). The reader learns that the start of the report is not
above them, and what to change.

### First, measure what herdr actually gives

The cheap explanation is "we never asked". It may not be the whole
explanation: herdr may cap `lines` server-side, or `recent` may be bounded
by the pane's own history rather than by the request. Task 1 is therefore a
measurement against the isolated test session — request 200, 2000 and
20000 lines from a pane with known output and record what comes back,
including `truncated`. If herdr caps below what an agent report needs, the
honest outcome is a documented ceiling rather than a setting that promises
depth herdr will not serve, and the setting's maximum becomes that ceiling.

## Impact

- **Affected specs:** `terminal-scrollback` — MODIFIED (the request
  agreement gains `lines`), ADDED (the depth is the operator's; a truncated
  buffer says so). `tier-2-terminal` — MODIFIED (`pane.subscribe_output`
  carries `lines` and may opt in to line-delta `pane.output` frames).
- **Affected wire:** `pane.subscribe_output` params gain `lines` and
  `delta`; `pane.output` gains an optional `delta` descriptor. Additive and
  opt-in — a caller sending neither sees no change. `pane.read` is
  unchanged (`lines` already existed there).
- **Affected code:** `packages/schema/src/wire.ts`,
  `apps/bridge/src/output/poller.ts` (+ a line-delta helper),
  `apps/bridge/src/ws/server.ts`, `apps/web/src/app/pane-detail/pane-terminal.ts`
  and `pane-detail.ts`, a new `state/terminal-scrollback.service.ts` in
  the shape of `terminal-font-size.service.ts`,
  `settings/settings.{ts,html}`, `shared/copy.ts`, `docs/BRAND.md` for the
  new strings, `docs/UX-GUIDELINES.md` for the truncation state, and
  ADR-0004, whose "never a delta" decision this narrows.
- **No change to:** the bridge's poller cadence, `source: 'recent'`, or
  xterm's client-side `scrollback: 5000` (appends accumulate past the
  requested depth between redraws, so the client buffer still earns it).
- **Decided:** the ceiling is herdr's (1000 lines on herdr 0.8.2, measured),
  so it is the setting's maximum. The default follows the measured live
  payload (`design.md`).
- **Not solved here:** a report longer than 1000 lines still does not fit.
  The truncation line states the ceiling plainly rather than implying a
  setting can fix that.
