## Why

A full agent report does not fit in the scrollback kanhrd shows, so the top
of it cannot be read. Three facts, each checked in the code:

- **We never ask for a depth.** `pane-terminal.ts:245` sends
  `{ format: 'ansi', source: 'recent' }` and no `lines`, and the bridge
  passes `params` through untouched (`ws/dispatch.ts:154-165`). herdr's
  `PaneReadParams` HAS a `lines` field (`packages/schema/src/herdr.ts:381`).
  So the window is whatever herdr defaults to, and kanhrd has never stated
  a preference.
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
agree; `lines` joins them). The depth is a setting beside the terminal's
font size and palette, which are already per-operator and already persist
under `kanhrd.*` — it is the same kind of preference and belongs in the
same place rather than being a constant a reader cannot reach.

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
  agreement gains `lines`), ADDED (a truncated buffer says so).
  Possibly `terminal-font-size`'s sibling settings requirement, if the
  control lands beside it.
- **Affected code:** `apps/web/src/app/pane-detail/pane-terminal.ts`,
  a new `state/terminal-scrollback.service.ts` in the shape of
  `terminal-font-size.service.ts`, `settings/settings.{ts,html}`,
  `shared/copy.ts`, `docs/BRAND.md` for the new strings.
- **No change to:** the wire contract (`lines` already exists in
  `HerdrPaneReadParams` and in the bridge's pass-through), the bridge's
  poller cadence, or `source: 'recent'`.
- **Open question for the maintainer:** the default depth, and whether the
  ceiling is kanhrd's or herdr's. Task 1 answers the second; the first is a
  product call once the measurement is in.
