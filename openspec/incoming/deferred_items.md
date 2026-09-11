# Deferred Items

Work that is understood, scoped, and deliberately not being done. Each entry
says what it is, where the evidence sits, and what it would take. Nothing here
is a mystery or a half-finished task — these were lifted out of five changes'
`tasks.md` on 2026-09-11 so those changes could archive honestly rather than
stay live as a parking lot.

Recorded against `main` at `31aa8f8`.

## Returning from a pane loses scroll and focus while grouped

**Accepted, not being fixed.** `BoardReturnService` restores the board's
position through the board's own `#strip` / `#columnEl` refs. Those elements
do not exist in the grouped (swimlane) render path, so with swimlanes on,
returning from a pane detail lands at the top of the band stack instead of
where the card was.

No test claims otherwise, so nothing is lying about it. The fix is not a
patch: the restore machinery has to move into the bands, which is its own
change. The ungrouped board — still the default — restores correctly.

From `add-swimlane-grouping` 8.3.

## Column reordering by drag

Unblocked and unbuilt. `docs/BRAND.md` carries `park.moveColumnLeft` /
`park.moveColumnRight`, so the keyboard equivalent has its copy and the
"drag-drop must work or not appear" rule is satisfiable. What remains:
`ParkedStore.moveColumn(id, delta)` over the existing `order` field, two
header-menu items, and a horizontal `cdkDropList` over the strip with the
column header as `cdkDragHandle`. `order` is already the render order
everywhere, so nothing shipped needs changing.

From `add-parked-columns` 5.3.

## The `on any activity` exit rule

Blocked on a spike, not on a decision. The rule would fire when a pane
produces output, which the bridge must detect without adding a request: by
diffing `PaneInfo.revision` inside the `pane.list` poll it already runs.

The spike: does `revision` advance with output? Sampling the operator's live
herdr on 2026-09-11 shows `pane.list` carries a real per-pane revision
(0, 3, 5, 37, 93 across ten panes) rather than the hardcoded `0` that
`apps/bridge/src/output/poller.ts:135` documents for `pane.read`. But the
bridge's own log pane, producing output continuously, sat at `0` across two
samples — so revision tracks something, and possibly not output. That is the
question, and the isolation harness now makes it a controlled test rather
than a guess.

If the constraint cannot be met without a new poll or a per-card output
subscription, the rule is not built. It is never shipped disabled or as
"coming soon".

From `add-parked-columns` 6.1-6.3.

## DNS rebinding: no `Host` check

The origin allowlist checks `Origin`, not `Host`, so DNS rebinding remains
open — an attacker-controlled name resolving to 127.0.0.1 still reaches the
bridge. Documented as a known limit in `docs/THREAT-MODEL.md` and
`SECURITY.md` rather than hidden. A change named
`add-bridge-host-header-check` would close it across
`apps/bridge/src/http/rest.ts` and `/ws`.

From `add-bridge-origin-allowlist` 7.1 (design decision 8).

## Moving 55 SPA specs onto the mock bridge

`apps/web/e2e/helpers/mock-bridge.ts` answers four methods; every tier-3
lifecycle call returns `unsupported_operation`. Moving the 55 specs across 10
files that do not need a real herdr onto mocks is not a fixture change —
each file asserts against real pane/tab/workspace shapes and needs its own
payloads. Its own change, as that section anticipated.

Worth noting the prize: those specs currently need a herdr session purely to
assert SPA behaviour.

From `add-test-herdr-isolation` 4.2.

## Browser-measured assertions that units already cover

Three assertions live in the unit suites because karma's viewport sits
permanently below `--breakpoint-mobile` and cannot report `pointer: coarse`.
They are proven as arithmetic through pure predicates, and the compiled
styles are asserted for the rules themselves — but no browser measures the
real boxes:

- linked-worktree bands: repository and checkout path genuinely differing in
  the rendered bands (`add-swimlane-grouping` 5.4 / 8.2)
- the top bar at 390x844: switcher entries meeting `--touch-target-min` as
  measured boxes (`add-terminal-top-bar` 5.6)
- `Ctrl+Alt+I` / `Ctrl+Alt+K` reaching a running program end-to-end
  (`add-terminal-top-bar` 5.7)

All three are now cheap: the isolation harness gives any run its own herdr
session, so the wall these were deferred behind is gone.

## Provenance for a remote herdr

`Pane.project` is derived by walking the BRIDGE's filesystem for a `.git`
entry. A herdr reached over a forwarded socket reports another machine's
paths, which usually resolve to nothing here and fall back to the workspace
`worktree`. A coincidentally-existing local path would resolve wrongly. The
real fix is provenance reported per pane by herdr itself — upstream, not ours.

From `add-swimlane-grouping` 8.4.

## The card's project line, now that one workspace can hold two repos

`card.ts` and `bandOf` are correct against the unchanged `Pane.project`
shape. Whether the card should show the checkout basename rather than the
repo name, now that panes in one workspace can differ, is a design question
nobody has asked yet.

From `add-swimlane-grouping` 8.5.
