## Why

> "I can't scroll in the terminal, it's tough to read output like a long
> table."

The scrollback is not missing. It is painted, and then thrown away a few
hundred milliseconds later, by kanhrd's own live-update path.

1. The initial paint asks for history. `pane-detail.ts` calls `pane.read`
   with `source: "recent"` — herdr's "viewport **+ scrollback**"
   (`packages/schema/src/herdr.ts`, `ReadSource` doc). The first frame
   genuinely contains the pane's history.
2. The live poller asks for the viewport only. `apps/bridge/src/output/poller.ts`
   builds its poll entry with `source: source ?? "visible"` — herdr's
   "exactly the on-screen viewport (cols x rows)". The SPA's
   `pane.subscribe_output` call passes no `source`, so every poll of every
   pane runs at `visible`. (The bridge's own `HerdrHost.paneRead` defaults
   to `"recent"`; the poller is the one place that overrides that default
   downward, and its own comment admits the branch was never exercised:
   "untested in practice since L3B always requests the same (visible,
   ansi) defaults; revisit".)
3. Every `pane.output` event does `term.reset(); term.write(content)`
   (`pane-detail.ts`, `handleOutputEvent`) — the handling ADR-0004
   prescribes for a full-snapshot protocol.

Net: first paint = history; first poll ≈150ms later = viewport-only
snapshot, written into a freshly `reset()` terminal. The 5000-line
`scrollback` on the xterm instance is correctly configured and stays
empty. A second, independent defect rides along: even with history
present, `reset()` on every frame drops the reader to the bottom several
times a second, so a long table cannot be read while the pane is live.

Both are client-visible symptoms of one thing — the live path is not
equal to the initial path, and the repaint is unconditional.

## What Changes

**ADR-0004 stands.** Output stays a full snapshot pushed on change; no
delta protocol, no wire-shape change, no schema change.

### Bridge — the poll reads what the client reads

`OutputPoller` defaults an unspecified subscription source to `"recent"`
instead of `"visible"`, matching `HerdrHost.paneRead`'s own default and
the SPA's initial `pane.read`. A caller that wants the cheap
viewport-only stream still gets it by passing `source: "visible"`
explicitly; the default stops being a silent downgrade of the first
frame's fidelity.

### Client — the SPA asks for what it wants, out loud

`pane.subscribe_output` is called with `source: "recent", format: "ansi"`
rather than relying on either side's default, so the live stream and the
initial read are visibly the same request in one file.

### Client — the repaint stops destroying the reader's place

`handleOutputEvent` gains two cheap behaviours, in order:

- **Append fast path.** The snapshot is compared with the last one; when
  the new content starts with the old (the overwhelmingly common case —
  a program appending lines), only the suffix is written. No `reset()`,
  no repaint, no scroll disturbance at all: xterm.js already holds a
  viewport that is scrolled up when new rows arrive at the bottom.
- **Anchored repaint.** When the snapshot is not an append (a
  full-screen redraw: vim, htop, `clear`), the old `reset(); write()` is
  kept, but the viewport's absolute line offset is captured before and
  restored after — unless the reader was already at the bottom, in which
  case following the tail is what they asked for.

## Impact

- **Affected specs:** new capability `terminal-scrollback`; MODIFIED
  requirement `Live pane content via bridge-side polling` in
  `tier-2-terminal` (the subscription's default source).
- **Affected code:**
  - `apps/bridge/src/output/poller.ts` (+ `poller.test.ts`)
  - `apps/web/src/app/pane-detail/pane-detail.ts` (+ `pane-detail.spec.ts`)
- **No change to:** `packages/schema/**` (both `source` fields already
  exist on the wire and are already documented), any wire method, any
  capability flag, `docs/**`, ADR-0004.
- **Cost:** each poll of a subscribed pane now carries the pane's
  scrollback rather than its viewport. Measured and bounded in
  `design.md` ("Payload"); the bound that already exists — herdr's own
  scrollback limit, the bridge's change-dedup, and the client's 5000-line
  buffer — is quantified there rather than assumed.
- **Risk:** low and reversible in one word (`"recent"` → `"visible"`).
  The append fast path is a pure optimisation of a path that still has
  its unconditional fallback underneath it.
- **Migration:** none. No storage, no preference, no persisted state.
