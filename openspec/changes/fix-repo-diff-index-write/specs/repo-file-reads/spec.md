## MODIFIED Requirements

### Requirement: Every method is read-only

No file method SHALL create, modify, move or delete any file, including
git's own index and lock files. Git SHALL be run with optional locks disabled.
Disabling optional locks is necessary but NOT sufficient: git's porcelain
`diff` refreshes the index's stat cache and writes `.git/index` without
consulting `--no-optional-locks` or `GIT_OPTIONAL_LOCKS`, so `repo.diff`
SHALL use the `diff-index` plumbing for tracked paths rather than the
porcelain. There SHALL be no write method in this capability.

#### Scenario: Status does not touch the index

- **WHEN** `repo.status` runs against a checkout whose index is stale
- **THEN** the index file's modification time is unchanged afterwards

#### Scenario: Diffing a tracked file saved without an edit does not touch the index

- **WHEN** a tracked file's content still matches `HEAD` but its modification
  time is newer than the index's, and `repo.diff` runs against that file
- **THEN** the index file's modification time is unchanged afterwards

#### Scenario: Listing and reading do not touch the index

- **WHEN** `repo.tree` or `file.read` runs against a checkout whose index is
  stale
- **THEN** the index file's modification time is unchanged afterwards

### Requirement: Diffs compare the working tree with HEAD

`repo.diff` SHALL take `{ pane_id, path }` and return `{ path, change,
binary, diff, truncated }` where `change` is one of `modified`, `added`,
`deleted`, `type_changed`, `untracked`, `ignored`, `unchanged`, and `diff`
is a unified diff of the working tree against `HEAD` (against the empty tree
when the branch has no commit). An untracked, non-ignored file SHALL be
diffed against the empty file. An ignored or unchanged path SHALL carry an
empty `diff`. A tracked file whose stat no longer matches the index but whose
content still matches `HEAD` SHALL be `unchanged` with an empty `diff`, and
the bridge SHALL reach that answer from the diff itself rather than by
refreshing the index. A binary change SHALL carry `binary: true` and an empty
`diff`. A diff longer than `diffMaxBytes` SHALL be cut at a line boundary
with `truncated: true`. A deleted file SHALL be diffable although it no
longer exists on disk.

#### Scenario: An untracked file

- **WHEN** a client diffs a newly created, non-ignored file
- **THEN** `change` is `untracked` and `diff` shows every line added

#### Scenario: A deleted file

- **WHEN** a tracked file has been removed from the working tree
- **THEN** `change` is `deleted` and `diff` shows every line removed

#### Scenario: A tracked file saved without an edit

- **WHEN** a client diffs a tracked file whose modification time is newer
  than the index's but whose content still matches `HEAD`
- **THEN** `change` is `unchanged` and `diff` is empty
