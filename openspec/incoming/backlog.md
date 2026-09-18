# OpenSpec Incoming Backlog


## Parked columns are pinned right of the status columns

**Problem**

A parked column can only sit after `unknown`; it cannot be interleaved with
the status columns. They are all just columns, so the restriction is
arbitrary from the operator's side.

**Reproduction/current evidence**

`boardColumnRefs` in `apps/web/src/app/board/column.ts` concatenates the
status columns and then the parked ones, and `Board.columnSortPredicate`
(`index >= firstParkedIndex(...)`) refuses a drop left of the first parked
column. The only recorded reason is one sentence in
`openspec/changes/archive/2026-09-11-add-parked-columns/design.md`: the
board is read left to right by urgency and "a parked card is by definition
the one the operator has decided not to look at". That premise does not hold
— parking is used to group, not only to defer, and the `on agent activity`
exit rule exists precisely because a parked card can become urgent. The same
design section also asserted that a hidden status hides parked cards, which
was the defect fixed in `2ecdf61`.

**Expected behavior**

Column order is the operator's, across both kinds.

**Investigation/fix notes**

Needs one ordered list with an ordering key shared by both kinds, rather
than two arrays concatenated. Settle first whether status columns become
movable too: if they do, `STATUS_COLUMN_ORDER` (`working, blocked, idle,
done, unknown`, fixed by the tier-1 spec) becomes a default rather than a
rule, and that is a spec change. If they do not, the board has some columns
that move and some that do not, which is the confusing middle. The per-column
filter keys (`parked:<id>`, post-`2ecdf61`) and the mobile pager both follow
whatever list order they are given, so neither constrains the answer.

---

## Host management from the UI, writing the bridge's config

**Problem**

Adding a host means editing `kanhrd.config.yaml` by hand on the machine
running the bridge, then restarting it. The operator wants to manage hosts
from the product, with the UI and the file staying in agreement however
that is implemented.

**Reproduction/current evidence**

`apps/bridge/src/config.ts` reads the file once at startup
(`readConfigFile`) into `BridgeConfig.hosts`; nothing re-reads it and
nothing writes it. Settings renders the host list read-only and says so in
shipped copy: `settings.hostsNote` — "the host list is bridge-owned. to
add, remove or reconfigure a host, edit ... on the machine running the
bridge — this screen reads it, it never writes it."
(`apps/web/src/app/shared/copy.ts:300-302`). There is no HTTP or wire
method that mutates configuration; `apps/bridge/src/ws/dispatch.ts` only
proxies herdr methods.

**Expected behavior**

An operator adds, edits and removes hosts in the UI; the bridge's effective
host list and the file on disk match afterwards, without a manual restart.

**Investigation/fix notes**

This REVERSES a shipped product promise, so `settings.hostsNote` and
`docs/UX-GUIDELINES.md` change with it, not after it.

It is also a privilege change, and the threat model
(`docs/THREAT-MODEL.md`, ADR-0003 loopback default) has to be revisited
BEFORE the feature is designed, not after. Today a browser that reaches the
bridge can drive herdr sessions; afterwards it could change what the bridge
connects to. The documented Tailscale path (`make run-tailscale-serve`)
puts that surface on a network. Decisions the maintainer owes:

1. Is config writable at all, or does the UI produce a snippet the operator
   applies (a middle path that keeps the bridge read-only and still removes
   the hand-typing)?
2. If writable: only when bound to loopback? Behind an explicit
   `--allow-config-writes`? Never in the container image?
3. Reload semantics — re-read on write, watch the file, or restart? A host
   list that drifts from the file is worse than one that needs a restart.
4. What happens to a file the operator hand-edited with comments and
   anchors: does a UI write preserve them, or rewrite the file?
5. Does a config write need a confirmation, and is it audited anywhere?

**Verification/acceptance criteria**

- Adding a host in the UI makes it appear in the board without a manual
  restart, and the file on disk names it too.
- The file's comments and unrelated keys survive a UI write.
- With the bridge on a non-loopback bind, the write path behaves as the
  maintainer's decision above says (refused, or gated) and the UI states
  which.
- `settings.hostsNote` no longer claims the screen never writes.
- The threat model documents the new surface before the code ships.

---

## Remote hosts without hand-built SSH tunnels (ADR-0001 revisit)

**Problem**

"Remote host" is not a thing kanhrd does. A host is a LOCAL Unix socket
path (`HostConfig = { name, socket }`, `apps/bridge/src/config.ts:6-9`);
reaching another machine means the operator brings up an SSH tunnel that
lands that machine's socket on the bridge's box, with autossh or a systemd
unit (`docs/OPERATING.md:151-199`). The operator reports this as
cumbersome, and wants remote hosts declared the way ssh already declares
them.

**Reproduction/current evidence**

`docs/adr/0001-hub-bridge-ssh-tunnels.md` chose this deliberately: herdr
speaks only a local Unix socket, and its own remote transport
(`remote-client-bridge`) speaks a private bincode TUI wire gated by
`PROTOCOL_VERSION`, so building on it would couple kanhrd to herdr's
internal protocol. The ADR's own last line is the trigger being pulled
here: "Revisit if the operator ergonomics of setting up and maintaining
tunnels (autossh/systemd units per host) becomes a recurring blocker."

**Expected behavior**

An operator names a host that ssh already knows how to reach, picks a key
if one is needed, and kanhrd does the rest.

**Investigation/fix notes**

This is an ADR revisit, so it starts as a design document with options and
consequences, not as a feature:

- **Who owns the tunnel?** Today: nobody inside kanhrd, on purpose. If the
  bridge starts spawning `ssh`, it acquires process supervision, restart
  and backoff, host-key verification, and a new failure surface in the
  logs. That is the decision, and it is bigger than the UI on top of it.
- **Parsing `~/.ssh/config`:** do NOT hand-roll it (the operator's
  instruction, and `Include`, `Match`, negated patterns and percent
  expansions are why). Candidate library: `ssh-config` on npm. Evaluate
  licence, maintenance and whether it resolves `Include` before adopting.
  Read-only parsing is a much smaller step than tunnel ownership and could
  ship first: offer the operator the hosts ssh already knows, still
  requiring them to say what the socket path will be.
- **Key discovery** (the operator's suggestion: list files under `~/.ssh`
  and the project folder that contain `PRIVATE KEY`, names only) is a
  server-side enumeration of the operator's private keys, surfaced to a
  browser. Names only is still a disclosure to anyone who reaches the UI,
  and the documented Tailscale path puts that on a network. If it is built:
  loopback only, opt-in, names only, never contents, and never a path
  outside the directories the operator named.
- **Docker:** the container runs no ssh client today — the tunnel is made
  on the host and the container mounts the resulting socket
  (`docker-compose.yaml`, the commented `bridge-cloud` service). So a
  documented `~/.ssh` mount would document a capability that does not
  exist. The mount example (including how to point at one specific key,
  e.g. `- ~/.ssh/id_ed25519_cloud:/home/kanhrd/.ssh/id_rsa:ro`) belongs to
  whichever change gives the container a reason to hold a key, and ships
  with it.

**Verification/acceptance criteria**

- A written ADR revisit that either supersedes ADR-0001 or records why it
  stands, with the tunnel-ownership decision explicit.
- If read-only ssh-config parsing ships: a host whose `Host` block ssh
  resolves is offerable in kanhrd without the operator retyping its
  address, and a malformed or `Include`-heavy config degrades to "we could
  not read this" rather than to a wrong host.
- If tunnel ownership ships: a tunnel that drops is visible in the UI as a
  host state, restarts are bounded and logged, and host-key verification is
  not weakened to make it work.
- Any key-file listing is unreachable from a non-loopback bind, and the
  threat model says so.

## The web terminal's cursor is not where you are typing

**Problem**

In the pane-detail terminal the caret does not sit at the insertion point.
A cursor indicator is stuck at the bottom of the rendered content while
the actual editing position is somewhere else, so editing in the middle of
a line is done blind.

**Reproduction/current evidence**

Open any pane, type a line, then move back into it (arrow keys, `Ctrl+A`,
`Alt+B`) and edit. The visible caret does not follow.

The cause is structural rather than a styling slip, and it follows from
ADR-0004:

- Nothing on the wire carries a cursor position. `HerdrPaneReadResult`
  (`packages/schema/src/herdr.ts`) is `{ pane_id, workspace_id, tab_id,
  source, format, text, revision, truncated }` — no row, no column — and
  `grep -i cursor` over `packages/schema/src/**` returns nothing at all.
- kanhrd paints rendered SNAPSHOTS, not a PTY byte stream.
  `PaneTerminal.paint()` writes `RIS + content` (full reset, then the
  whole snapshot) or appends the new suffix. xterm therefore leaves its
  caret wherever the written text ended — the end of the snapshot, i.e.
  the bottom — which is exactly the reported symptom.
- Input does not move it either: `term.onData` relays to
  `pane.send_text` / `pane.send_keys`, herdr applies the keystroke, and
  the next snapshot repaints. The local caret is decoration; it has never
  reflected herdr's cursor.

ADR-0004 names this indirectly: re-deriving "cursor position, scroll
region, and wrapped-line reflow" is listed as work the project chose NOT
to do bridge-side, because `pane.read` returns already-rendered grid
state.

**Expected behavior**

The caret marks the insertion point, so mid-line editing is possible
without counting characters. Failing that, the terminal does not show a
caret that is lying about where typing goes.

**Investigation/fix notes**

Three directions, cheapest first, and the first one is a question for
herdr rather than a change here:

1. **Ask herdr for the cursor.** herdr parses the grid with libghostty-vt
   and therefore knows the cursor position; the question is whether its
   JSON API exposes it on `pane.read` / the output subscription, or could.
   If it does, this is a schema mirror update plus
   `term.write(..., () => moveCursor(row, col))` and nothing more. Check
   the herdr source before designing anything else.
2. **Hide the caret while it cannot be truthful.** xterm can render no
   cursor. A caret in the wrong place is worse than no caret — "absent
   beats wrong" (`docs/UX-GUIDELINES.md`). This is a small, honest
   stopgap that does not block option 1, and it would remove the
   misleading indicator at the bottom.
3. **Reconstruct the position client-side** from the snapshot. Rejected
   for the bridge in ADR-0004 for good reasons, and the same reasons apply
   in the browser: it duplicates libghostty-vt's job fragilely, and it
   cannot see a cursor that a rendered snapshot does not encode.

Option 2 changes what the operator sees today; option 1 is the real fix.
Neither is chosen here.

**Verification/acceptance criteria**

- Typing and then moving within the line keeps the caret at the insertion
  point, verified against a real shell and against an agent TUI in a pane.
- If the caret cannot be placed truthfully, no caret is rendered, and no
  indicator sits at the bottom implying one.
- The snapshot repaint path keeps its current behaviour: scrollback
  survives a repaint, and a reader scrolled up is not yanked to the tail
  (the `terminal-scrollback` capability).

---

## herdr caps `pane.read` at 1000 lines, so a long agent report still will not fit

**Problem**

`add-terminal-scrollback-depth` exists because a full agent report does not
fit in the scrollback kanhrd shows. Measurement during that change found the
binding constraint is not kanhrd's missing `lines` parameter but herdr
itself: herdr 0.8.2 caps `pane.read` at **1000 lines server-side**. Sending
the parameter is still right and still an improvement over the 80-line
default, but the depth setting cannot deliver the change's stated
motivation. A report longer than 1000 lines remains unreadable from
kanhrd, whatever the operator sets.

**Reproduction/current evidence**

Measured against an isolated `kanhrd-test-scrollback-measure` session on
herdr 0.8.2, with a pane holding 30000 lines of `seq` output and
`scroll.max_offset_from_bottom` reporting 12147 lines of retained history:

| requested `lines` | returned | `truncated` |
| --- | --- | --- |
| omitted | 80 | `true` |
| 200 | 200 | `true` |
| 2000 | 1000 | `true` |
| 20000 | 1000 | `true` |
| 100000 | 1000 (13.1KB) | `true` |

Latency was flat at ~105ms regardless of requested depth, so the cap is
applied before the read does work. `text` and `recent-unwrapped` behave
identically; `source: 'visible'` ignores `lines` entirely and returns the
viewport. `truncated` is honest rather than always-on: a 990-line pane
returns `truncated: true` at `lines=990` and `false` at `lines=1000`, and a
50-line pane returns `false` at every depth. So herdr retains far more
history than it will serve in one read.

**Expected behavior**

An operator can read the whole of a long agent report from kanhrd, not its
last 1000 lines.

**Investigation/fix notes**

Three directions, and the first is a question for herdr rather than a
change here:

1. **Ask herdr to raise or page the cap.** The history exists — 12147 lines
   retained against 1000 served. A paged read (offset plus limit) would be
   more useful than a larger ceiling, and would let kanhrd fetch backwards
   on demand instead of asking for everything at once. This is the honest
   fix and it is upstream.
2. **Page it client-side if herdr gains an offset.** kanhrd would request
   successive windows as the reader scrolls up, which is a different
   interaction from one depth setting and needs its own design.
3. **Accept the ceiling and say so.** This is what shipped: the setting's
   maximum is herdr's ceiling, and the terminal states when a buffer was
   cut. The reader at least stops mistaking a truncated buffer for a short
   session.

Whatever is chosen, the ceiling is tied to a herdr version. Record the
version alongside it so a herdr that lifts the cap does not leave kanhrd
silently pinned to 1000.

**Verification/acceptance criteria**

- An agent report longer than 1000 lines can be read from its start in the
  kanhrd terminal view.
- The depth setting's maximum reflects what the connected herdr will
  actually serve, rather than a hardcoded constant.
- A truncated buffer continues to say so; absent beats wrong, and a
  truncation that looks like a short session is wrong.

---

## e2e specs skip themselves when the seeded session is too thin

**Problem**

Nearly half the e2e suite guards itself with a runtime `test.skip`, and a
large share of those guards are data-shape preconditions rather than
capability or environment checks. On a fresh isolated session — the normal
starting condition since `add-test-herdr-isolation` — the seeded world is
thin enough that those preconditions routinely fail, so the specs report as
skipped rather than run. A green suite with five or six silent skips looks
the same as a green suite that exercised everything.

**Reproduction/current evidence**

72 `test` blocks across `apps/web/e2e/*.spec.ts`, 32 conditional
`test.skip` calls in 12 files. Two classes:

- **Environment guards**, which are correct and should stay:
  `test.skip(!!preflightReason, ...)` when no herdr is reachable.
- **Data-shape guards**, which are the problem:
  `count < 2, 'needs at least 2 tabs in the rail to observe next-tab
  advancing'`; `count < 2, 'fewer than two visible status columns —
  nothing to swipe to'`; `before < 2, 'need at least two visible statuses
  to hide one and still have a page'`; `count < 1, 'no tabs in the rail to
  click'`; `!hostName, 'could not read host name from first card'`.

The `Escape closes the plus-menu` spec is a worked example: it skips
whenever the run's host has not advertised a create capability, which is a
fresh session's normal state. Its contract is covered by unit tests, so
there is no hole — but the e2e is dead weight on most runs, and nothing
reports that it never ran.

The same root cause was just found and fixed one layer over, in the capture
fixture: `buildPopulatedSmall()` was `buildSixHundredPanes().slice(0, 6)`,
six panes in one tab of one workspace, which made the board unable to
demonstrate the rail, a second workspace, or a move destination
(`31e38ff`). The live e2e seed has the same thinness with the same
consequence.

**Expected behavior**

A spec that cannot run says so as a failure of the seed, not as a quiet
skip; or the seed is rich enough that the precondition holds and the spec
runs.

**Investigation/fix notes**

- Seed the integration session the way `31e38ff` chose the capture fixture:
  deliberately, with at least two workspaces, several tabs and one pane per
  `agent_status`, so the data-shape guards are satisfied by construction.
- Then decide, per guard, whether it should remain a `skip` or become a
  hard failure. A precondition the seed is supposed to guarantee is a
  broken seed when it fails, not an untestable environment.
- Keep the `preflightReason` environment guards exactly as they are; those
  are the documented no-herdr path and are not this problem.
- Report skip counts in CI output so a rise in skips is visible rather than
  buried under a green tick.

**Verification/acceptance criteria**

- The number of data-shape skips on a normal isolated run is zero, or each
  surviving one is justified in the spec.
- A seed that stops satisfying a precondition fails the suite rather than
  silently reducing its coverage.
- `preflightReason` skips still work when no herdr is reachable.

---

## kanhrd's prefix shortcuts are unreachable from a phone

**Problem**

On a phone the operator cannot use any of kanhrd's own prefix shortcuts:
next or previous tab, next card, the card switcher, help. They mirror herdr's
navigation in the web UI, and a phone is where that navigation is missed most.

**Reproduction/current evidence**

Open a pane on a phone and tap the terminal to raise the soft keyboard. The
prefix cannot be pressed as a chord, and even from a hardware keyboard it
would not arm: `KeyboardService.handleKeydown`
(`apps/web/src/app/state/keyboard.service.ts`) treats any key while xterm's
helper textarea is focused as typing, and disarms the chord so that Ctrl+B
reaches the terminal. That rule is right for a hardware keyboard and leaves a
touch user with no path at all.

Two facts shape a fix, found while building `add-terminal-key-bar`:

- The dispatch needs a path that does not depend on a DOM `keydown`. iOS soft
  keyboards commonly report `keyCode 229` (IME composition) instead of a
  usable `key`, and the character arrives only as xterm's `onData`.
- Sending the prefix to the pane does not help. A key sent through
  `pane.send_keys` reaches the program in the pane, never herdr's prefix
  layer (measured against an isolated herdr session). That is why the key
  bar's `^B` is a literal Ctrl+B for tmux, vim and readline, and not this.

**Expected behavior**

From a phone, the operator can arm kanhrd's prefix and run a prefix shortcut
without a hardware keyboard, and without taking Ctrl+B away from the program
in the pane.

**Investigation/fix notes**

The pane-detail key bar is the natural surface: it already owns a
latch-with-visible-state model and never takes focus from the terminal.

- A bar cell labelled from `KeyboardService.prefix()` could arm the chord
  through a new public entry point.
- While armed, `PaneTerminal` would route the next `onData` character, or
  bar key, to `KeyboardService` as the chord key instead of sending it to
  the pane. A key that matches no shortcut disarms and sends nothing.
- `CHORD_TIMEOUT_MS` (2 s) is short for a thumb moving from the bar to the
  soft keyboard. A chord armed from the bar probably wants no timeout, like
  the bar's modifier latch.
- The cell's label and state are copy and tokens for the maintainer.
- This needs its own proposal. It adds a second cell kind that is an app
  action rather than a key sequence.

**Verification/acceptance criteria**

- On a phone, with the soft keyboard up, the operator arms the prefix and
  the next key runs the matching kanhrd shortcut; nothing reaches the pane.
- The key bar's `^B` still sends a literal Ctrl+B to the pane.
- A hardware keyboard's prefix behaviour is unchanged.

---

## The app shell is 100vh, which on iOS is the large viewport

**Problem**

A latent layout property with no known symptom today. `apps/web/src/app/app.scss:14`
sets the shell to `height: 100vh`. On iOS, `100vh` resolves to the large
viewport — the height with the browser toolbars retracted — and not to
`innerHeight` while toolbars are showing. So the shell, and every route
inside it, can extend below the visible area by the toolbar height.

**Reproduction/current evidence**

No reproduced symptom. While building `add-terminal-key-bar`, this was the
first suspect for the terminal's cursor sitting under iOS's accessory bar.
It turned out not to be the cause: that defect disappeared after the key
bar's settle rework, with the shell unchanged (see that change's design
note). The underlying fact stands independently. Desktop Chromium cannot
show it, because there `100vh` equals `innerHeight`.

**Expected behavior**

The shell's height matches the visible area on mobile browsers, so a
bottom-anchored surface is not clipped or pushed under toolbars.

**Investigation/fix notes**

`100dvh` (dynamic viewport) is the candidate. It tracks toolbars; on iOS it
does not track the soft keyboard. It changes Android's shell height whenever
the URL bar shows. That is plausibly a fix there too, but it is unmeasured,
and the change owes before/after measurement on both platforms. Its blast
radius is every route, so it wants its own proposal.

**Verification/acceptance criteria**

- On an iPhone with toolbars shown, the shell's bottom equals the visible
  area's bottom on the board and on pane detail.
- On Android, the same check with the URL bar shown and hidden, measured
  before and after.

