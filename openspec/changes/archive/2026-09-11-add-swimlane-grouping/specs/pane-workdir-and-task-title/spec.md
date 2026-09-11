## MODIFIED Requirements

### Requirement: The projected pane carries its project identity

`Pane` SHALL carry
`project?: { repo_name: string; checkout_path: string; is_linked_worktree: boolean }`
at PANE grain, derived by `projectPane` from the pane's own
`HerdrPaneInfo.cwd`.

`HerdrPaneInfo` SHALL declare both `cwd` and `foreground_cwd` as optional
strings. Derivation SHALL use `cwd` — the pane's stable home — and SHALL
NOT use `foreground_cwd`, which follows whatever the foreground process
last changed into and would move a card between swimlanes mid-command.

The bridge SHALL resolve the repository by walking up from `cwd` for a
`.git` entry. `checkout_path` SHALL be the directory holding that `.git`
and `repo_name` its basename. `is_linked_worktree` SHALL be `true` when
the `.git` is a file (a linked worktree's `gitdir:` pointer) and `false`
when it is a directory. The walk SHALL NOT shell out to `git`.

Resolutions SHALL be cached per directory, the cache SHALL be bounded,
and it SHALL be cleared on host connect/reconnect, so a polled
`pane.list` costs no repeated filesystem walk and a moved or converted
checkout is not served stale forever.

The owning workspace's `worktree` SHALL remain a FALLBACK: it applies
only when the pane has no `cwd`, or the walk found no repository. The
field SHALL be absent entirely when neither source resolves — a pane
outside any repository has no project, and the board's `ungrouped` band
is then the honest answer. `repo_key` and `repo_root` SHALL NOT be
projected — nothing renders them.

#### Scenario: Two repositories inside one workspace

- **WHEN** two panes share a `workspace_id` but report `cwd` in two different checkouts
- **THEN** their projected `Pane.project.repo_name` values differ, one per checkout

#### Scenario: A pane nested below its checkout

- **WHEN** a pane's `cwd` is `<checkout>/apps/bridge` and the `.git` lives at `<checkout>/.git`
- **THEN** the projected `checkout_path` is `<checkout>` and `repo_name` is its basename

#### Scenario: A pane in a linked worktree

- **WHEN** the directory found by the walk holds a `.git` FILE
- **THEN** the projected `Pane.project.is_linked_worktree` is `true`, and `false` when it holds a `.git` directory

#### Scenario: A pane outside any repository

- **WHEN** a pane's `cwd` has no `.git` at any level up to the filesystem root and its workspace has no `worktree`
- **THEN** the projected `Pane` has no `project` property

#### Scenario: The pane's own cwd outranks its workspace

- **WHEN** a pane's `cwd` resolves to one repository and its owning workspace carries a `worktree` for another
- **THEN** the projection uses the pane's `cwd`

#### Scenario: The workspace worktree still applies as a fallback

- **WHEN** a pane has no `cwd`, or its `cwd` resolves to no repository, and its owning workspace carries a `worktree`
- **THEN** the projected `Pane.project` comes from that `worktree`

#### Scenario: A pane in a git workspace

- **WHEN** a pane's `cwd` resolves to no repository and its workspace has `worktree: { repo_name: "kanhrd", checkout_path: "/home/op/src/kanhrd", is_linked_worktree: false, ... }`
- **THEN** the projected `Pane.project` is `{ repo_name: "kanhrd", checkout_path: "/home/op/src/kanhrd", is_linked_worktree: false }`

#### Scenario: A pane in a non-git workspace

- **WHEN** a pane's `cwd` resolves to no repository and the owning workspace has no `worktree`
- **THEN** the projected `Pane` has no `project` property

#### Scenario: The foreground directory is ignored

- **WHEN** a pane reports a `foreground_cwd` in a different repository from its `cwd`
- **THEN** the projection follows `cwd`, and the card does not change swimlane

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

`worktree` is genuinely optional and observed absent: the herdr builds
seen so far return workspaces with no `worktree` field from either
`workspace.list` or `workspace.get`. The cache SHALL therefore treat it
as a provenance FALLBACK rather than the source, and code comments SHALL
NOT claim herdr always sends it.

No new herdr request, poll, subscription or capability flag SHALL be
introduced: `worktree`, when a herdr sends it, arrives on the
`workspace.list` call `refresh()` already makes.

#### Scenario: A workspace inside a git checkout

- **WHEN** `workspace.list` returns a workspace whose `worktree.repo_name` is `kanhrd`
- **THEN** `workspaceWorktree(id)` returns that provenance object and `workspaceName(id)` is unchanged

#### Scenario: A workspace outside any repository

- **WHEN** `workspace.list` returns a workspace with no `worktree`
- **THEN** `workspaceWorktree(id)` returns `undefined` and no error is raised

#### Scenario: A herdr that never sends worktree

- **WHEN** every workspace in `workspace.list` omits `worktree`
- **THEN** the cache holds labels only, no error is raised, and pane provenance still resolves from each pane's `cwd`

#### Scenario: A workspace is renamed

- **WHEN** a `workspace.renamed` event arrives for a workspace whose worktree was cached
- **THEN** the cached label updates and the cached `worktree` is preserved

#### Scenario: An unknown workspace

- **WHEN** `workspaceWorktree` is called for an id the cache has never seen
- **THEN** it returns `undefined`
