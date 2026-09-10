## Purpose

Surface the card identity herdr already holds, and expose herdr's own
pane rename so the operator can name a card after the task. Identity
stays herdr's: no kanhrd-side storage, no parallel naming system.

## Vocabulary

User-facing copy says **card**; code, wire and schema say `pane`. A
board grouping is a **status column**. A **pen** is a host, a **field** a
workspace, a **lane** a tab.

## ADDED Requirements

### Requirement: The projected pane carries herdr's user-authored label

The bridge-projected `Pane` in `packages/schema/src/herdr.ts` SHALL gain
`label?: string`, documented as herdr's user-authored pane name as set by
`pane.rename`.

`projectPane` in `apps/bridge/src/herdr/project.ts` SHALL forward
`HerdrPaneInfo.label`, setting the field only when it is a non-empty
string. A `null`, absent or empty label SHALL leave the field absent
rather than emitting `null` or `""`.

No new herdr request SHALL be introduced: `label` already arrives on the
`pane.list` responses the bridge makes.

#### Scenario: A renamed pane

- **WHEN** herdr reports `label: "fix the backlog storm"` for a pane
- **THEN** the projected `Pane` has `label: "fix the backlog storm"`

#### Scenario: A pane with no label

- **WHEN** herdr reports `label: null` for a pane
- **THEN** the projected `Pane` has no `label` property at all

#### Scenario: A pane whose label was cleared

- **WHEN** a pane's label is cleared in herdr and the bridge re-reads it
- **THEN** the projected `Pane` has no `label` property and the card falls back to agent identity

### Requirement: The workspace name cache carries git provenance

`WorkspaceTabNameCache` in `apps/bridge/src/herdr/names.ts` SHALL store,
per workspace, both the label and herdr's optional `worktree`
provenance, typing `workspace.list`'s response as
`HerdrWorkspaceDetail[]`. It SHALL expose `workspaceWorktree(id)`
alongside the existing `workspaceName(id)`, whose behaviour — returning
the label, or the id when unknown — SHALL be unchanged.

`setWorkspace` SHALL update the label without discarding a stored
`worktree`, because `workspace.renamed` carries only `workspace_id` and
`label`. Event payloads that carry a full `HerdrWorkspaceDetail` SHALL
update both.

No new herdr request, poll, subscription or capability flag SHALL be
introduced: `worktree` already arrives on the `workspace.list` call
`refresh()` makes.

#### Scenario: A workspace inside a git checkout

- **WHEN** `workspace.list` returns a workspace whose `worktree.repo_name` is `kanhrd`
- **THEN** `workspaceWorktree(id)` returns that provenance object and `workspaceName(id)` is unchanged

#### Scenario: A workspace outside any repository

- **WHEN** `workspace.list` returns a workspace with no `worktree`
- **THEN** `workspaceWorktree(id)` returns `undefined` and no error is raised

#### Scenario: A workspace is renamed

- **WHEN** a `workspace.renamed` event arrives for a workspace whose worktree was cached
- **THEN** the cached label updates and the cached `worktree` is preserved

#### Scenario: An unknown workspace

- **WHEN** `workspaceWorktree` is called for an id the cache has never seen
- **THEN** it returns `undefined`

### Requirement: The projected pane carries its project identity

`Pane` SHALL gain
`project?: { repo_name: string; checkout_path: string; is_linked_worktree: boolean }`,
joined by `projectPane` from the owning workspace's cached `worktree`.
The field SHALL be absent when the owning workspace has no `worktree`.
`repo_key` and `repo_root` SHALL NOT be projected — nothing renders
them.

#### Scenario: A pane in a git workspace

- **WHEN** a pane's workspace has `worktree: { repo_name: "kanhrd", checkout_path: "/home/op/src/kanhrd", is_linked_worktree: false, ... }`
- **THEN** the projected `Pane.project` is `{ repo_name: "kanhrd", checkout_path: "/home/op/src/kanhrd", is_linked_worktree: false }`

#### Scenario: A pane in a linked worktree

- **WHEN** the owning workspace's `worktree.is_linked_worktree` is `true`
- **THEN** the projected `Pane.project.is_linked_worktree` is `true`

#### Scenario: A pane in a non-git workspace

- **WHEN** the owning workspace has no `worktree`
- **THEN** the projected `Pane` has no `project` property

### Requirement: The card title prefers the operator's own name

The card title SHALL resolve as
`label ?? display_agent ?? agent ?? title ?? pane id prefix`, replacing
today's `agent ?? title ?? pane id prefix`.

When `label` supplies the title, the agent identity
(`display_agent ?? agent`) SHALL be rendered in the card's meta row in
`--ink-mute` so it is not lost. When `label` is absent the card SHALL
render exactly as it does today and no secondary identity row SHALL be
rendered.

`title` SHALL remain below agent identity in the order. It is herdr's
display-only metadata slot, written through `pane.report_metadata` with
an optional TTL, and a card title that can silently expire SHALL NOT
outrank a stable agent identity.

The card title SHALL be set in `--font-ui` at weight `--fw-medium`
(`500`) in both densities, per the binding family table in
`docs/DESIGN-SYSTEM.md` § Typography. The display serif SHALL NOT be
used for a card title.

#### Scenario: A renamed card

- **WHEN** a pane has `label: "fix the backlog storm"` and `agent: "claude"`
- **THEN** the card title reads `fix the backlog storm` in `--font-ui` weight 500 and the meta row shows `claude` in `--ink-mute`

#### Scenario: An unnamed card

- **WHEN** a pane has no `label` and reports `agent: "codex"`
- **THEN** the card title reads `codex` and no secondary identity row is rendered

#### Scenario: A card with only hook metadata

- **WHEN** a pane has no `label` and no agent, and `title: "migration run"`
- **THEN** the card title reads `migration run`

#### Scenario: A card with no name at all

- **WHEN** a pane has no `label`, no agent and no `title`
- **THEN** the card title is the first 8 characters of the pane id, in `--font-mono`

#### Scenario: herdr renames the agent under a label

- **WHEN** herdr changes a labelled pane's `display_agent` from `claude` to `claude-review`
- **THEN** the card title is unchanged and the meta row updates to `claude-review`

### Requirement: The card renders its project and checkout path

When a pane has a `project`, the card SHALL render `repo_name` as the
project identity and the `checkout_path` as a location, in `--font-mono`
at `--fs-caption` in `--ink-mute`, alongside the existing `field / lane`
text.

The displayed path SHALL be computed as the last two segments of
`checkout_path`, joined by `/` and prefixed with `…/` when earlier
segments were dropped. The path SHALL NOT be otherwise rewritten: no
`$HOME` collapsing, no repo inference of our own, no case change.

The location SHALL be a single non-wrapping line that truncates with an
ellipsis and SHALL NOT cause page-level horizontal overflow at any
width, 390px included. The full `checkout_path` SHALL be reachable
without hover — rendered in full on the pane-detail route and exposed on
keyboard focus — with a `title` attribute as a pointer convenience only.

When a pane has no `project`, the card SHALL render no project line, no
placeholder, no dash and no skeleton.

#### Scenario: A card in a deep checkout

- **WHEN** a pane's `project.checkout_path` is `/home/op/workspace/src/github.com/wakaru44/kanhrd`
- **THEN** the card's location reads `…/wakaru44/kanhrd` and its `title` attribute is the full path

#### Scenario: A card in a shallow checkout

- **WHEN** a pane's `project.checkout_path` is `/srv`
- **THEN** the card's location reads `/srv` with no `…/` prefix

#### Scenario: A card outside any repository

- **WHEN** a pane has no `project`
- **THEN** the card renders no project line and its layout does not reserve space for one

#### Scenario: A long path at phone width

- **WHEN** the board renders a card with a 200-character `checkout_path` in a 390px viewport
- **THEN** the location truncates inside the card and the page's horizontal scroll width does not exceed the viewport width

### Requirement: Pane detail shows the full checkout path

The pane-detail route SHALL render the pane's `project.repo_name` and
full `project.checkout_path` in its metadata strip, in `--font-mono`,
selectable as text, wrapping or scrolling inside its own container
rather than widening the page. When the pane has no `project` the rows
SHALL be absent.

#### Scenario: Opening a card in a checkout

- **WHEN** the operator opens `/pane/:host/:id` for a pane with a `project`
- **THEN** the metadata strip shows the repo name and the full checkout path, not the truncated card form

#### Scenario: Opening a card with no project

- **WHEN** the operator opens a pane whose `Pane` has no `project`
- **THEN** the metadata strip omits both rows entirely

### Requirement: The bridge exposes herdr's pane rename

`packages/schema/src/wire.ts` SHALL add a `pane.rename` bridge method
with params `{ pane_id: string; label?: string | null }` and a result
carrying the updated `Pane`, mirroring herdr's
`PaneRenameParams` in which only `pane_id` is required and `label` is
nullable so `null` clears the name.

`BridgeCapabilities` SHALL gain `paneRename: boolean`, deliberately
separate from `paneCreate` / `paneClose` / `paneMove`, so the SPA
disables only this action when a pen cannot serve it.

The bridge SHALL forward the call to herdr's `pane.rename` through the
existing per-pane write queue, as `pane.send_text` and `pane.close`
already do, and SHALL NOT cache the label itself.

A rename SHALL NOT call `pane.report_metadata`, and SHALL NOT write
`title`, `display_agent`, `state_labels` or any `tokens` entry.

#### Scenario: Naming a card

- **WHEN** the SPA calls `pane.rename` with `{ pane_id: "p1", label: "fix the backlog storm" }`
- **THEN** the bridge invokes herdr's `pane.rename` with the same values and returns the updated `Pane`

#### Scenario: Clearing a name

- **WHEN** the SPA calls `pane.rename` with `{ pane_id: "p1", label: null }`
- **THEN** the bridge forwards `label: null` and the resulting `Pane` has no `label`

#### Scenario: A pen that cannot rename

- **WHEN** a pen's `bridge.capabilities` reports `paneRename: false`
- **THEN** the SPA does not offer the rename action for that pen's cards

#### Scenario: herdr rejects the rename

- **WHEN** herdr returns an error for `pane.rename`
- **THEN** the bridge surfaces the failure and the card keeps its previous title

### Requirement: Pane updates are pushed, not polled

The bridge SHALL request `pane.updated` in its `events.subscribe` spec
set and SHALL relay it to the browser so a rename originating anywhere —
this board, herdr's own interface, or another client — reaches every
board without a refetch.

The subscription SHALL remain global with no `pane_id`, so the fixed
spec set in `buildSubscriptionSpecs()` still never needs rebuilding on
pane churn. The existing agent-status poll SHALL NOT be repurposed to
detect label changes.

#### Scenario: A rename made in herdr's own interface

- **WHEN** the operator renames a pane in herdr's TUI while the board is open
- **THEN** a `pane.updated` event reaches the board and the card title updates without a reload

#### Scenario: A rename made from another browser

- **WHEN** a second client renames a pane through the bridge
- **THEN** this board's card title updates from the broadcast event

#### Scenario: Subscription spec stability

- **WHEN** panes are created and closed while subscribed
- **THEN** the subscription spec set is not rebuilt on account of `pane.updated`

### Requirement: The rename entry point is visible, not hover-only

The card SHALL expose rename as an item in its `LucideMoreHorizontal`
overflow menu, whose trigger is visible on first render. Pane detail
SHALL expose the same action as a visible control in its header. No
hover-only pencil, no hover-revealed inline control, and no
click-to-edit on the title text itself SHALL be introduced. This matches
the rail's existing field / lane rename pattern.

Under `pointer: coarse` the overflow trigger and every menu item SHALL
present a touch target of at least 40x40, satisfied at 390px. Card
opening and the rename action SHALL remain separate semantic controls;
the rename control SHALL NOT be a `<button>` nested inside the card's
`<a>`.

Submitting the rename SHALL happen through a modal with a single text
input, seeded with the current `label` (empty when none), offering a
save action, a clear action when a label exists, and cancel. The modal
title SHALL use `--font-display` per the modal-title rule. `Escape`
SHALL cancel, `Enter` SHALL submit, and focus SHALL return to the
originating card's overflow trigger on close. A submission that is empty
after trimming SHALL send `label: null`.

#### Scenario: Finding rename on a card

- **WHEN** the board renders a card with no pointer hovering it
- **THEN** the overflow trigger is visible and its menu contains the rename item

#### Scenario: Renaming on a phone

- **WHEN** the operator taps the overflow trigger on a compact card at 390px
- **THEN** the trigger and the rename menu item each measure at least 40x40 and the menu opens inside the viewport

#### Scenario: Cancelling the modal

- **WHEN** the rename modal is open and the operator presses `Escape`
- **THEN** no rename is sent and focus returns to the overflow trigger that opened it

#### Scenario: Clearing by submitting nothing

- **WHEN** the operator submits a whitespace-only value for a card that has a label
- **THEN** the SPA sends `label: null` and the card falls back to agent identity

#### Scenario: Renaming from pane detail

- **WHEN** the operator opens `/pane/:host/:id`
- **THEN** a visible rename control is present in the header without hovering

### Requirement: Rename copy lives in the shared copy module

Every user-facing string this change introduces SHALL be defined in
`apps/web/src/app/shared/copy.ts` and referenced from templates and
components, never inlined. The strings SHALL follow `docs/BRAND.md`:
lowercase or sentence case, no exclamation marks, and no care verbs —
naming a card is not a lifecycle, empty or error surface. Failure copy
SHALL name what failed and quote herdr, reusing the existing
`renameFailed` key.

The new keys SHALL be:

```text
card.renameAction      rename card
card.renameModalTitle  name this card
card.renameFieldLabel  card name
card.renameSave        save
card.renameClear       clear name
```

#### Scenario: A template needs the rename label

- **WHEN** the card's overflow menu renders its rename item
- **THEN** the label comes from `card.renameAction` in `copy.ts`

#### Scenario: A rename fails

- **WHEN** herdr rejects a rename
- **THEN** the toast uses the existing `renameFailed` copy and quotes herdr's reason

### Requirement: No kanhrd-side name storage is introduced

The SPA SHALL NOT persist card names in `localStorage`,
`sessionStorage`, IndexedDB or any other client store, and the bridge
SHALL NOT persist them to disk or memory beyond the transient projection
of a `pane.list` response. A card's name SHALL have exactly one home:
herdr's `PaneInfo.label`.

#### Scenario: Reloading the board

- **WHEN** the operator names a card and reloads the page
- **THEN** the name is present because it is read back from herdr, with no `kanhrd.*` storage key involved

#### Scenario: Opening the board on a second device

- **WHEN** the operator opens the board on another device against the same pen
- **THEN** the card shows the same name

#### Scenario: Clearing local site data

- **WHEN** the operator clears the SPA's local data
- **THEN** card names are unaffected
