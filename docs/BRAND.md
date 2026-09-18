# kanhrd — brand identity

**Codename: neo-shepherd.**

kanhrd is the paper lantern above the flock. You glance, you know, you tend.

Companion documents: [`DESIGN-SYSTEM.md`](DESIGN-SYSTEM.md) owns visual
primitives, [`UX-GUIDELINES.md`](UX-GUIDELINES.md) owns interactions.
This file owns identity and voice.

## Positioning

kanhrd is a client for [herdr](https://github.com/herdrdev/herdr). herdr is
the terminal that runs the flock; kanhrd is the board where a shepherd
watches every animal at once, across every workspace.

- Not a Jira. Not a Grafana. Not a mobile-first novelty.
- A calm, precise devtool that treats _watching_ as a first-class action.
- Inherits herdr's technical honesty and lowercase voice; adds warmth by
  choosing paper over graphite as the default surface.

## Origin

The name compresses **kan**(ban) 看板 — the Japanese signboard that gave
the world its most famous production board — with **herdr**. The
identity extends the herding metaphor herdr already owns (🐑 in its
README, "the runtime your coding agents live on") and pairs it with a
Japanese-shepherd register: 番犬 (banken, watchdog) more than sheep.

Aesthetic reference points: Kinfolk restraint, ukiyo-e ink discipline,
Muji product signage, a `dotfiles/` repo that grew up. Neo-Tokyo without
the neon.

## Wordmark

`kanhrd` — always lowercase, set in **Shippori Mincho**, the display
serif. Above the `n` (which has no descender), a single ochre brushstroke
crook: a shepherd's hook that reads, at a glance, as の. The crook is the
only mark; the wordmark carries the rest.

- Asset: `apps/web/public/mark/crook.svg`, drawn in `--ochre`.
- Favicon: `apps/web/public/favicon.svg` — the crook alone, ochre on
  cream, with a dark-mode variant selected via
  `<link rel="icon" media="(prefers-color-scheme: dark)">`.
- Browser title: `kanhrd — a shepherd's console`.

Do not:

- Uppercase the wordmark.
- Set it in the UI sans (Inter).
- Add a tagline lockup inside the mark. Tagline is separate typography.

### Where the serif is allowed

The display serif is a **display face**, not the product's voice made
visible. It appears on:

- the wordmark;
- status column headings;
- modal titles;
- page-level empty-state and 404 headlines;
- settings section headings.

It does **not** appear on agent card titles, pane-detail titles, or any
other repeated technical identifier. Those use Inter at weight 500.
Repeating a serif across hundreds of identifiers dilutes hierarchy and
slows scanning; the serif earns its weight by being rare. See
`DESIGN-SYSTEM.md` § Typography for the binding family table.

## Tagline candidates (pick one per surface)

- **README / OG**: _watch the flock, tend the ones that stop._
- **App shell**: _a shepherd's console._
- **Empty state**: _no hosts yet._

Never all three at once.

## Voice

Terse. Lowercase. Verbs of tending. Care surfaces on **lifecycle** and
**empty/error** moments only — the places a novice user is disoriented
and a veteran user wants a soft edge. Data readouts stay clinical so the
board remains scannable.

**Care copy is a softer register, never a softer fact.** A care phrase
may open a prompt; the body still states exactly what happens. Nothing
in kanhrd's copy may imply a pause, a recoverable state, or an undo that
does not exist. Closing a pane terminates the session. Say so.

### Approved copy

These strings live in `apps/web/src/app/shared/copy.ts` and are
referenced from templates by name. Templates never inline them. Data
readouts (durations, byte counts, revision ids, pane ids) are not
product copy and stay in the template.

| Key                                   | String                                                                                                                                        |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `emptyState.noHosts`                  | `no hosts yet.`                                                                                                                               |
| `emptyState.noHostsBody`              | `point kanhrd at a herdr socket. add a host to kanhrd.config.yaml:`                                                                           |
| `emptyState.noHostsThen`              | `then start the bridge:`                                                                                                                      |
| `emptyState.noHostsDocsLink`          | `read the operating guide`                                                                                                                    |
| `emptyState.waitingForHost`           | `waiting for a host…`                                                                                                                         |
| `emptyState.hostEmpty`                | `this host is quiet. nothing running here yet.`                                                                                               |
| `emptyState.noMatches`                | `nothing matches these filters.`                                                                                                              |
| `emptyState.noMatchesAction`          | `clear filters`                                                                                                                               |
| `emptyState.scopeEmpty`               | `nothing in this scope.`                                                                                                                      |
| `emptyState.scopeEmptyAction`         | `clear scope`                                                                                                                                 |
| `emptyState.notFound`                 | `off the map.`                                                                                                                                |
| `emptyState.notFoundAction`           | `back to the board`                                                                                                                           |
| `emptyState.scopeUnavailable`         | `that workspace is no longer here.`                                                                                                           |
| `column.empty`                        | `0`                                                                                                                                           |
| `card.split`                          | `split`                                                                                                                                       |
| `card.splitRight`                     | `split right`                                                                                                                                 |
| `card.splitDown`                      | `split down`                                                                                                                                  |
| `card.move`                           | `move to…`                                                                                                                                    |
| `card.moveExistingTab`                | `another tab`                                                                                                                                 |
| `card.moveNewTab`                     | `a new tab`                                                                                                                                   |
| `card.moveNewWorkspace`               | `a new workspace`                                                                                                                             |
| `card.park`                           | `park in…`                                                                                                                                    |
| `card.unpark`                         | `unpark`                                                                                                                                      |
| `card.renameAction`                   | `rename card`                                                                                                                                 |
| `card.renameModalTitle`               | `name this card`                                                                                                                              |
| `card.renameFieldLabel`               | `card name`                                                                                                                                   |
| `card.renameSave`                     | `save`                                                                                                                                        |
| `card.renameClear`                    | `clear name`                                                                                                                                  |
| `park.newColumn`                      | `new column…`                                                                                                                                 |
| `park.defaultName`                    | `parked`                                                                                                                                      |
| `park.rule.never`                     | `never`                                                                                                                                       |
| `park.rule.agentActivity`             | `on agent activity`                                                                                                                           |
| `park.renameColumn`                   | `rename column`                                                                                                                               |
| `park.moveColumnLeft`                 | `move column left`                                                                                                                            |
| `park.moveColumnRight`                | `move column right`                                                                                                                           |
| `park.removeColumn`                   | `remove column`                                                                                                                               |
| `park.removeColumnBody`               | `the cards go back to their status columns. nothing on the host changes.`                                                                     |
| `confirm.closePane`                   | `let this one rest?`                                                                                                                          |
| `confirm.closePaneBody`               | `closing ends this session. the terminal and anything running in it stop. this cannot be undone.`                                             |
| `confirm.closePaneAction`             | `rest`                                                                                                                                        |
| `confirm.keep`                        | `keep`                                                                                                                                        |
| `confirm.cancel`                      | `cancel`                                                                                                                                      |
| `confirm.closeTab`                    | `let this tab rest?`                                                                                                                          |
| `confirm.closeTabBody`                | `these sessions end and cannot be recovered:`                                                                                                 |
| `confirm.closeTabAction`              | `close tab`                                                                                                                                   |
| `confirm.closeWorkspace`              | `let this workspace rest?`                                                                                                                    |
| `confirm.closeWorkspaceBody`          | `these sessions end and cannot be recovered:`                                                                                                 |
| `confirm.closeWorkspaceAction`        | `close workspace`                                                                                                                             |
| `confirm.closeLinkedWorkspaces`       | `close every linked workspace?`                                                                                                               |
| `confirm.closeLinkedWorkspacesBody`   | `this workspace shares a git worktree with others. all of them close, and every session inside them ends. this cannot be undone.`             |
| `confirm.closeLinkedWorkspacesAction` | `close all`                                                                                                                                   |
| `confirm.lastTabNote`                 | `this is the last tab in its workspace. the workspace closes too.`                                                                            |
| `confirm.previewHeading`              | `this closes:`                                                                                                                                |
| `confirm.refusalHeading`              | `herdr won't do that.`                                                                                                                        |
| `toast.hostDisconnected`              | `lost sight of {host}. retrying.`                                                                                                             |
| `toast.hostReconnected`               | `back in view.`                                                                                                                               |
| `toast.bridgeDisconnected`            | `lost the bridge. retrying.`                                                                                                                  |
| `toast.bridgeReconnected`             | `bridge back.`                                                                                                                                |
| `toast.splitFailed`                   | `couldn't split. herdr said: {reason}`                                                                                                        |
| `toast.closeFailed`                   | `couldn't close {name}. herdr said: {reason}`                                                                                                 |
| `toast.createPaneFailed`              | `couldn't open a card. herdr said: {reason}`                                                                                                  |
| `toast.createTabFailed`               | `couldn't open a tab. herdr said: {reason}`                                                                                                   |
| `toast.createWorkspaceFailed`         | `couldn't open a workspace. herdr said: {reason}`                                                                                             |
| `toast.renameFailed`                  | `couldn't rename. herdr said: {reason}`                                                                                                       |
| `toast.moveFailed`                    | `couldn't move {name}. herdr said: {reason}`                                                                                                  |
| `toast.moveZoomed`                    | `couldn't move it. the tab it's in is zoomed - unzoom it first.`                                                                              |
| `toast.liveUpdatesUnavailable`        | `no live updates for this card. herdr said: {reason}`                                                                                         |
| `toast.working`                       | `working…`                                                                                                                                    |
| `toast.dismiss`                       | `dismiss`                                                                                                                                     |
| `status.working`                      | `working`                                                                                                                                     |
| `status.blocked`                      | `blocked`                                                                                                                                     |
| `status.done`                         | `done`                                                                                                                                        |
| `status.idle`                         | `idle`                                                                                                                                        |
| `status.unknown`                      | `unknown`                                                                                                                                     |
| `loading.board`                       | `finding hosts…`                                                                                                                              |
| `loading.pane`                        | `keeping watch…`                                                                                                                              |
| `loading.retry`                       | `try again`                                                                                                                                   |
| `state.stale`                         | `stale — reconnecting`                                                                                                                        |
| `state.unavailable`                   | `this host is out of sight.`                                                                                                                  |
| `state.gone`                          | `the session ended. this is the last thing it said.`                                                                                          |
| `terminal.truncated`                  | `herdr sent the last {lines} lines. history above this line was not sent.`                                                                    |
| `terminal.truncatedRaise`             | `raise scrollback in settings.`                                                                                                               |
| `files.label`                         | `files`                                                                                                                                       |
| `files.toggleIn`                      | `files in {repo}`                                                                                                                             |
| `files.viewer`                        | `viewer`                                                                                                                                      |
| `files.tree`                          | `tree`                                                                                                                                        |
| `files.changedOnly`                   | `changed`                                                                                                                                     |
| `files.nothingChanged`                | `nothing changed in this checkout.`                                                                                                           |
| `files.showEveryFile`                 | `show every file`                                                                                                                             |
| `files.modeSource`                    | `source`                                                                                                                                      |
| `files.modeDiff`                      | `diff`                                                                                                                                        |
| `files.modeRendered`                  | `rendered`                                                                                                                                    |
| `files.pick`                          | `pick a file, or paste a path above.`                                                                                                         |
| `files.loading`                       | `reading…`                                                                                                                                    |
| `files.noRepo`                        | `no repository here.`                                                                                                                         |
| `files.noRepoBody`                    | `this pane isn't in a git checkout, so there is nothing to read.`                                                                             |
| `files.notLocal`                      | `these files are on another machine.`                                                                                                         |
| `files.notLocalBody`                  | `the bridge reads checkouts on its own filesystem only, and {host} is not on it.`                                                             |
| `files.notARepo`                      | `this checkout is no longer a git repository.`                                                                                                |
| `files.gitMissing`                    | `no git on the machine running the bridge.`                                                                                                   |
| `files.checkoutGone`                  | `this pane and its checkout are gone.`                                                                                                        |
| `files.failed`                        | `couldn't read it. the bridge said: {reason}`                                                                                                 |
| `files.statusStale`                   | `stale — last seen state`                                                                                                                     |
| `files.binary`                        | `binary file. nothing to read here.`                                                                                                          |
| `files.tooLarge`                      | `too big to read.`                                                                                                                            |
| `files.pathGone`                      | `gone from the checkout.`                                                                                                                     |
| `files.noChanges`                     | `no changes against head.`                                                                                                                    |
| `files.treeTruncated`                 | `the bridge stopped listing here.`                                                                                                            |
| `files.statusTruncated`               | `the bridge stopped counting here.`                                                                                                           |
| `files.diffTruncated`                 | `the bridge cut this diff short.`                                                                                                             |
| `files.renderedTruncated`             | `rendered the first {lines} lines. the rest is in source.`                                                                                    |
| `files.imageRemote`                   | `remote image. not loaded.`                                                                                                                   |
| `files.imageLocal`                    | `image in the checkout. the bridge can't send it yet.`                                                                                        |
| `files.ignored`                       | `ignored`                                                                                                                                     |
| `files.goto`                          | `go to path`                                                                                                                                  |
| `files.gotoPlaceholder`               | `paste a path`                                                                                                                                |
| `files.gotoSubmit`                    | `open`                                                                                                                                        |
| `files.gotoMissing`                   | `not in {repo}: {path}`                                                                                                                       |
| `files.resize`                        | `resize the file panel`                                                                                                                       |
| `files.surface`                       | `panel surface`                                                                                                                               |
| `nav.backToBoard`                     | `back to the board`                                                                                                                           |
| `nav.settings`                        | `settings`                                                                                                                                    |
| `nav.toggleNav`                       | `toggle navigation`                                                                                                                           |
| `nav.help`                            | `keyboard shortcuts`                                                                                                                          |
| `nav.statusSwitcher`                  | `status columns`                                                                                                                              |
| `filter.hosts`                        | `hosts`                                                                                                                                       |
| `filter.columns`                      | `columns`                                                                                                                                     |
| `nav.statusSwitcherItem`              | `{status} — {count} cards`                                                                                                                    |
| `nav.tabStrip`                        | `tabs in this workspace`                                                                                                                      |
| `nav.tabStripItem`                    | `{name} — {count} cards`                                                                                                                      |
| `nav.cardSwitcher`                    | `cards in this tab`                                                                                                                           |
| `nav.cardSwitcherItem`                | `{name} — {status}`                                                                                                                           |
| `nav.nextCard`                        | `next card in this tab`                                                                                                                       |
| `nav.moreActions`                     | `more actions`                                                                                                                                |
| `create.menu`                         | `open`                                                                                                                                        |
| `create.where`                        | `where`                                                                                                                                       |
| `create.pane`                         | `open a card`                                                                                                                                 |
| `create.tab`                          | `open a tab`                                                                                                                                  |
| `create.workspace`                    | `open a workspace`                                                                                                                            |
| `help.close`                          | `close`                                                                                                                                       |
| `help.prefixNote`                     | `prefix — press it, release, then the action key within 2 seconds.`                                                                           |
| `help.categories.Navigation`          | `navigation`                                                                                                                                  |
| `help.categories.Lifecycle`           | `lifecycle`                                                                                                                                   |
| `help.categories.View`                | `view`                                                                                                                                        |
| `help.categories.Help`                | `help`                                                                                                                                        |
| `help.shortcuts.nextTab`              | `next tab`                                                                                                                                    |
| `help.shortcuts.prevTab`              | `previous tab`                                                                                                                                |
| `help.shortcuts.lastTab`              | `last tab — jump back to the one before`                                                                                                      |
| `help.shortcuts.openRail`             | `open and focus the navigator`                                                                                                                |
| `help.shortcuts.closeTab`             | `close the current tab — asks first`                                                                                                          |
| `help.shortcuts.closePane`            | `close the current card — not yet.`                                                                                                           |
| `help.shortcuts.renameTab`            | `rename the current tab`                                                                                                                      |
| `help.shortcuts.jumpTab`              | `jump to tab 0-9 in the current workspace`                                                                                                    |
| `help.shortcuts.help`                 | `open this help`                                                                                                                              |
| `help.shortcuts.toggleTheme`          | `switch between washi and sumi`                                                                                                               |
| `help.shortcuts.focusSearch`          | `focus search — not yet.`                                                                                                                     |
| `help.shortcuts.closeOverlay`         | `close the open dialog, help, create menu or drawer`                                                                                          |
| `settings.appearance`                 | `appearance`                                                                                                                                  |
| `settings.theme`                      | `theme`                                                                                                                                       |
| `settings.density`                    | `density`                                                                                                                                     |
| `settings.comfortable`                | `comfortable`                                                                                                                                 |
| `settings.compact`                    | `compact`                                                                                                                                     |
| `settings.terminal`                   | `terminal`                                                                                                                                    |
| `settings.terminalNote`               | `one palette for every open terminal — cards are told apart by title, host seal and status, never by terminal colour.`                        |
| `settings.terminalTheme`              | `colour theme`                                                                                                                                |
| `settings.terminalFontSize`           | `text size`                                                                                                                                   |
| `settings.terminalScrollback`         | `scrollback`                                                                                                                                  |
| `settings.terminalScrollbackNote`     | `lines of history each terminal asks herdr for. herdr sends at most {max}.`                                                                   |
| `settings.runtime`                    | `runtime`                                                                                                                                     |
| `settings.runtimeNote`                | `the output poll interval is bridge-owned. each connected host advertises its own cadence.`                                                   |
| `settings.noHostsConnected`           | `no hosts connected yet.`                                                                                                                     |
| `settings.pollOverride`               | `requested override (ms)`                                                                                                                     |
| `settings.pollOverrideNote`           | `not wired up yet — the bridge does not accept a per-subscription poll interval, so this is saved in this browser and changes nothing.`       |
| `settings.hosts`                      | `hosts`                                                                                                                                       |
| `settings.hostsNote`                  | `the host list is bridge-owned. to add, remove or reconfigure a host, edit`                                                                   |
| `settings.hostsNoteFile`              | `kanhrd.config.yaml`                                                                                                                          |
| `settings.hostsNoteTail`              | `on the machine running the bridge — this screen reads it, it never writes it.`                                                               |
| `settings.noHosts`                    | `no hosts configured.`                                                                                                                        |
| `settings.connected`                  | `connected`                                                                                                                                   |
| `settings.notConnected`               | `not connected`                                                                                                                               |
| `settings.keyboard`                   | `keyboard`                                                                                                                                    |
| `settings.keyboardNote`               | `herdr-style prefix shortcuts: press the prefix, release, then the action key. rebinding is not available yet — only the prefix resets.`      |
| `settings.colAction`                  | `action`                                                                                                                                      |
| `settings.colDefault`                 | `default`                                                                                                                                     |
| `settings.colCurrent`                 | `current`                                                                                                                                     |
| `settings.resetDefaults`              | `reset to defaults`                                                                                                                           |
| `settings.data`                       | `data`                                                                                                                                        |
| `settings.dataNote`                   | `everything kanhrd keeps in this browser. no host and no bridge is touched.`                                                                  |
| `settings.clearData`                  | `clear local data`                                                                                                                            |
| `settings.clearParked`                | `clear parked columns`                                                                                                                        |
| `settings.clearTitle`                 | `clear what this browser remembers?`                                                                                                          |
| `settings.clearBody`                  | `this removes kanhrd's saved settings from this browser and reloads the page. no host, session or bridge is affected. this cannot be undone.` |
| `settings.clearAction`                | `clear`                                                                                                                                       |
| `settings.clearKindSetting`           | `setting`                                                                                                                                     |
| `settings.clearFilters`               | `board filters`                                                                                                                               |
| `settings.clearAppearance`            | `theme and density`                                                                                                                           |
| `settings.clearTerminal`              | `terminal palette`                                                                                                                            |
| `settings.clearTerminalFontSize`      | `terminal text size`                                                                                                                          |
| `settings.clearTerminalScrollback`    | `terminal scrollback`                                                                                                                         |
| `settings.clearTerminalKeyBar`        | `terminal key bar`                                                                                                                            |
| `settings.clearKeyboard`              | `keyboard prefix`                                                                                                                             |
| `settings.clearSwimlane`              | `board grouping`                                                                                                                              |
| `settings.poll.unavailable`           | `n/a`                                                                                                                                         |
| `settings.poll.unit`                  | `ms`                                                                                                                                          |
| `notShipped`                          | `not yet.`                                                                                                                                    |
| `rail.navigation`                     | `workspaces and tabs`                                                                                                                         |
| `rail.renameWorkspace`                | `rename workspace`                                                                                                                            |
| `rail.renameTab`                      | `rename tab`                                                                                                                                  |
| `rail.lastWorkspaceRefusal`           | `this is the only workspace open on this host. closing it would leave nothing to watch. open another workspace first.`                        |
| `swimlane.groupBy`                    | `group by`                                                                                                                                    |
| `swimlane.none`                       | `none`                                                                                                                                        |
| `swimlane.host`                       | `host`                                                                                                                                        |
| `swimlane.repository`                 | `repository`                                                                                                                                  |
| `swimlane.checkout`                   | `checkout path`                                                                                                                               |
| `swimlane.tab`                        | `tab`                                                                                                                                         |
| `swimlane.ungrouped`                  | `no repository`                                                                                                                               |
| `theme.board`                         | `board`                                                                                                                                       |
| `theme.washi`                         | `washi`                                                                                                                                       |
| `theme.sumi`                          | `sumi`                                                                                                                                        |

`{host}`, `{name}`, `{reason}`, `{lines}` and `{max}` are interpolation
slots. `{lines}` and `{max}` are line counts — `{max}` is herdr's measured
ceiling, filled from the constant that caps the control, never written
into the string. A `{reason}`
quotes herdr's wire response verbatim, including its original case. The
framing copy and the quoted portion use the same word for the same
object.

### Voice rules

1. No exclamation marks.
2. No emoji in the product chrome. `🐑` stays herdr's; kanhrd doesn't
   ape it. A mascot may appear in illustrated empty states (see below).
3. Data is data. Do not translate `12m` into "twelve minutes ago" or
   "for a while now." Elapsed time on a card is **observed client time
   since this client first saw the status** — never presented as a
   server-authoritative duration.
4. Verbs of care are verbs, not adjectives. "tend", "rest", "watch",
   "keep sight of" — not "cozy", "gentle", "friendly".
5. Care copy softens the _prompt_, never the _fact_. "let this one
   rest?" is followed by a body that says the session ends and cannot be
   undone. Never write "pause", "suspend", "you can restore it", or any
   phrasing that implies recoverability.
6. Care verbs appear on empty states, lifecycle confirmations,
   disconnect toasts, 404 and setup. They never appear on card bodies,
   filter chips, host seals, status labels, timestamps, or the keyboard
   help overlay.
7. Failure copy names what failed, then quotes herdr. Never a bare
   "something went wrong".
8. Sentence case or lowercase. No uppercase headers.

## Mascot (v2, not v1)

Reserved for illustrated empty states and error pages where charm earns
its place. When it lands:

- A minimal geometric shiba or akita silhouette, sitting, ears forward,
  one ochre ear or scarf.
- Not a sheep — herdr owns the sheep. kanhrd herds _the herder's herd_;
  the shepherd's dog is the correct role.
- Never animated in chrome. May animate in the 404 or setup illustration.

Do not ship v1 with the mascot. Wordmark + crook first; earn the dog.

## Motifs

- **Hairline rules** (`1px var(--rule)`) instead of drop shadows. This
  is ukiyo-e discipline: outline, don't smudge.
- **Torii-gate framing** on modals — top and bottom rules, no side
  borders, no radius — so a modal reads as a gate you pass through, not
  a floating card.
- **Hanko (印) seals** for host names — a compact rectangle, ochre
  hairline outline, monospace glyph inside, never filled. A host is a
  seal, not a pill. This ochre outline is the one bounded exception to
  otherwise colour-free chrome; the name itself is read in ink.
- **Signboard columns.** Status columns are hung, not floated: title
  aligned to a top hairline, count set as a small mono numeral to the
  right, no background fill.

## Domain vocabulary

One rule, not a translation table: **herdr's objects use herdr's words;
the board's own furniture uses kanban's words.** kanhrd's users are
herdr's users, so an object herdr already names keeps that name in the
UI, in the wire protocol, in TypeScript identifiers, in capability
names, and in any error text that quotes a wire response.

| kanhrd UI copy            | herdr concept | Why                                               |
| ------------------------- | ------------- | ------------------------------------------------- |
| **host**                  | host          | one machine running herdr                         |
| **workspace**             | workspace     | a working area on a host                          |
| **tab**                   | tab           | a track through a workspace                       |
| **card** (on the board)   | pane          | the board's representation of a pane              |
| **pane** (in detail view) | pane          | the technical view keeps the engineering register |
| **status column**         | agent status  | a board grouping derived from `agent_status`      |
| **parked column**         | —             | a column the operator makes and drags cards into  |
| **swimlane** (**lane**)   | —             | a horizontal band grouping cards by a dimension   |

A card is a pane. The last three rows name things herdr has no concept
of; they are the board's own furniture and take kanban's words. A status
column is agent-defined — membership follows `agent_status`; a parked
column is user-defined — membership is the operator's, and a card leaves
only under the column's exit rule.

### "lane" means one thing

A **lane is a swimlane** — a horizontal band grouping cards by a chosen
dimension. It is never a tab: in copy, in help text, in the keyboard
overlay, in specs, or in code comments. A vertical grouping by
`agent_status` is a **status column**, and its heading is simply the
status name (`working`, `blocked`, …).

For a reader of older commits: `lane` briefly meant _tab_, under the
copy-only rename this document used to carry. It does not any more.

Any inherited text that calls a tab a "lane" is a bug against this
document.

## Palette

See [`DESIGN-SYSTEM.md`](DESIGN-SYSTEM.md) for the full token contract
and the measured contrast table. Summary:

- **Primary surface: washi paper cream** `#f4ede0` with **sumi ink**
  `#1a1815`. Light is the primary theme.
- **Dark theme is separately tuned sumi** `#161311` with lifted ink
  `#ece3d1` — not an inversion of the light palette.
- **Primary accent: ochre** `#c8842a`. Used for the wordmark crook, the
  host seal outline, and one primary action per screen.
- **Blocked** = vermilion `#b6412a` (torii red), earns weight by rarity.
- **Done** = matcha `#6b7d4a`. **Idle** = aizome indigo `#2f4a6b`.
  **Unknown** = stone `#8a8578`.

Those six are **brand swatches** — identity references. They are not
automatically legible foregrounds. Every place a colour becomes text, a
border that carries meaning, or a status indicator, it goes through a
separately measured token (`--ochre-ink`, `--status-working`,
`--status-working-ink`, …). Cream on ochre measures 2.66:1 and is
forbidden; the foreground on an ochre fill is ink.

## Anti-patterns

- Traffic-light dashboards. Every status is not equally loud; blocked
  and working carry, matcha and indigo recede.
- Card shadows, gradients, glassmorphism, grain overlays, parallax.
  This is a signboard, not a slide deck.
- Emoji in chrome. Reserved for community and README voice.
- Cutesy copy. "cozy dev vibes", "happy little agents", any exclamation
  points. Fails the tool-not-toy test.
- Uppercase headers. Small-caps or sentence case only.
- Serif on repeated identifiers.
- Copy that implies an undo the product does not have.
