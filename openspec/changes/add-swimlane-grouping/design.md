# Design — pane-grain project provenance

Written after the swimlanes shipped, because shipping them produced the
feedback: grouping the board by repository split nothing. Every card
landed in one band. `bandOf` was correct; the data it grouped on was
empty, and would have been wrong even when full.

## What was actually broken

Two defects, both upstream of the swimlane code.

1. **Provenance never arrived.** `names.ts` read `worktree` off
   `workspace.list`. The live herdr sends no `worktree` field on
   `workspace.list` or `workspace.get`. `workspaceWorktree()` therefore
   always returned `undefined`, `projectPane` never set `Pane.project`,
   and every card fell into `ungrouped` for both `repository` and
   `checkout`. A comment in `names.ts` asserted the opposite ("has
   always returned whole `WorkspaceInfo` objects"); it was wrong and is
   corrected.
2. **Wrong grain.** `Pane.project` was documented as provenance of the
   pane's *owning workspace*. The operator's live flock has two
   repositories inside ONE workspace (`w6`: eight panes in `kanhrd`, two
   in `yoga-app`). Workspace-grain provenance cannot split those cards
   no matter how reliably it arrives. Fixing only defect 1 would have
   produced a board that still put both repositories in one band.

`pane.list` carries both `cwd` and `foreground_cwd` on every pane;
`HerdrPaneInfo` declared neither, so the bridge dropped them at the type
boundary.

## Decisions

**`cwd`, not `foreground_cwd`.** `foreground_cwd` follows whatever the
foreground process last changed into, so a card derived from it would
hop swimlanes in the middle of a command and hop back when it finished.
`cwd` is the pane's stable home.

**Walk the filesystem; do not shell out to `git`.** `pane.list` is
polled. A `git rev-parse` subprocess per pane per poll is a fork storm
for an answer that is one `stat` of `<dir>/.git` per level. The walk also
gives the linked-worktree answer for free: `.git` is a directory in a
normal checkout and a file (`gitdir: …`) in a linked worktree.

**Synchronous resolution.** `projectPane` and every caller are
synchronous. Making the resolver async would ripple `async` through the
whole projection path to save nothing — the steady state is a cache hit,
and a cold walk is a handful of `statSync` calls.

**Cache per resolved directory, bounded at 512, cleared on host
connect/reconnect.** Panes rarely change directory and `pane.list` is
polled, so the cache is what keeps this off the filesystem. Negative
results are cached too (as `null`), or a pane outside any repository
would re-walk to the filesystem root on every poll. Eviction is
oldest-inserted-first, which is close enough to LRU for a lookup this
cheap to recompute. Clearing on reconnect is the invalidation: a
checkout that moved, vanished or became a linked worktree while the
bridge was away is re-resolved rather than served stale forever. The
cache is module-global rather than per host — the filesystem is, so a
second host's reconnect clearing it costs a re-walk and nothing else.

**Its own module (`apps/bridge/src/herdr/repo.ts`).** `project.ts` is a
pure shape-mapping module; a filesystem walk with a cache and an
invalidation hook is a different concern with a different test surface
(`hosts.ts` calls `clearRepoCache()` directly).

**Workspace `worktree` demoted to fallback, not deleted.** A future or
different herdr may send `WorkspaceDetail.worktree`. It applies only when
the pane has no `cwd` or the walk found nothing.

**No project at all, rather than a guess.** A pane whose `cwd` sits
outside any repository projects no `project`, so it groups as
`ungrouped` and its card renders no project line. That is the honest
answer, and it matches the standard `status_since` already sets: absent
means "the bridge cannot vouch".

## Known limitation

The filesystem walked is the BRIDGE's. For a herdr on the same machine
that is correct. For a herdr reached over a forwarded socket from
another machine, the paths are that machine's: the walk usually resolves
nothing (falling back to the workspace `worktree`), but a path that
happens to exist locally would resolve against the wrong filesystem.
Provenance reported per pane by herdr itself is the only real fix, and is
an upstream request, not a bridge change. Recorded in `tasks.md` § 8.
