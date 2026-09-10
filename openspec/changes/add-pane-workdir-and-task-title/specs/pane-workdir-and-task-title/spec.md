## Purpose

Two per-card identity layers: the pane's working directory, sourced from
herdr and carried on the wire, and a task title authored by the operator
and stored per device. herdr's own label / title / agent name is
preserved unchanged; the task title sits on top of it and is never
written back to herdr.

## Vocabulary

User-facing copy says **card**; code, wire and schema say `pane`. A
board grouping is a **status column**. A **pen** is a host, a **field** a
workspace, a **lane** a tab.

## ADDED Requirements

### Requirement: The schema models herdr's pane working-directory fields

`HerdrPaneInfo` in `packages/schema/src/herdr.ts` SHALL declare both
working-directory fields herdr's `PaneInfo` carries, typed as optional
and nullable because herdr marks neither as required:

```text
cwd?: string | null;
foreground_cwd?: string | null;
```

The declaring comment SHALL cite herdr's `PaneInfo` as the source and
SHALL record that `cwd` is the pane's own directory while
`foreground_cwd` is the active foreground process's directory.

#### Scenario: A herdr host reports both directories

- **WHEN** the bridge receives a `pane.list` entry carrying `cwd` and `foreground_cwd`
- **THEN** both values type-check against `HerdrPaneInfo` without a cast

#### Scenario: A herdr host omits both directories

- **WHEN** the bridge receives a `pane.list` entry with neither `cwd` nor `foreground_cwd`
- **THEN** the entry still type-checks against `HerdrPaneInfo` and no runtime error is raised

### Requirement: The bridge-projected pane carries one resolved workdir

The wire `Pane` interface in `packages/schema/src/herdr.ts` SHALL gain
exactly one optional field, `cwd?: string`, documented as the pane's
working directory as reported by herdr.

`projectPane` in `apps/bridge/src/herdr/project.ts` SHALL resolve it as
`pane.cwd ?? pane.foreground_cwd`, mirroring the existing
`display_agent ?? agent` precedence, and SHALL set the field only when
the resolved value is a non-empty string. A `null` or empty resolved
value SHALL leave the field absent rather than emitting `null` or `""`.

No new bridge request, subscription, poll, cache or capability flag
SHALL be introduced: the values already arrive on the existing
`pane.list` responses.

#### Scenario: herdr reports a pane cwd

- **WHEN** herdr reports `cwd: "/home/op/src/kanhrd"` for a pane
- **THEN** the projected `Pane` has `cwd: "/home/op/src/kanhrd"`

#### Scenario: herdr reports only a foreground cwd

- **WHEN** herdr reports `cwd: null` and `foreground_cwd: "/home/op/src/kanhrd/apps/web"`
- **THEN** the projected `Pane` has `cwd: "/home/op/src/kanhrd/apps/web"`

#### Scenario: herdr reports neither

- **WHEN** herdr reports `cwd: null` and no `foreground_cwd`
- **THEN** the projected `Pane` has no `cwd` property at all

#### Scenario: An older herdr sends no directory fields

- **WHEN** a pen runs a herdr build whose `PaneInfo` predates these fields
- **THEN** the projected `Pane` has no `cwd` property and every other field projects as before

### Requirement: A card renders the pane working directory as a location line

The card SHALL render the workdir on its own single line beneath the
title, in `--font-mono` at `--fs-caption` in `--ink-mute`, alongside the
existing `field / lane` text.

The displayed value SHALL be computed as the last two segments of the
absolute path, joined by `/` and prefixed with `…/` when earlier
segments were dropped. The path SHALL NOT be otherwise rewritten: no
`$HOME` collapsing, no repo-name inference, no case change.

The line SHALL be a single non-wrapping line that truncates with an
ellipsis and SHALL NOT cause page-level horizontal overflow at any
width, 390px included. The full absolute path SHALL be reachable
without hover — it is rendered in full on the pane-detail route and
exposed on keyboard focus — with a `title` attribute carrying the full
path as a pointer convenience only.

When the pane has no `cwd`, the card SHALL render no location line, no
placeholder, no dash and no skeleton.

#### Scenario: A card shows a deep path

- **WHEN** a pane reports `cwd: "/home/op/workspace/src/github.com/wakaru44/kanhrd"`
- **THEN** the card's location line reads `…/wakaru44/kanhrd` and its `title` attribute is the full absolute path

#### Scenario: A card shows a shallow path

- **WHEN** a pane reports `cwd: "/srv"`
- **THEN** the card's location line reads `/srv` with no `…/` prefix

#### Scenario: A pane has no reported directory

- **WHEN** a pane's projected `Pane` has no `cwd`
- **THEN** the card renders no location line and its layout does not reserve space for one

#### Scenario: A long path at phone width

- **WHEN** the board renders a card with a 200-character `cwd` in a 390px viewport
- **THEN** the location line truncates inside the card and the page's horizontal scroll width does not exceed the viewport width

### Requirement: Pane detail shows the full working directory

The pane-detail route SHALL render the pane's full absolute `cwd` in its
metadata strip, in `--font-mono`, selectable as text, wrapping or
scrolling inside its own container rather than widening the page. When
the pane has no `cwd` the row SHALL be absent.

#### Scenario: Opening a card with a workdir

- **WHEN** the operator opens `/pane/:host/:id` for a pane reporting a `cwd`
- **THEN** the metadata strip shows the full absolute path, not the truncated card form

#### Scenario: Opening a card without a workdir

- **WHEN** the operator opens a pane whose `Pane` has no `cwd`
- **THEN** the metadata strip omits the directory row entirely

### Requirement: Task titles are stored per device under a named key

The SPA SHALL persist operator-authored task titles in
`localStorage` under the exact key `kanhrd.task-titles`, holding a JSON
object nested by pen name then pane id:

```text
{ "<host>": { "<pane_id>": "<task title>" } }
```

Access SHALL go through a signals-based
`apps/web/src/app/state/task-title.service.ts`, modelled on
`apps/web/src/app/state/theme.service.ts`. Every read and write SHALL be
wrapped so that a private window, blocked site data or malformed stored
JSON yields "no titles" rather than an error or a blank board.

A stored title SHALL be trimmed and capped at 80 characters. A title
that is empty after trimming SHALL delete the entry rather than store an
empty string. A pen whose map becomes empty SHALL be removed from the
object.

Because the key carries the `kanhrd.` prefix, it SHALL be cleared by the
existing local-data wipe without a new code path.

#### Scenario: Setting a title

- **WHEN** the operator names the task on pane `p1` of pen `laptop` as `fix the backlog storm`
- **THEN** `localStorage['kanhrd.task-titles']` parses to `{ "laptop": { "p1": "fix the backlog storm" } }`

#### Scenario: A pen name containing punctuation

- **WHEN** the pen is named `ops:eu-west-1` and a title is stored for one of its panes
- **THEN** the pen name is a whole object key and no delimiter parsing is applied to it

#### Scenario: Storage is unavailable

- **WHEN** `localStorage` throws on read
- **THEN** the board renders with herdr names only and no error is surfaced

#### Scenario: Stored JSON is corrupt

- **WHEN** `kanhrd.task-titles` holds a string that is not a valid title map
- **THEN** the service treats it as empty and overwrites it on the next successful write

#### Scenario: An over-long title

- **WHEN** the operator submits a 300-character title
- **THEN** the stored value is the first 80 characters of the trimmed input

#### Scenario: Clearing a title

- **WHEN** the operator submits an empty or whitespace-only title for a pane that had one
- **THEN** the entry is deleted and the card falls back to herdr's name

### Requirement: Task titles never reach herdr

The SPA and the bridge SHALL NOT call `pane.rename`,
`pane.report_metadata`, or any other herdr write in the course of
setting, changing or clearing a task title. herdr's `label`, `title`,
`display_agent` and `state_labels` SHALL be treated as read-only facts.

#### Scenario: Renaming a task

- **WHEN** the operator sets or clears a task title
- **THEN** no bridge request is issued and no herdr method is invoked

### Requirement: The task title is the card's primary title and herdr's name stays visible

When a pane has a task title, the card's title slot SHALL render that
title and herdr's own name (`display_agent ?? agent ?? title ?? pane id
prefix`, the existing resolution) SHALL move to the card's meta row in
`--ink-mute`. When a pane has no task title, the title slot SHALL render
herdr's name exactly as it does today and no secondary name row SHALL be
rendered.

The card title SHALL be set in `--font-ui` at weight `--fw-medium`
(`500`) in both densities, per the binding family table in
`docs/DESIGN-SYSTEM.md` § Typography. The display serif SHALL NOT be
used for a card title.

Neither value SHALL be merged into the other, and a task title SHALL NOT
suppress herdr's name: when the two disagree, both are on screen, the
operator's above and herdr's below.

#### Scenario: A titled card

- **WHEN** pane `p1` reports agent `claude` and has task title `fix the backlog storm`
- **THEN** the card title reads `fix the backlog storm` in `--font-ui` weight 500 and the meta row shows `claude` in `--ink-mute`

#### Scenario: An untitled card

- **WHEN** pane `p2` reports agent `codex` and has no task title
- **THEN** the card title reads `codex` and no secondary herdr-name row is rendered

#### Scenario: herdr renames the pane under a title

- **WHEN** herdr changes a titled pane's `display_agent` from `claude` to `claude-review`
- **THEN** the card title is unchanged and the meta row updates to `claude-review`

#### Scenario: Confirmation copy prefers the operator's words

- **WHEN** a close confirmation is raised for a titled card
- **THEN** the confirmation names the task title, because that is what the operator recognises

### Requirement: The rename entry point is visible, not hover-only

The card SHALL expose the rename action as an item in its
`LucideMoreHorizontal` overflow menu, whose trigger is visible on first
render. Pane detail SHALL expose the same action as a visible control in
its header. No hover-only pencil, no hover-revealed inline control, and
no click-to-edit on the title text itself SHALL be introduced.

Under `pointer: coarse` the overflow trigger and every menu item
SHALL present a touch target of at least 40x40, satisfied at 390px.
Card opening and the rename action SHALL remain separate semantic
controls; the rename control SHALL NOT be a `<button>` nested inside the
card's `<a>`.

Submitting the rename SHALL happen through a modal with a single text
input, seeded with the current task title (empty when none), offering a
save action, a clear action when a title exists, and cancel. The modal
title SHALL use `--font-display` per the modal-title rule. `Escape`
SHALL cancel, `Enter` SHALL submit, and focus SHALL return to the
originating card's overflow trigger on close.

#### Scenario: Finding rename on a card

- **WHEN** the board renders a card with no pointer hovering it
- **THEN** the overflow trigger is visible and its menu contains the rename item

#### Scenario: Renaming on a phone

- **WHEN** the operator taps the overflow trigger on a compact card at 390px
- **THEN** the trigger and the rename menu item each measure at least 40x40 and the menu opens inside the viewport

#### Scenario: Cancelling the modal

- **WHEN** the rename modal is open and the operator presses `Escape`
- **THEN** no title is written and focus returns to the overflow trigger that opened it

#### Scenario: Renaming from pane detail

- **WHEN** the operator opens `/pane/:host/:id`
- **THEN** a visible rename control is present in the header without hovering

### Requirement: Task-title copy lives in the shared copy module

Every user-facing string this change introduces SHALL be defined in
`apps/web/src/app/shared/copy.ts` and referenced from templates and
components, never inlined. The strings SHALL follow `docs/BRAND.md`:
lowercase or sentence case, no exclamation marks, and no care verbs —
naming a task is not a lifecycle, empty or error surface.

The keys SHALL be:

```text
card.taskTitleAction      rename task
card.taskTitleModalTitle  name this task
card.taskTitleFieldLabel  task name
card.taskTitleSave        save
card.taskTitleClear       clear
card.taskTitleHelp        shown on this device only.
```

#### Scenario: A template needs the rename label

- **WHEN** the card's overflow menu renders its rename item
- **THEN** the label comes from `card.taskTitleAction` in `copy.ts`

#### Scenario: The operator is told the scope of a title

- **WHEN** the rename modal is open
- **THEN** `card.taskTitleHelp` is shown, so the per-device scope is stated before the title is saved

### Requirement: Stored titles are pruned against authoritative pane lists

When a pen is connected and the SPA holds a full pane list for it, the
service SHALL delete stored titles for that pen whose pane ids are
absent from that list. It SHALL NOT prune for a pen that is
disconnected, erroring, or whose pane list has not been received —
a missing pen is not evidence that its cards are gone.

#### Scenario: A pane is closed

- **WHEN** pen `laptop` is connected and its pane list no longer contains `p1`
- **THEN** the stored title for `laptop`/`p1` is deleted

#### Scenario: A pen goes offline

- **WHEN** pen `laptop` disconnects and its cards leave the board
- **THEN** its stored titles are retained and reappear when the pen reconnects
