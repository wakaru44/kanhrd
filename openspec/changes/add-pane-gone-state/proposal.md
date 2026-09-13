## Why

`fix-dead-pane-reconciliation` made the bridge notice a pane that dies
without a herdr push: the `pane.list` poll now synthesizes `pane.closed`,
and the pane leaves the board. Its own _Not done_ section leaves the other
half open: the pane detail view (`/pane/:host/:id`) has no state for a
session that has ended.

What the operator sees today, checked in the code:

- `PaneViewState` (`apps/web/src/app/pane-detail/pane-detail.ts`) is
  `loading | failed | unavailable | stale | empty | live`. Nothing in it
  describes a pane that no longer exists.
- The view reads the pane from `PanesStore`, but its state comes from
  `PaneTerminal.state()` and host connectivity. When the pane leaves the
  store, neither changes.
- The output poller skips failed reads silently (`poller.ts`), so the
  subscription stays confirmed and the view keeps reporting **`live`** over
  the last frame it painted. Keystrokes still go out as `pane.send_text` /
  `pane.send_keys` and fail into a `console.warn`.
- The subscription keeps the bridge polling `pane.read` for a pane that is
  gone, for as long as the view stays open.

That is worse than absent: `docs/UX-GUIDELINES.md` (_Reliability states
tell the truth_) does not allow a live marker over a session that has
ended. It is the "the UI freezes" report from the other side.

## What Changes

- Pane detail gains a **gone** reliability state: the pane was in the
  store for this host and has left it while the host is connected.
- In that state the view stops the live subscription (so the bridge's poll
  loop for the pane ends), stops relaying input, and shows the state in the
  terminal-status area in place of `live`, with a way back to the board.
- The state is never inferred from a pane that simply has not been
  discovered yet (a cold deep link before the first `pane.list`), and never
  from a disconnected host — that stays `unavailable`.

## Decisions this needs from a maintainer

All five were decided by the maintainer on 2026-09-13; `design.md` records
the answers and the reasoning.

1. **Copy.** None exists. At least a state line, keyed under `state.*`
   beside `state.stale` and `state.unavailable`. `docs/BRAND.md` puts this
   squarely in care territory (a lifecycle moment) and also forbids any
   phrasing that implies recovery: the session ended and cannot be brought
   back. No string is proposed here, deliberately.
2. **The last frame.** Keep it on screen, marked as no longer live, or
   clear it. Keeping it is likely what an operator wants — a finished
   agent's last output is often the reason they opened the pane — but it is
   a design call, and it must not read as `stale — reconnecting`, which
   promises a reconnection that will not come.
3. **Icon.** None of the twenty-one icons in `docs/DESIGN-SYSTEM.md` names an
   ended session. `LucideUnplug` means a lost host and would mislead. Either
   the state has no icon, or a twenty-second is added to the design system
   first.
4. **Actions.** `back to the board` at minimum. Whether it also offers the
   next card in the tab (the top bar already has one) is open. It must not
   offer `try again`: there is nothing to retry.
5. **A reused pane id.** If herdr hands the same id to a new pane, the URL
   would resolve to a different session. `docs/UX-GUIDELINES.md` (_URL is
   state_) says never silently resolve to something else. Whether herdr
   reuses pane ids is unverified; it decides whether the gone state must
   also hold against a later `pane.created` with the same id.

## Impact

- **Affected specs:** new capability `pane-gone-state`.
- **Affected code:** `apps/web/src/app/pane-detail/pane-detail.{ts,html,scss}`,
  `pane-terminal.ts` (stop and refuse input), `shared/copy.ts`.
- **Affected docs:** `docs/BRAND.md` (copy rows), `docs/UX-GUIDELINES.md`
  (the reliability-state table gains a row), possibly
  `docs/DESIGN-SYSTEM.md` (icon).
- **No change to:** the bridge or the wire. `pane.closed` already reaches
  the store for all three ways a pane ends.
