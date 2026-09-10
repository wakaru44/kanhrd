## Direction

Identity is herdr's. The bridge's job is to stop discarding it and to
expose herdr's own rename, not to invent a parallel naming system in the
browser.

All findings below come from read-only inspection of the installed
herdr 0.8.2 — its binary's embedded API JSON schema, its serde field
tables, its CLI usage strings and its changelog — plus the repo's own
sources. Nothing was run against the operator's live session.

## Finding 1 — herdr has a user-authored pane rename

```text
usage: herdr pane rename <pane_id> <label>|--clear
```

`PaneRenameParams` has properties `label: ["string","null"]` and
`pane_id: "string"`, with `required: ["pane_id"]` — so the label is
optional and nullable, and `--clear` is a first-class unset form.
`pane.rename` is in the method enum alongside `tab.rename` and
`workspace.rename`.

This corrects the upstream reading. "Pane has no rename" is true of
`packages/schema/src/herdr.ts` — which models no
`HerdrPaneRenameParams` — and false of herdr. Our schema is an explicitly
trimmed projection ("trimmed to what feeds a kanban card"), so its
silence is never evidence about herdr.

Consequence: **per-pane user-authored naming does not need our own
storage.** It is a herdr write we are not making.

### Where the rename lands

`PaneInfo.label` — declared in our schema at `herdr.ts:84` and already
arriving on every `pane.list` response, because
`apps/bridge/src/herdr/hosts.ts:145` and `:461` request `pane.list` with
no field selection and receive whole `PaneInfo` objects.
`projectPane` (`apps/bridge/src/herdr/project.ts:20-31`) builds the
outbound `Pane` from a fixed field list — `pane_id`, `workspace_id`,
`tab_id`, `agent_status`, `title`, `display_agent ?? agent` — and never
reads `label`. A grep of `apps/web/src/app/board/` for `.label` returns
nothing.

So today: rename a pane in herdr's TUI, and the card is unchanged. That
is the bug under the user's request.

## Finding 2 — the five name-ish fields on a pane, by author

herdr's `PaneInfo` is 19 fields; ours models 9. Five carry a name, with
five different authors:

| Field                     | Written by                                            | Notes                                   |
| ------------------------- | ----------------------------------------------------- | --------------------------------------- |
| `label`                   | the **user**, via `pane.rename`                        | persistent, explicit clear              |
| `title`                   | **user hooks or integrations**, via `pane.report_metadata` | display-only, source-attributed, optional TTL |
| `terminal_title`          | the **program**, via its OSC title escape              | not modelled by us                      |
| `terminal_title_stripped` | as above, sanitised                                    | not modelled by us                      |
| `display_agent` / `agent` | **agent integrations**                                 | what the card shows today               |

Evidence for `title`'s author is the changelog for `0.6.x`: "Added
`pane.report_metadata` and `herdr pane report-metadata` so **user hooks**
can customize pane titles, displayed agent names, compact status labels,
and visible state labels without taking over integration-owned lifecycle
or session state." The CLI help calls it "Report display-only pane
metadata".

`title` is therefore **not** the shell's OSC title — that is
`terminal_title` / `terminal_title_stripped`, confirmed by changelog
entries about PowerShell's administrator decoration appearing "as the
terminal title" and about Codex panes "with customized static terminal
titles". We model `title` and not the OSC pair.

### Title precedence decision

`Pane.title` needs no plumbing: `projectPane:28` already forwards it.
The card's `displayName()` is `agent?.name ?? title ?? id.slice(0,8)`,
so `title` is only reachable on a pane with no agent at all — which is
why it looks missing.

The card title becomes:

```text
label ?? display_agent ?? agent ?? title ?? pane_id.slice(0, 8)
```

`label` goes to the top because it is the only value the operator
authored. `title` stays **below** agent identity, deliberately: it
carries an optional `ttl_ms` (max `86400000`, 24h), so a hook-set title
can expire on its own, and a card title that silently reverts is worse
than one that never moved. When `label` wins, the agent identity moves
to the meta row in `--ink-mute` rather than disappearing.

## Finding 3 — project identity exists at workspace level

`WorkspaceWorktreeInfo` is
`{ repo_key, repo_name, repo_root, checkout_path, is_linked_worktree }`,
all five required within the object. It hangs off `WorkspaceInfo` as
`worktree`, which is **nullable and not in `WorkspaceInfo`'s `required`
list**.

When is it populated? The changelog introduces it as "optional worktree
**provenance** on workspace responses" alongside
`herdr worktree list/create/open/remove`, and later entries describe
"repeated workspace **Git discovery**" being made non-blocking,
"embedded bare repositories now derive the correct repository name and
worktree location", and "linked worktree workspaces retain their labels
during Git metadata refreshes". Read together: herdr runs git discovery
per workspace and populates `worktree` whenever the workspace's
directory resolves inside a repository, with `is_linked_worktree`
distinguishing a linked worktree from the main checkout. A workspace
outside any repo has no `worktree`.

That inference rests on changelog wording plus the presence of the
`is_linked_worktree` discriminator — herdr's discovery source is not on
this machine, so it is not a source-level confirmation. The spec
therefore treats absence as normal and renders nothing for it, which is
correct under either reading.

`repo_name` is the project name and `checkout_path` the working
directory — structured and herdr-supplied. For the common
one-workspace-per-checkout case this fully covers "which project,
where", so **per-pane `cwd` is scoped out** (see Finding 6).

## Finding 4 — `tokens` is a writable, general-purpose metadata bag

Asked directly because it could have relocated the storage answer. It
can, but it should not.

- `PaneInfo.tokens` and `WorkspaceInfo.tokens` are
  `additionalProperties: {type: "string"}`, `maxProperties: 32`,
  `propertyNames.pattern: "^[A-Za-z0-9_-]{1,32}$"`.
- Writable through `pane.report_metadata` and
  `workspace.report_metadata`. Both take `tokens` with **nullable**
  values (null clears a key), `maxProperties: 16` per call, a required
  `source`, an optional `seq` for ordering and an optional `ttl_ms`
  (1..=86400000).
- CLI: `herdr pane report-metadata <pane_id> --source ID [--token
  NAME=VALUE] [--clear-token NAME] [--seq N] [--ttl-ms N]` and the
  workspace equivalent.
- Purpose, from the changelog: "configurable row layouts for expanded
  Space and Agent sidebar entries, including built-in display tokens,
  per-agent overrides, **custom metadata tokens**, and pane/workspace
  metadata reporting through the CLI and socket API."

Verdict: **general-purpose and writable, not reserved internals.** Token
keys are constrained; values are free strings. So a custom title could
live in `tokens["kanhrd_task"]`.

We do not use it. `pane.rename` is the purpose-built surface for a name,
it has no TTL ceiling, no `source` attribution to collide with hooks,
and it is what herdr's own rename prompt writes. Both CLI help strings
call `report_metadata` "display-only". Using a display bag as a store
when a rename exists would be the wrong seam.

One schema defect found, reported not fixed:
`HerdrWorkspaceDetail.tokens` is declared non-optional
(`tokens: Record<string, string>`) but herdr's `WorkspaceInfo.required`
omits both `tokens` and `worktree`.

## Finding 5 — the bridge plumbing cost

The upstream worry was that the board's join uses the trimmed
`HerdrWorkspaceInfo` (`workspace_id` + `label`) while `worktree` lives
on the richer tier-3 `HerdrWorkspaceDetail`. Established exactly:

`WorkspaceTabNameCache.refresh()` (`apps/bridge/src/herdr/names.ts`)
calls `workspace.list` and `tab.list` in parallel, then keeps
`new Map(workspaces.map(w => [w.workspace_id, w.label]))`. The response
is *typed* as `HerdrWorkspaceInfo[]`, but herdr's `workspace.list`
returns full `WorkspaceInfo` objects — `worktree` and `tokens`
included. **The data is already on the wire; the trim is ours, at the
type and the `Map` value.**

Cost to surface `worktree`, all local:

1. Type `refresh()`'s response as `HerdrWorkspaceDetail[]` — the type
   already exists.
2. Widen the cache value from `string` to
   `{ label: string; worktree?: HerdrWorkspaceWorktreeInfo }`, keeping
   `workspaceName(id)` returning `label ?? id` unchanged, and add
   `workspaceWorktree(id)`.
3. `projectPane` reads it from the cache it is already handed and stamps
   `project` onto the `Pane`.
4. Keep it warm without clobbering: `workspace.renamed` carries only
   `{ workspace_id, label }` (`herdr.ts:181`), so `setWorkspace` must
   update the label field and preserve a stored `worktree`.
   `workspace.created` carries a full `HerdrWorkspaceDetail` and can
   set both.

No new herdr request, no new poll, no new cache, no capability change.
It is the same join that already resolves `workspace.name`, carrying one
more value.

### Push updates for a rename

`Subscription::PaneUpdated` **is** a requestable subscription variant —
verified in the binary's variant list, next to `PaneCreated`,
`PaneClosed`, `PaneMoved`, `PaneFocused`, `WorkspaceUpdated` and
`WorkspaceMetadataUpdated`. `EventData::PaneUpdated` carries a full
`PaneInfo`.

This matters because `pane.rename` is not the only writer — herdr's own
TUI renames too. Our schema models no `pane.updated` and the bridge does
not subscribe to it, so without this the board would not see a rename
until the next reconnect: the 5s poll at
`AGENT_STATUS_POLL_INTERVAL_MS` refetches `pane.list` but only emits
synthetic events for `agent_status` transitions.

So `pane.updated` joins the fixed spec set in `buildSubscriptionSpecs()`
— which the code notes "never needs to be rebuilt in response to
pane/tab/workspace churn", and stays true here because
`Subscription::PaneUpdated` is global, with no `pane_id`.

Not a trap this time, unlike `PaneOutputChanged`: that one has an
`EventKind` and no `Subscription` variant, which is why tier-2 polls
`pane.read`. `PaneUpdated` has both.

## Finding 6 — per-pane `cwd`: real, but no longer the primary path

The original Q1 answer stands. herdr's `PaneInfo` declares
`"cwd": {"type": ["string","null"]}` and
`"foreground_cwd": {"type": ["string","null"]}`, neither required, and
its changelog for `0.6.5` reads: "Added `foreground_cwd` to pane and
agent API/CLI responses so integrations can inspect the active
foreground process directory **without changing the existing
pane/workspace `cwd` semantics**" — so `cwd` predates that release.
These values also already arrive on `pane.list` and are dropped by
`projectPane`.

Scoped out of this change. Workspace `worktree.checkout_path` answers
"which project, where" with structure a raw path lacks — a repo name, a
repo root, and a linked-worktree flag — for the one-workspace-per-checkout
case that dominates. Per-pane `cwd` only adds information when panes
inside one workspace sit in different directories, which
`pane.split --cwd` (`HerdrPaneSplitParams`) does allow. That is the
follow-on trigger, and the two are additive: a later lane can render
`cwd` under the project line without revisiting anything here.

## Storage decision (the former Q2)

**Decision: herdr-side, via `pane.rename` writing `PaneInfo.label`.** No
kanhrd storage of any kind.

Properties we get for free: shared across every device and client,
durable across restarts, broadcast on `Subscription::PaneUpdated`,
clearable via `label: null`, and visible in herdr's own sidebar beside
the operator's other names — one naming system, not two.

### Rejected — per-pane title in `localStorage['kanhrd.task-titles']`

This was the previous plan. Obsolete: it solves a problem `pane.rename`
already solves, and worse. Per-device and per-browser, lost with site
data, invisible to herdr and to any second client, and it would put the
operator's name for a card in a different place from the operator's name
for a lane or a field (both of which already round-trip to herdr).

It would only become the right answer if kanhrd needed a per-card
annotation herdr **cannot** hold — a note longer than a label, private
to one operator on a shared herdr, or one that must not appear in
herdr's sidebar. None of those is the ask.

### Rejected — bridge-persistent (SQLite or JSON)

`apps/bridge/src` is config, herdr clients, HTTP and WS, with no storage
layer. This would add a durable-state subsystem, a configurable path,
write-durability, multi-client conflict and backup questions — to
duplicate a field herdr already persists.

### Rejected — herdr's `tokens` bag

See Finding 4: writable and general, but display-only with a 24h TTL
ceiling and `source` attribution, where `pane.rename` is purpose-built.

## Rendering decisions

- **Card title is `--font-ui` at weight `500`**, per the binding family
  table at `docs/DESIGN-SYSTEM.md` § Typography ("Agent card title →
  `--font-ui` at weight `500`") and `docs/BRAND.md`'s rule reserving the
  display serif for rare surfaces. The display serif never lands on a
  repeated per-card identifier.
- **Truncation is computed, not CSS-tricked.** The path label is derived
  in TypeScript as the last two segments with a `…/` prefix when
  segments were dropped — deterministic, unit-testable, and free of the
  bidi hazard of eliding a path's head in CSS.
- **The full path is reachable without hover**, per
  `docs/UX-GUIDELINES.md`: on the detail route and on keyboard focus,
  with `title` as a pointer convenience only.
- **Rename is never hover-only.** It is a card overflow-menu item,
  matching the rail's existing field/lane rename pattern and the
  visible-affordances rule.
- **Absent values render nothing** — no `unknown`, no dash, no skeleton.

## Delivery order

Layer 1 (projection + rendering) is independent of
`add-l-brand-neo-shepherd-redesign` and lands first; it makes existing
herdr renames visible with no new write path. Layer 2 (the `pane.rename`
round trip) needs the redesign's overflow menu and `copy.ts`. Nothing in
Layer 2 changes Layer 1's data shape, so a slip in either does not block
the other.

## What already exists and needs no work

`tab.rename` and `workspace.rename` are plumbed end to end: wire methods
(`packages/schema/src/wire.ts:207`, `:225`), `tabCrud` / `workspaceCrud`
capability flags (`wire.ts:261-264`), bridge dispatch
(`apps/bridge/src/ws/dispatch.ts:196`, `:225`), host methods
(`hosts.ts:281`, `:339`), store event handling
(`panes.store.ts:297`, `:325`), the rail's create-then-rename inline
flow, and a `rename-tab` keyboard action. If the operator's notion of a
"task" is a lane or a field, that feature has already shipped — this
change adds only the card level.
