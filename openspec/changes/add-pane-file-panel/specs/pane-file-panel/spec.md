## ADDED Requirements

### Requirement: The panel is read-only and says so by having no write control

The file panel SHALL offer no control that creates, renames, moves, deletes,
stages, discards or edits anything in the checkout, and SHALL call no bridge
method but `repo.status`, `repo.tree`, `file.read` and `repo.diff`. The
viewer's text SHALL be selectable and copyable and SHALL NOT be an editable
field.

#### Scenario: Nothing in the panel writes

- **WHEN** the panel is open on a modified file
- **THEN** it offers `source`, `diff` and, where the type has one,
  `rendered`, and no control that changes the file

### Requirement: The panel is collapsed by default behind one visible toggle

The pane detail view SHALL render the panel collapsed on first open and
SHALL offer exactly one visible toggle for it, in the meta strip at the
trailing edge of the repo name. The toggle SHALL NOT be hover-revealed and
SHALL carry `aria-expanded` and an accessible name naming the repo. A pane
whose bridge does not advertise `repoFiles` SHALL render no toggle at all.
A pane with no `project` SHALL still render the toggle, at the end of the
meta strip, because the absence of a repository is itself the answer the
operator opened it for.

#### Scenario: First open

- **WHEN** the operator opens a pane whose host advertises `repoFiles`
- **THEN** the terminal fills the body, the panel is not rendered, and the
  toggle reads `aria-expanded="false"`

#### Scenario: A bridge with no file methods

- **WHEN** `bridge.capabilities` for the pane's host carries no `repoFiles`
- **THEN** no file toggle is rendered anywhere in the view

### Requirement: The key bar keeps its place while the panel has focus

Focusing the panel SHALL NOT collapse, hide or resize the key bar, and the
bottom reserve the key bar measures SHALL keep its value across every panel
interaction. The view SHALL use the key bar's existing reserve mechanism and
SHALL NOT introduce a second one.

#### Scenario: Focus moves into the panel

- **WHEN** the operator taps a file in the panel while the key bar is expanded
- **THEN** the key bar is still expanded and the reserved bottom space is
  unchanged

### Requirement: The split is draggable, remembered, and axis-aware

The terminal and the panel SHALL share the body through a splitter. The
terminal's default share SHALL be `0.6` when the view is laid out
horizontally and `0.5` when vertically, and the axis SHALL follow the
viewport's orientation. A ratio SHALL be clamped to `[0.2, 0.8]`. A ratio
the operator sets SHALL be persisted per axis and restored on the next open;
a storage that throws or holds nothing usable SHALL fall back to the
defaults without failing the view. The splitter SHALL be a keyboard-operable
`separator` that moves in `0.05` steps and SHALL have a hit area no smaller
than the minimum touch target.

#### Scenario: A dragged split survives a reload

- **WHEN** the operator drags the splitter to 0.35 in landscape and reloads
- **THEN** the panel opens again at 0.35 on that axis

#### Scenario: Storage is unavailable

- **WHEN** `localStorage` throws on read
- **THEN** the split opens at the defaults and the panel renders normally

### Requirement: The panel lays itself out by its own width

The panel SHALL show the browser and the viewer side by side while the
PANEL's own width is at least `560px`, and SHALL otherwise show one of them
at a time behind a segmented control. The decision SHALL be made from the
panel's measured width, never from the viewport's.

#### Scenario: A narrow panel on a wide screen

- **WHEN** the operator drags the splitter until the panel is 300px wide on
  a desktop viewport
- **THEN** the panel shows one surface at a time with a segmented control

### Requirement: The tree is fetched one level at a time

The browser SHALL call `repo.tree` for the checkout root when the panel
opens, and once more for each directory the operator expands, and SHALL NOT
pre-walk the tree. An expanded directory's entries SHALL be kept while the
panel stays open. A `repo.tree` result with `truncated: true` SHALL render a
stated caption under that directory's entries rather than silently showing a
short list.

#### Scenario: A huge directory

- **WHEN** a directory holds more entries than `treeMaxEntries`
- **THEN** its listed entries are followed by a caption saying the listing
  was cut, and no further request is made for the rest

#### Scenario: An ignored directory

- **WHEN** the root holds an ignored `node_modules`
- **THEN** it is listed as a directory, marked ignored, and its contents are
  requested only if the operator expands it

### Requirement: Git state is a letter and a colour, never a colour alone

Every entry the panel marks as changed or untracked SHALL carry a text
marker as well as its colour, and the panel's status line SHALL name the
state in words. Diff lines SHALL carry their `+`/`-` marker in a column of
their own.

#### Scenario: Reading the tree without colour

- **WHEN** the panel renders a modified and an untracked file
- **THEN** each row carries a letter (`M`, `U`) that says which it is

### Requirement: Status is polled while the panel is open

The panel SHALL call `repo.status` when it opens and SHALL re-call it every
`repoFiles.statusPollIntervalMs`, and SHALL stop polling when the panel is
collapsed, when the view is destroyed, when the pane's host is out of sight,
and when the pane is gone. A status result with `truncated: true` SHALL be
reported as cut rather than presented as the whole picture.

#### Scenario: Collapsing the panel

- **WHEN** the operator collapses the panel
- **THEN** no further `repo.status` request is made for that pane

### Requirement: The panel tells the truth about why it cannot show files

The panel SHALL render exactly one of these states, and SHALL NOT render an
empty tree, a spinner that never ends, or a console-only error in place of
any of them:

- **no repository** — the pane carries no `project`;
- **not local** — the pane carries a `project` with no `files_local`, or any
  method answers `files_not_local`; the state SHALL name the pane's host and
  SHALL say the bridge reads only checkouts on its own filesystem;
- **not a repository / git missing** — `not_a_repository` or
  `git_unavailable`;
- **gone** — `pane_not_found` or `no_checkout` after the panel was open;
- **failed** — any other error, quoting the bridge's message verbatim, with
  a visible retry.

#### Scenario: A remote host

- **WHEN** the operator opens the panel on a pane whose host is reached over
  a tunnel
- **THEN** the panel states that the files are on another machine and names
  the host, and issues no further file request for that pane

#### Scenario: An error is never swallowed

- **WHEN** `repo.status` answers an error the panel has no specific state for
- **THEN** the panel shows the bridge's own message and a retry control

### Requirement: A file the bridge will not send is a state, not a blank

A `file.read` answering `binary: true` SHALL render a stated binary notice
with the file's size, and SHALL offer `diff` where the bridge reports a
change. A `file_too_large` error SHALL render a stated notice carrying the
file's size and the bridge's cap, both as data readouts. Neither SHALL be
reported as a failure to read.

#### Scenario: A PNG

- **WHEN** the operator opens a `.png` in the checkout
- **THEN** the viewer states it is binary and shows its size, and offers no
  source view

#### Scenario: A 4 MiB log

- **WHEN** the operator opens a file above `fileReadMaxBytes`
- **THEN** the viewer states it is too big and shows its size against the cap

### Requirement: The repo may change under the panel

A path that stops existing between listing and reading SHALL render a stated
notice naming the path, SHALL NOT clear the tree, and SHALL leave the
operator on a panel they can keep using. A `repo.status` poll that answers an
error SHALL leave the last good status on screen, marked as stale, rather
than blanking it.

#### Scenario: A file deleted while selected

- **WHEN** the agent deletes the file the viewer is showing and the operator
  re-reads it
- **THEN** the viewer states the path is gone from the checkout and the tree
  is still usable

### Requirement: A path can be pasted

The panel SHALL accept a checkout-relative path typed or pasted into a field
at its head, SHALL normalize a leading `./` or `/`, and SHALL reveal and
select it. A path the bridge answers `not_found` or `path_outside_checkout`
for SHALL be reported in the field's own error line, naming the repo and the
path, and SHALL NOT replace the panel's contents.

#### Scenario: A path outside the checkout

- **WHEN** the operator pastes an absolute path from another machine
- **THEN** the field states it is not in this repo and the tree is untouched

### Requirement: The panel's copy comes from the approved-copy table

Every user-facing string in the panel SHALL be referenced from
`shared/copy.ts` and SHALL appear in the approved-copy table in
`docs/BRAND.md`. Byte counts, entry counts, line numbers, paths, git letters
and the bridge's quoted `{reason}` are data readouts and SHALL stay in the
template.

#### Scenario: No inline string

- **WHEN** the panel's templates are scanned for user-facing text
- **THEN** every one resolves through `COPY`
