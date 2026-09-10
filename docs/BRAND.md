# kanhrd — brand identity

**Codename: neo-shepherd.**

kanhrd is the paper lantern above the pen. You glance, you know, you tend.

Companion documents: [`DESIGN-SYSTEM.md`](DESIGN-SYSTEM.md) owns visual
primitives, [`UX-GUIDELINES.md`](UX-GUIDELINES.md) owns interactions.
This file owns identity and voice.

## Positioning

kanhrd is a client for [herdr](https://github.com/herdrdev/herdr). herdr is
the terminal that runs the flock; kanhrd is the board where a shepherd
watches every animal at once, across every field.

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
- **Empty state**: _no pens yet._

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

| Key                               | String                                                                                                                        |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `emptyState.noPens`               | `no pens yet.`                                                                                                                |
| `emptyState.noPensBody`           | `point kanhrd at a herdr socket. add a pen to kanhrd.config.yaml:`                                                            |
| `emptyState.noPensThen`           | `then start the bridge:`                                                                                                      |
| `emptyState.noPensDocsLink`       | `read the operating guide`                                                                                                    |
| `emptyState.waitingForPen`        | `waiting for a pen…`                                                                                                          |
| `emptyState.penEmpty`             | `this pen is quiet. nothing running here yet.`                                                                                |
| `emptyState.noMatches`            | `nothing matches these filters.`                                                                                              |
| `emptyState.noMatchesAction`      | `clear filters`                                                                                                               |
| `emptyState.scopeEmpty`           | `nothing in this scope.`                                                                                                      |
| `emptyState.scopeEmptyAction`     | `clear scope`                                                                                                                 |
| `emptyState.notFound`             | `off the map.`                                                                                                                |
| `emptyState.notFoundAction`       | `back to the board`                                                                                                           |
| `emptyState.scopeUnavailable`     | `that field is no longer here.`                                                                                               |
| `column.empty`                    | `0`                                                                                                                           |
| `confirm.closePane`               | `let this one rest?`                                                                                                          |
| `confirm.closePaneBody`           | `closing ends this session. the terminal and anything running in it stop. this cannot be undone.`                             |
| `confirm.closePaneAction`         | `rest`                                                                                                                        |
| `confirm.keep`                    | `keep`                                                                                                                        |
| `confirm.cancel`                  | `cancel`                                                                                                                      |
| `confirm.closeLane`               | `let this lane rest?`                                                                                                         |
| `confirm.closeLaneBody`           | `these sessions end and cannot be recovered:`                                                                                 |
| `confirm.closeLaneAction`         | `close lane`                                                                                                                  |
| `confirm.closeField`              | `let this field rest?`                                                                                                        |
| `confirm.closeFieldBody`          | `these sessions end and cannot be recovered:`                                                                                 |
| `confirm.closeFieldAction`        | `close field`                                                                                                                 |
| `confirm.closeLinkedFields`       | `close every linked field?`                                                                                                   |
| `confirm.closeLinkedFieldsBody`   | `this field shares a git worktree with others. all of them close, and every session inside them ends. this cannot be undone.` |
| `confirm.closeLinkedFieldsAction` | `close all`                                                                                                                   |
| `confirm.lastLaneNote`            | `this is the last lane in its field. the field closes too.`                                                                   |
| `confirm.previewHeading`          | `this closes:`                                                                                                                |
| `confirm.refusalHeading`          | `herdr won't do that.`                                                                                                        |
| `toast.penDisconnected`           | `lost sight of {pen}. retrying.`                                                                                              |
| `toast.penReconnected`            | `back in view.`                                                                                                               |
| `toast.bridgeDisconnected`        | `lost the bridge. retrying.`                                                                                                  |
| `toast.bridgeReconnected`         | `bridge back.`                                                                                                                |
| `toast.splitFailed`               | `couldn't split. herdr said: {reason}`                                                                                        |
| `toast.closeFailed`               | `couldn't close {name}. herdr said: {reason}`                                                                                 |
| `toast.createPaneFailed`          | `couldn't open a card. herdr said: {reason}`                                                                                  |
| `toast.createLaneFailed`          | `couldn't open a lane. herdr said: {reason}`                                                                                  |
| `toast.createFieldFailed`         | `couldn't open a field. herdr said: {reason}`                                                                                 |
| `toast.renameFailed`              | `couldn't rename. herdr said: {reason}`                                                                                       |
| `toast.liveUpdatesUnavailable`    | `no live updates for this card. herdr said: {reason}`                                                                         |
| `toast.working`                   | `working…`                                                                                                                    |
| `status.working`                  | `working`                                                                                                                     |
| `status.blocked`                  | `blocked`                                                                                                                     |
| `status.done`                     | `done`                                                                                                                        |
| `status.idle`                     | `idle`                                                                                                                        |
| `status.unknown`                  | `unknown`                                                                                                                     |
| `loading.board`                   | `finding pens…`                                                                                                               |
| `loading.pane`                    | `keeping watch…`                                                                                                              |
| `loading.retry`                   | `try again`                                                                                                                   |
| `state.stale`                     | `stale — reconnecting`                                                                                                        |
| `state.unavailable`               | `this pen is out of sight.`                                                                                                   |
| `nav.backToBoard`                 | `back to the board`                                                                                                           |
| `nav.settings`                    | `settings`                                                                                                                    |
| `nav.toggleNav`                   | `toggle navigation`                                                                                                           |
| `nav.help`                        | `keyboard shortcuts`                                                                                                          |
| `notShipped`                      | `not yet.`                                                                                                                    |

`{pen}`, `{name}` and `{reason}` are interpolation slots. A `{reason}`
quotes herdr's wire response verbatim — including herdr's own vocabulary
(`host`, `workspace`, `tab`, `pane`) and its original case.

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
- **Hanko (印) seals** for pen names — a compact rectangle, ochre
  hairline outline, monospace glyph inside, never filled. A pen is a
  seal, not a pill. This ochre outline is the one bounded exception to
  otherwise colour-free chrome; the name itself is read in ink.
- **Signboard columns.** Status columns are hung, not floated: title
  aligned to a top hairline, count set as a small mono numeral to the
  right, no background fill.

## Domain vocabulary

kanhrd renames a small handful of herdr concepts inside its own
surfaces. This is a **copy-only** rename: the wire protocol, TypeScript
identifiers, capability names, API method names, and any error text that
quotes a wire response keep herdr's terms.

| herdr / wire | kanhrd UI copy            | Why                                               |
| ------------ | ------------------------- | ------------------------------------------------- |
| host         | **pen**                   | the enclosure; each machine is one                |
| workspace    | **field**                 | a working area inside a pen                       |
| tab          | **lane**                  | a track through a field (kanban lineage)          |
| pane         | **card** (on the board)   | a single agent's card                             |
| pane         | **pane** (in detail view) | the technical view keeps the engineering register |
| agent status | **status** (kept)         | —                                                 |

### "lane" means one thing

A **lane is a tab.** A board grouping is a **status column** — in copy,
in help text, in the keyboard overlay, and in code comments. The two are
never both called lanes; there is no second metaphor. Status column
headings are simply the status name (`working`, `blocked`, …).

Any inherited text that calls a board grouping a "lane" is a bug against
this document.

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
