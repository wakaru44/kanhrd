# Design — add-pane-gone-state

The five questions `proposal.md` left open were decided by the maintainer
on 2026-09-13. This records what was decided and why, so nobody has to
re-derive it.

## 1. Copy

One string, `state.gone`, beside `state.stale` and `state.unavailable`:

> `the session ended. this is the last thing it said.`

It states the fact and explains the frozen frame in the same breath, so the
operator is not left wondering whether the output is live. It implies no
recovery, which `docs/BRAND.md` forbids. Its register matches its
neighbours (`this host is out of sight.`). The approved-copy row in
`docs/BRAND.md` mirrors `copy.ts`.

## 2. The last frame stays, dimmed to `--opacity-inert` (0.45)

The frozen frame stays on screen. A finished agent's last output is often
the reason the operator opened the pane, so clearing it would throw away
the thing they came for.

The dimming is not decoration. A full-contrast terminal reads as a live
terminal, and `docs/UX-GUIDELINES.md` (_Reliability states tell the truth_)
does not allow a live-looking surface over a session that has ended. The
dimming is what stops the frozen frame lying.

It is `opacity` on `.terminal-container` itself, not a translucent layer
laid over it: no extra element, no extra render cost, and the thing that
is inert is the thing that looks inert. The state box in the
terminal-status area is a sibling of the container and stays at full
contrast.

0.45 was chosen by the operator from rendered specimens at 1.0 / 0.6 /
0.45 / 0.3 on both themes: plainly inert while the last output stays
readable. It is a named, theme-independent token, `--opacity-inert`, in
`shared/tokens.scss`, named for what it means rather than where it is used.
There was no precedent for statically dimming a surface, and
`--paper-scrim` cannot be borrowed: it is a modal / drawer backdrop that
always sits behind a raised surface, which this is not.
`docs/DESIGN-SYSTEM.md` gains the token under _Colour usage rules_.

## 3. Icon: `LucideSunset`

The twenty-second icon, added to `docs/DESIGN-SYSTEM.md` first. A sunset is
a natural close rather than a failure, which is what this state is, in the
care register the brand asks for.

Ruled out, so they are not re-proposed:

- **`LucideMoonStar`** — the runner-up; collides with `LucideMoon`, the
  sumi theme toggle.
- **`LucideUnplug`** — means the host is unreachable and is already used by
  `stale` and `unavailable`. Here the host is connected and healthy;
  reusing it would send the operator to check their network.
- **`LucideArchive`** — implies the session is filed and retrievable, which
  `docs/BRAND.md` forbids.

## 4. Actions: `back to the board`, nothing else

No `try again`: there is nothing to retry and the button would lie. No
next-card action either: the top bar already carries the next-card
control for anyone who wants to keep moving.

## 5. Reused pane ids: no defence needed

Settled by citation. herdr's own agent documentation (`herdr --skill`)
states:

> "Closed tab and pane IDs are not reused. A pane moved into another
> workspace receives a new workspace-qualified pane ID."

So `/pane/:host/:id` can never silently resolve to a different session, and
the gone state does not need to hold against a later `pane.created`
carrying the same id.

## How gone is derived

- `PaneDetail` remembers the route key whose pane it has seen in
  `PanesStore` while the host was in sight (`seenKey`). Moving to another
  pane resets it.
- `gone` = that key was seen, and the pane is no longer in the store. A cold
  deep link has never seen the pane, so it stays `loading`.
- A disconnected host outranks `gone` and shows `unavailable`. The store
  never drops panes on a host disconnect (`releaseDroppedPanes`), so a lost
  host cannot produce `gone` in the first place.
- Entering `gone` calls `PaneTerminal.end()`: the `pane.output`
  subscription is torn down with `pane.unsubscribe_output` (ending the
  bridge's poll loop for the pane), and from then on input, reloads,
  retries and a subscribe that lands late are all refused for that pane.
  The buffer is left as it is. Loading a different pane lifts it.
- `gone` is final for the route: a later reconnect of the socket does not
  re-read the pane.
