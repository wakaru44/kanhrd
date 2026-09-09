# ADR-0005: Client-side cascade purge and destructive-op confirmations

Status: Accepted
Date: 2026-09-09

## Context

Tier 3 adds pane/tab/workspace lifecycle: create, rename, close, move.
Close is destructive and, in herdr, sometimes cascading — closing the last
pane in a tab can close the tab and, if that was the tab's last one, the
workspace too; closing the last tab in a workspace closes the workspace.

herdr's own close handlers do not emit one event per implicitly-destroyed
resource. Verified against source, not just the schema
(`tmp/foreman/CONTRACT-TIER3.md` §5.6): a cascading `pane.close` fires
`pane.closed` then `workspace.closed`, with **no `tab.closed`** for the
tab that was destroyed along the way; a cascading `tab.close` fires
`tab.closed` then `workspace.closed`, with **no `pane.closed`** for any
panes that were inside that tab (there can be more than one, in a split
tab). Direct `workspace.close` (possibly with `close_group: true`, closing
several linked-worktree workspaces at once) emits one `WorkspaceClosed` per
closed workspace and nothing else.

A client naively waiting for a `*.closed` event per resource it believes
was destroyed will wait forever for events herdr never sends, leaving
stale panes/tabs in the client's cache. Once closed, a pane's scrollback,
a tab's panes, or a linked worktree are gone — there's no undo, so getting
the client's local state wrong here isn't a cosmetic bug, it actively
misleads the user about what still exists.

## Decision

The bridge forwards herdr's lifecycle events unmodified — it does not
synthesize the missing per-child `*.closed` events. The client (bridge
cache and web UI alike) treats whichever `*.closed` event it actually
receives as authoritative for that resource, and locally purges everything
it had cached as nested under it: every tab/pane entry it held for a
closed `workspace_id`, or every pane entry it held for a closed `tab_id`.

Confirmation before a destructive op (`pane.close`, `tab.close`,
`workspace.close`) is entirely a UI-level decision, not a wire behavior —
herdr does not require or enforce one, and does not stop a client from
closing the last remaining workspace. The web UI is responsible for:

- a generic "are you sure?" before any of the three close verbs,
- a separate, more specific confirmation when `workspace_group_close_required`
  applies (closing one linked-worktree workspace will close N siblings),
- blocking closing the very last open workspace client-side, since herdr
  will happily leave the user with zero,
- and stating in the confirmation copy when a `tab.close` will also take
  the parent workspace with it (last tab in workspace), rather than
  presenting it as "closing one tab."

## Alternatives considered

- **A. Shim the bridge to synthesize per-child close events** — rejected:
  would require the bridge to independently track full workspace→tab→pane
  membership well enough to enumerate every child a cascading close took
  out, duplicating state herdr itself already owns and risking the two
  falling out of sync. It also invents event semantics herdr doesn't have,
  which the next herdr upgrade could silently invalidate.
- **B. Forward herdr's actual events, purge cached children client-side** —
  chosen.
- **C. Require the client to call `*.list` after every close to
  resync** — rejected: throws away the point of push events (see
  ADR-0004's reasoning against needless polling) for a case handled more
  cheaply by purging a subtree the client already has cached.

## Consequences

- The bridge's cache-invalidation logic (per `tmp/foreman/CONTRACT-TIER3.md`
  §6) must purge nested cache entries on `workspace.closed`/`tab.closed`
  even when no explicit child event arrives — this is a real implementation
  obligation on L2C, not a footnote.
- The web UI must apply the same purge-on-parent-close logic to its own
  local view state, not just rely on the bridge's cache being correct.
- A future herdr version that starts emitting per-child close events would
  be a no-op change here — the client already purges the whole subtree on
  the parent event, so extra child events are redundant, not required.
- Confirmation UX lives entirely in the web app; a different tier-3 client
  built later against the same bridge would need to reimplement it, since
  the wire contract intentionally does not carry a "please confirm" step.
