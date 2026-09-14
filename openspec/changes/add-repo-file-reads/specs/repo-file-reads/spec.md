## ADDED Requirements

### Requirement: File methods are keyed by pane and advertised by capability

The bridge SHALL expose `repo.status`, `repo.tree`, `file.read` and
`repo.diff`. Every one SHALL take a `pane_id` and SHALL resolve the checkout
from that pane as herdr reports it at call time; no method SHALL accept a
checkout path or an absolute path from the client. A pane herdr no longer
lists SHALL be `pane_not_found`, and a pane with no `project` SHALL be
`no_checkout`.

`bridge.capabilities` SHALL carry `repoFiles` —
`{ statusPollIntervalMs, fileReadMaxBytes, diffMaxBytes, treeMaxEntries,
statusMaxEntries }` — when the bridge implements the four methods, and SHALL
omit the field entirely otherwise.

#### Scenario: A client probes before showing the panel

- **WHEN** the SPA calls `bridge.capabilities` against this bridge
- **THEN** the result carries `repoFiles` with a positive
  `statusPollIntervalMs` and the byte and entry caps

#### Scenario: The client cannot name a directory

- **WHEN** a client calls `repo.tree` with a `pane_id` and `path: "/etc"`
- **THEN** the bridge answers `path_outside_checkout` and lists nothing

### Requirement: Every method is read-only

No file method SHALL create, modify, move or delete any file, including
git's own index and lock files. Git SHALL be run with optional locks disabled.
There SHALL be no write method in this capability.

#### Scenario: Status does not touch the index

- **WHEN** `repo.status` runs against a checkout whose index is stale
- **THEN** the index file's modification time is unchanged afterwards

### Requirement: Paths are confined to the checkout

A `path` SHALL be checkout-relative with `/` separators; an empty or omitted
`path` names the checkout root where a method allows it. The bridge SHALL
refuse with `path_outside_checkout`:

- an absolute path;
- any path containing a `..` segment or a NUL byte;
- any path whose real path, after resolving every symlink, is not the
  checkout's real path or inside it;
- any path with a `.git` segment, before or after resolution.

A path that does not exist SHALL be `not_found`, after its nearest existing
ancestor has passed the same real-path check.

#### Scenario: Dot-dot traversal

- **WHEN** a client calls `file.read` with `path: "../outside.txt"`
- **THEN** the bridge answers `path_outside_checkout`

#### Scenario: Absolute path

- **WHEN** a client calls `file.read` with an absolute path to a file that
  is inside the checkout
- **THEN** the bridge answers `path_outside_checkout`

#### Scenario: A symlink that escapes

- **WHEN** the checkout holds `link -> /some/dir/outside` and a client calls
  `file.read` with `path: "link/secret.txt"`
- **THEN** the bridge answers `path_outside_checkout` and reads nothing

#### Scenario: A symlink that stays inside

- **WHEN** the checkout holds `alias.md -> README.md`
- **THEN** `file.read` of `alias.md` returns `README.md`'s content

### Requirement: Files are served only from the bridge's own machine

The bridge SHALL grant file access for a pane only when all of these hold:
the pane's host is not configured with `files: false`; herdr reported a `cwd`
for the pane and that directory exists on the bridge's filesystem; the
pane's `checkout_path` exists there too and the `cwd`'s real path lies inside
its real path; and `git rev-parse --show-toplevel`, run locally in the
`cwd`, prints that same checkout. Otherwise every file method SHALL answer
`files_not_local` and SHALL NOT read any file.

`Pane.project.files_local` SHALL be `true` when the cheap part of this gate
holds — host enabled, `cwd` and checkout exist locally, `cwd` inside the
checkout — and SHALL be absent otherwise. The methods SHALL re-check the
whole gate on every call rather than trust the flag.

#### Scenario: A tunnelled host's paths do not exist here

- **WHEN** a pane on a tunnelled host reports `cwd` and `checkout_path` under
  `/home/remote-user/src/app`, which does not exist on the bridge's machine
- **THEN** the pane carries no `files_local`, and `file.read` answers
  `files_not_local`

#### Scenario: A remote cwd under a local repository

- **WHEN** a remote pane's `cwd` does not exist locally but one of its
  ancestors on the bridge's machine is a git checkout
- **THEN** the bridge answers `files_not_local` and serves nothing from the
  local ancestor

#### Scenario: The operator disables a host

- **WHEN** a host is configured with `files: false`
- **THEN** every file method for its panes answers `files_not_local`, even
  when its paths exist locally

### Requirement: Status is porcelain v2 for the checkout

`repo.status` SHALL return `{ checkout_path, branch, head, upstream?,
ahead?, behind?, entries, truncated }`, from
`git status --porcelain=v2 --branch -z --untracked-files=normal`. `branch`
SHALL be `null` when HEAD is detached and `head` SHALL be `null` when the
branch has no commit. Each entry SHALL be `{ path, kind, index, worktree,
orig_path? }` with `kind` one of `changed`, `renamed`, `unmerged`,
`untracked`, and `index`/`worktree` git's single-letter codes (`.` for
unmodified, `?` for untracked). At most `statusMaxEntries` entries SHALL be
returned, with `truncated: true` when more existed. The client SHALL poll
this method; the bridge SHALL NOT push status.

#### Scenario: A modified and an untracked file

- **WHEN** a tracked file is edited and a new file is created
- **THEN** `repo.status` lists the first as `changed` with `worktree: "M"`
  and the second as `untracked`

#### Scenario: Not a repository

- **WHEN** the checkout is no longer a git repository
- **THEN** the bridge answers `not_a_repository`

#### Scenario: Git is missing

- **WHEN** no `git` executable is on the bridge's `PATH`
- **THEN** the bridge answers `git_unavailable`

### Requirement: The tree is listed one level at a time

`repo.tree` SHALL take `{ pane_id, path? }` and return `{ path, entries,
truncated }` for that single directory, never recursing. Each entry SHALL be
`{ name, path, type, size?, ignored }` with `type` one of `file`,
`directory`, `symlink`, `other`, `size` present for files, and `ignored`
reflecting git's ignore rules. Directories SHALL sort before other entries,
each group by name. `.git` SHALL be omitted. At most `treeMaxEntries`
entries SHALL be returned, with `truncated: true` when more existed. A path
that is not a directory SHALL be `not_a_directory`.

#### Scenario: A large ignored directory is not walked

- **WHEN** the checkout root holds an ignored `node_modules` with many
  thousands of files
- **THEN** `repo.tree` of the root returns one `node_modules` entry with
  `type: "directory"` and `ignored: true`, without listing its contents

### Requirement: File reads are capped, typed and encoded

`file.read` SHALL take `{ pane_id, path }`. A file larger than
`fileReadMaxBytes` SHALL be refused with `file_too_large`, naming its size
and the cap. A file whose first 8000 bytes hold a NUL, or which is not valid
UTF-8, SHALL return `{ path, size, mtime_ms, binary: true }` with no
content. Any other file SHALL return `{ path, size, mtime_ms, binary: false,
encoding: "utf-8", content }`. A path that is not a regular file SHALL be
`not_a_file`.

#### Scenario: A binary file

- **WHEN** a client reads a PNG inside the checkout
- **THEN** the result is `binary: true` and carries no `content`

#### Scenario: An oversized file

- **WHEN** a client reads a 2 GiB file inside the checkout
- **THEN** the bridge answers `file_too_large` without reading its contents

### Requirement: Diffs compare the working tree with HEAD

`repo.diff` SHALL take `{ pane_id, path }` and return `{ path, change,
binary, diff, truncated }` where `change` is one of `modified`, `added`,
`deleted`, `type_changed`, `untracked`, `ignored`, `unchanged`, and `diff`
is a unified diff of the working tree against `HEAD` (against the empty tree
when the branch has no commit). An untracked, non-ignored file SHALL be
diffed against the empty file. An ignored or unchanged path SHALL carry an
empty `diff`. A binary change SHALL carry `binary: true` and an empty
`diff`. A diff longer than `diffMaxBytes` SHALL be cut at a line boundary
with `truncated: true`. A deleted file SHALL be diffable although it no
longer exists on disk.

#### Scenario: An untracked file

- **WHEN** a client diffs a newly created, non-ignored file
- **THEN** `change` is `untracked` and `diff` shows every line added

#### Scenario: A deleted file

- **WHEN** a tracked file has been removed from the working tree
- **THEN** `change` is `deleted` and `diff` shows every line removed
