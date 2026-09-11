# Design — terminal top bar and card switcher

Everything below is read-only inspection: this repository's sources, and
the herdr checkout at `/Users/jmorales/workspace/src/github.com/others/herdr`
(the same 0.8.2 line the `add-pane-workdir-and-task-title` design reads).
Nothing was run against the operator's live herdr.

## Finding 1 — sibling lookup needs no wire change

**Answer: no.** The bridge-projected `Pane`
(`packages/schema/src/herdr.ts:221-236`) is:

```ts
export interface Pane {
  id: string;
  host: string;                       // bridge-injected
  workspace: { id: string; name: string };
  tab: { id: string; name: string };
  title?: string;
  agent?: { name: string };
  agent_status: AgentStatus;
  last_output_snippet?: string;
}
```

Both the **id** and the denormalized **name** are present for workspace
and tab — `projectPane` (`apps/bridge/src/herdr/project.ts:20-31`) builds
them from `pane.workspace_id` / `pane.tab_id` joined against the name
cache. The brief's caveat ("it carries a denormalized `tab.name`") is
half the picture: `tab.id` is right beside it.

`PanesStore.panesSignal` (`apps/web/src/app/state/panes.store.ts:445`) is
a `Map<paneKey(host, id), Pane>` holding every pane of every connected
host — the board's own source. So:

```ts
siblings = [...store.panesSignal().values()]
  .filter(p => p.host === host && p.tab.id === pane.tab.id)
```

No new field, no new method, no new capability flag, no new herdr call.
The same derivation also gives the breadcrumb (`workspace.name`,
`tab.name`) for free.

### The one thing that is not free: sibling *order*

herdr returns `pane.list` in **layout order**. `handle_pane_list`
(`src/app/api/panes.rs:137`) delegates to `collect_panes_for_workspace`
(`src/app/creation.rs:163-198`), which walks
`ws.tabs.iter().flat_map(|tab| tab.layout.pane_ids())` — the split-tree
traversal, workspace by workspace, tab by tab. `PaneInfo` itself carries
no index (`src/api/schema/panes.rs:527-560`): the geometry is the array
order and nothing else.

That order survives into the browser by accident of `Map` iteration
order, and it degrades: `applyPaneCreated`
(`panes.store.ts:95-99`) appends a newly created pane at the end of the
map regardless of where herdr put it in the split tree, and
`pane.moved` reuses the same append. So insertion order is herdr's
layout order at fetch time and drifts with churn until the next full
`pane.list`.

**Decision: use the store's existing order, with a stable tiebreak, and
document the ceiling.** The switcher renders siblings in
`panesSignal` iteration order — herdr's layout order for everything that
was present at fetch — and newly created siblings appear at the end.
This is honest, costs nothing, and never reorders under the operator's
cursor.

Rejected — **add `layout_index` to the projected `Pane`.** It looks free
(`projectPane` is called from a `map` over `pane.list` in `hosts.ts` and
could stamp the index) and is not: `pane.created` / `pane.moved` project
a *single* `PaneInfo` with no surrounding list, so every event-delivered
pane would carry an unknown or stale index — a field that is right on
first load and wrong afterwards is worse than no field. If layout order
must be exact, the honest fix is a `tab.layout`-shaped read, which is a
new herdr method and a different change.

## Finding 2 — what a real herdr top bar actually shows

**Verified against herdr's source**, not inferred.
`render_tab_bar` (`src/client/shell/tabs.rs:7-248`) draws, left to right:

| Element              | Behaviour (source)                                                                                      |
| -------------------- | ------------------------------------------------------------------------------------------------------- |
| Scroll-left `" < "`  | 3 columns, only when the row overflows and mouse chrome is on (`TAB_SCROLL_BUTTON_WIDTH`, `tabs.rs:63`) |
| Tab entries          | One per tab **of the focused workspace only** (`tabs.rs:20-23`); label centred inside the cell          |
| Focused tab          | `palette.accent` background, panel-contrast foreground (`tabs.rs:100-104`)                              |
| Custom-labelled tab  | Bold when focused, `overlay1` when not; auto-labelled tabs render `DIM` (`tabs.rs:104-116`)             |
| Zoom marker          | `format!("{} Z", tab.label)` when the tab is zoomed (`tab_label`, `tabs.rs:380-386`)                    |
| Scroll-right `" > "` | Mirror of the left control                                                                              |
| `+` new tab          | 3 columns (`NEW_TAB_WIDTH`, `state.rs:4`), mouse chrome only                                            |
| Right status area    | Ordered `tab_bar_right` segments, separator between visible entries only (`tabs.rs:260-300`)            |

Configuration (`docs/versions/0.8.2/.../configuration.mdx:284-304`):
`ui.tab_bar_position = "top" | "bottom"`; `ui.tab_bar_right` accepts
`zoom | hostname | datetime | text | command`; the status area is empty
by default and "on a narrow tab row, the complete status area yields to
the tabs and their controls." Prefix / Navigate / Copy / Resize mode bars
temporarily replace the bottom row.

### What translates, and what does not

| herdr element               | kanhrd top bar                             | Why                                                                                                                                                              |
| --------------------------- | ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A strip of peers            | **Adopted** — but over *cards in this tab* | The detail route shows one pane, herdr's zoomed state. Peers here are siblings, not tabs.                                                                        |
| Selection marked distinctly | **Adopted, retuned**                       | `--fw-semi` + 2px `--ochre-line` underline. `docs/DESIGN-SYSTEM.md` forbids a colour fill for selection; the mobile status switcher already sets this precedent. |
| Custom label emphasised     | **Adopted implicitly**                     | The title precedence `add-pane-workdir-and-task-title` defines already puts a user-authored `label` first.                                                       |
| Horizontal overflow         | **Adopted, retuned**                       | `overflow-x: auto` inside the strip instead of `<` / `>` cells — a browser has a scroller, a TUI does not.                                                       |
| Zoom marker `Z`             | **Dropped**                                | kanhrd has no zoom state.                                                                                                                                        |
| `+` new tab                 | **Dropped**                                | The board's `+` menu owns creation; `docs/UX-GUIDELINES.md` has one create surface.                                                                              |
| `tab_bar_right` hostname    | **Already present** as the hanko host seal | Duplicating it would be a second host readout on one bar.                                                                                                        |
| `tab_bar_right` datetime    | **Dropped**                                | A clock in a browser tab is the browser's job.                                                                                                                   |
| `tab_bar_right` command     | **Dropped**                                | Runs shell on the herdr server; no path from a browser client, no wire method.                                                                                   |
| `tab_bar_position`          | **Dropped**                                | One position. A configurable bar position is a preference with no evidence behind it.                                                                            |
| Mode bars (prefix/copy/…)   | **Dropped**                                | kanhrd has no copy or resize mode; the prefix chord has no indicator today (`chordActive` is exposed but unrendered) and this change does not add one.           |

## Finding 3 — what belongs on the bar, and what would be duplicated

| Candidate                    | Verdict | Where it already lives                                                                  |
| ---------------------------- | ------- | --------------------------------------------------------------------------------------- |
| host                         | present | `.host-seal` in `pane-detail.html` — keep as-is                                         |
| workspace / tab breadcrumb   | **add** | Only on the board card (`card.ts:85-88`, `path()`); the detail route has never shown it |
| sibling-card switcher        | **add** | Nowhere                                                                                 |
| status + pane id + rev + age | present | `.meta-strip` — untouched                                                               |
| split / close                | skip    | `board/card.html` inline actions + overflow menu                                        |
| terminal theme               | skip    | Settings → Terminal (`l-ux2-…-terminal-themes`)                                         |
| terminal font size           | skip    | Settings → Terminal (`add-terminal-font-size`)                                          |
| back to the board            | present | `.back` — stays the **first focusable element** (`docs/UX-GUIDELINES.md`, Pane detail)  |

## Finding 4 — keyboard, the sharp edge

Three shipped rules constrain this:

1. `keyboard-shortcuts`: "The SPA SHALL NOT intercept the prefix or any
   bound action key while a focusable input element, **including
   xterm.js's hidden helper textarea**, has focus."
2. `host-keybinds-passthrough`: the effective prefix mirrors herdr's own
   `[keys].prefix`, so the prefix is precisely the key an operator
   expects to reach herdr — kanhrd must never eat it in a terminal.
3. `docs/UX-GUIDELINES.md`: "No global unmodified `Escape` and no global
   `?`… While xterm has focus, unmodified Escape, `?` and arrow keys
   reach the terminal." `pane-detail.ts`'s class comment says the same.

Together these mean **a prefix chord cannot open anything while the
terminal has focus**, because the prefix never arms there. Any binding
that must work from inside a live terminal has to be a direct chord that
the suppression rule explicitly exempts — which is a change to a shipped
capability, so it is written as a MODIFIED requirement rather than
assumed.

### Why `Ctrl+Alt+I`

herdr's own keyboard documentation
(`docs/versions/0.8.2/website/src/content/docs/keyboard.mdx`) surveyed
"the default keybindings of Ghostty, iTerm2, Terminal.app, kitty,
WezTerm, Alacritty, Warp, Windows Terminal, GNOME Terminal, and Konsole,
plus the global shortcuts of GNOME and KDE" and concluded:

> One modifier family is almost untouched everywhere: `ctrl+alt`.
> Terminals leave it free, it is not affected by the macOS option-key
> composing behavior that blocks plain `alt` chords, and it transmits
> even in terminals without a modern keyboard protocol.

Its published exceptions are `ctrl+alt+arrows`, `ctrl+alt+t`,
`ctrl+alt+l`, `ctrl+alt+a`, `ctrl+alt+s`, `ctrl+alt+u` and
`ctrl+alt+f1..f12`. `ctrl+alt+i` is on none of them, and `i` is free in
kanhrd's own chord table (`c n p l w & x , 0-9 ? t`).

Note for anyone revisiting this: **`ctrl+alt+s` is on that avoid list**,
which is why the switcher's direct chord is not `Ctrl+Alt+S` even though
`prefix + s` would have been the better mnemonic (tmux's `prefix + s`
opens a chooser). The prefix half and the direct half stay on the same
letter, so both moved to `i`. `o` is free too, but it now carries
herdr's own meaning — next pane — under D3's follow-up.

There is a second reason this is cheaper here than it looks. kanhrd does
not type into herdr's keybind layer: input goes to `pane.send_text` /
`pane.send_keys`, which addresses the pane directly (tier-2 spec, "Pane
input"). So an operator's *herdr-side* `ctrl+alt` bindings are already
unreachable through kanhrd; the only thing this chord takes is a chord
from the program running inside the pane.

### Why exactly one chord

Every stolen chord is a chord the pane can never receive again. The
switcher therefore steals **one** and does everything else inside itself:
once the strip has focus the terminal does not, so `ArrowLeft` /
`ArrowRight` / `Home` / `End` move between siblings, `Enter` / `Space`
navigates, and `Escape` returns focus to the terminal — all ordinary
focused-widget behaviour, none of it global, none of it a new exception.
This mirrors the drawer's scoped `Escape` (`docs/UX-GUIDELINES.md`,
"Dismissal": "the drawer is app chrome, not the terminal, so Escape is
scoped to the open drawer — this is not a global binding").

Rejected — **`Ctrl+Alt+[` / `Ctrl+Alt+]` for previous / next sibling
without opening the switcher.** Two more stolen chords for a keystroke
saved. herdr's own docs use exactly that pair for `previous_tab` /
`next_tab` in its prefix-free example, so taking them for *cards* also
invites a mental collision. If the operator asks for it later it is an
additive change to the same enumerated list. (Maintainer decision D3.)

Rejected — **`attachCustomKeyEventHandler` on the xterm instance.** It
would let pane-detail filter keys locally instead of touching
`KeyboardService`, which sounds narrower and is actually worse: the
exception would then be invisible to the keyboard help overlay, to
Settings, and to the next reader of `keyboard.service.ts`, and would
diverge from the single dispatch point the `fix-keyboard-shortcut-suppression`
change deliberately consolidated.

## Finding 5 — mobile, and the UX-GUIDELINES paragraph it collided with

`docs/UX-GUIDELINES.md`, § Mobile → Per-screen requirements at 390px →
Pane detail, states:

> There is no mobile multi-pane view, no split view, and **no pane
> switcher. Do not build one and do not hint at one.**

The operator's feedback asks for a switch-pane control on the terminal
view, which collided with that paragraph below 900px. **Resolved by
maintainer decision D1 (2026-09-10): amend the paragraph.** In the
maintainer's words, forbidding pane switchers on mobile — and probably
on the web too — makes no sense; that sentence is overblown feedback
from the early MVP, not the MLP being built now, and a pane switcher is
wanted in the web terminal view before long, for panels in the same
view. The switcher is a *navigator between routes* (each entry is a
`routerLink` to `/pane/:host/:id`, one terminal at a time), not the
multi-pane or split view the paragraph rules out.

**This change therefore ships the switcher at every width.** Below
`--breakpoint-mobile` it is the same horizontally scrolling strip; only
the breadcrumb collapses to the tab name alone, so the title keeps its
row. `Ctrl+Alt+I`, `prefix + i` and `prefix + o` work there too.

The mobile constraints are satisfiable and are written into the spec:
the bar keeps the back control first and visible without scrolling,
`overflow-x` sits on the strip rather than the page so
`document.documentElement.scrollWidth <= clientWidth` holds at 390px,
and every switcher entry meets `--touch-target-min` with `--sp-2`
separation.

A maintainer lands the `docs/UX-GUIDELINES.md` edit; this change does not
edit that doc itself.

## Finding 6 — copy and icons the design docs do not yet cover

Flagged, not invented.

- **Copy.** The switcher needs an accessible name for the strip and one
  per entry. `docs/BRAND.md`'s approved-copy table has no row for
  either. Precedent for the interim exists in this codebase:
  `CARD_COPY` (`board/card.ts:35-41`) holds three per-card action labels
  **Correction, 2026-09-10.** This change originally cited `CARD_COPY` in
  `board/card.ts` as the precedent for a component-local pending-copy
  constant. That precedent no longer exists: commit `f173992` ("give
  every user-facing string one home in copy.ts") folded `CARD_COPY` and
  four sibling blocks back into `shared/copy.ts`, and today's
  `CARD_COPY` is a pure mapping onto `COPY.card.*` with no strings of
  its own. The repo's current rule is that every user-facing string
  lives in `copy.ts`, whether or not `docs/BRAND.md`'s table has caught
  up. So the strings are **approved** (D2), the BRAND table row is
  **deferred**, and they go into `copy.ts` under `nav`:

  | Key                          | Candidate string          |
  | ---------------------------- | ------------------------- |
  | `nav.cardSwitcher`           | `cards in this tab`      |
  | `nav.cardSwitcherItem`       | `{name} — {status}`       |

  Both are lowercase, clinical (this is a navigator, not a lifecycle or
  empty-state surface, so no care verb belongs on it — `docs/BRAND.md`
  voice rule 6), and reuse the existing `{}` interpolation mechanism
  (`fill` in `shared/copy.ts`), matching `nav.statusSwitcherItem`'s
  shape.

- **Icons.** `docs/DESIGN-SYSTEM.md` pins a set of eighteen lucide icons
  and `shared/icons.ts` re-exports exactly those. Nothing in the set
  read as "panes in a tab", so D4 asked whether to extend it.
  **Resolved: yes — `LucideGalleryHorizontal` joins the set**, as the
  leading marker on the switcher strip. Switcher entries still carry no
  icon (the existing CSS status dot plus the card name), and the
  breadcrumb separator stays the textual `/` the board card's `path()`
  already uses. The pinned-table row in `docs/DESIGN-SYSTEM.md` is the
  maintainer's edit; this change adds the `shared/icons.ts` re-export.

## Composition with `add-pane-workdir-and-task-title`

That change is live and unimplemented, and it touches the same header.
Overlaps, exhaustively:

1. **The metadata strip.** It adds the project / working directory to
   `.meta-strip`; this change does not touch `.meta-strip` at all. The
   two are additive within one `<div>`.
2. **Title precedence.** It defines
   `label ?? display_agent ?? agent ?? title ?? pane_id.slice(0, 8)`.
   This change's switcher entries render a *card name* and MUST use the
   same precedence, from a single shared helper — two different answers
   to "what is this card called" on one screen would be a bug. Until
   that change lands, both the header title
   (`pane-detail.ts:105-107`) and the switcher use today's
   `agent?.name ?? title ?? id`. Landing order does not matter; whichever
   is second updates one helper.
3. **`Pane.label`.** Its Layer 1 adds `label?: string` to the projected
   `Pane`. This change adds no field, so there is no schema contention.
4. **`Subscription::PaneUpdated`.** Its Layer 2 makes renames arrive live.
   The switcher reads `panesSignal` and re-renders from it, so it
   inherits that for free and needs nothing.
5. **The card overflow menu.** Its Layer 2 puts `pane.rename` there. This
   change deliberately adds no lifecycle action to the top bar
   (proposal, "Deliberately not in the bar"), so it does not compete for
   that surface.

Neither change blocks the other, and neither needs the other to land
first.

## Concurrent edit to `pane-detail.scss`

Another change is editing `apps/web/src/app/pane-detail/*.scss` for edge
padding. This change also edits `pane-detail.scss`, so the two will
conflict textually.

Containment: this change's SCSS is confined to `.detail-header` and a new
`.card-switcher` block, and the new switcher lives in its **own**
component with its own `card-switcher.scss` — so the only shared file is
`pane-detail.scss`, and within it only the header rules and the addition
of the switcher's slot. The edge-padding change's own target
(`padding` on `.pane-detail` / `.terminal-container` and the page
gutters) does not overlap those rules. Whichever lands second rebases;
the conflict is a few adjacent hunks, not a semantic clash. If that
change touches `.detail-header`'s `padding` specifically, that
one declaration is the single line to reconcile, and this change should
take theirs.

## Reliability, scale and the states already specified

- **Stale / unavailable.** `viewState()` already outranks everything on
  `penInSight()`. The switcher reads `panesSignal`, which is not cleared
  by a disconnect, so siblings stay listed and navigable while a host is
  out of sight — consistent with "a single host disconnect never destroys
  already-rendered content." No new state is introduced.
- **A sibling that disappears.** `pane.closed` removes it from
  `panesSignal` and the entry leaves the strip. If the *current* pane is
  the one closed, the existing detail-route behaviour is unchanged by
  this change.
- **Scale.** A tab holds a handful of panes, not hundreds; the strip
  needs no virtualization and adds no per-card subscription. It renders
  from the store only — "a card never fetches terminal output for
  decoration" holds trivially.
- **Motion.** No animation is added. The strip's scroll-into-view for the
  selected entry uses `behavior: 'auto'` under
  `prefers-reduced-motion: reduce`, matching the status switcher.

## Maintainer decisions

- **D1 — mobile. RESOLVED 2026-09-10: amend the paragraph.** The
  switcher renders at every width, phone width included. The maintainer
  judged the "no pane switcher" sentence overblown early-MVP feedback
  rather than an MLP rule, and expects to want a pane switcher in the
  web terminal view too, for panels in the same view. A maintainer lands
  the `docs/UX-GUIDELINES.md` edit; no follow-up width-gate change is
  needed. See Finding 5.
- **D2 — copy. RESOLVED 2026-09-10: approved as written, table row
  deferred.** `nav.cardSwitcher` = `cards in this tab` and
  `nav.cardSwitcherItem` = `{name} — {status}` are the strings to use,
  and they go straight into `shared/copy.ts` under `nav`, beside
  `nav.statusSwitcher` / `nav.statusSwitcherItem` (`copy.ts:125-126`).
  They are **not** added to `docs/BRAND.md`'s approved-copy table now;
  a maintainer promotes them if the table grows, and this change does not
  edit `docs/BRAND.md`.
- **D3 — a second and third chord. RESOLVED 2026-09-10: postponed, not
  in this change.** The maintainer's reasoning is a principle, not just a
  no: *the keyboard experience should be familiar and equivalent to
  herdr; herdr's hierarchy and structure triumph, especially for
  keyboard navigation.* A chord pair whose only job is "jump to the next
  busy thing" is of dubious value once the herdr-equivalent tab and pane
  movements work. Two things this raised, neither of them this change's to
  answer:

  **Both were then decided by the maintainer, and this change carries
  them:** `prefix + o` is rebound to **next sibling card** (herdr's
  meaning on herdr's key), and the switcher moves to `prefix + i` with
  the direct chord `Ctrl+Alt+I`. `i` was picked from the maintainer's
  `s` / `r` / `i` shortlist. `s` was the better mnemonic — tmux's own
  `prefix + s` opens a chooser, which is what the strip is — but
  **`ctrl+alt+s` is on herdr's published avoid list** (see § "Why
  `Ctrl+Alt+I`" below), so the direct half could not follow the prefix
  half onto `s`, and splitting the two letters is worse than losing the
  mnemonic. `i` is free in kanhrd's chord table and on none of herdr's
  exception lists. One cost is worth naming: a
  card hop loads a pane, so holding `prefix + o` through a five-card
  tab issues five `pane.read` calls, where tmux pays nothing. That is
  the price of herdr parity and the switcher's arrow keys remain the
  zero-cost path — they move focus without navigating.

  1. **An unverified claim, now flagged.** Finding 4 asserts that
     herdr's own docs bind `Ctrl+Alt+[` / `Ctrl+Alt+]` to
     `previous_tab` / `next_tab` in a prefix-free example. The
     maintainer's reading is that those keys do nothing in herdr.
     Nothing in this repo sources either reading — herdr is upstream
     (`herdrdev/herdr`). The claim SHOULD be checked against herdr's
     actual keybinding config before it is used as an argument again.
     It is not load-bearing for this change, which takes neither key.
  2. **`prefix + o` carries the wrong verb, possibly.** kanhrd already
     ships herdr/tmux-convention tab movement in
     `keyboard.service.ts:44-131` — `prefix + n` next-tab, `prefix + p`
     prev-tab, `prefix + l` last-tab, `prefix + 0-9` jump-tab. In
     tmux and herdr, `prefix + o` **goes to the next pane**; this
     change binds it to *focus the switcher strip* instead. Under the
     maintainer's parity principle that may be the wrong verb on the
     right key. A separate change owns the question of full herdr
     keyboard parity for pane-level movement; this change does not
     rebind anything on its own authority.*
- **D4 — an icon. RESOLVED 2026-09-10: yes, extend the pinned set with
  `LucideGalleryHorizontal` and `LucideSquareSplitHorizontal`.** It is the leading marker on the switcher
  strip — a row of panels with the middle one emphasised, which is
  literally what the strip is. Verified present in
  `@lucide/angular@1.43.0`. Rejected alternatives and why:
  `LucideSquareSplitHorizontal` and the split-pane family read as the
  *split* action, which `LucideArrowRight` / `LucideArrowDown` already
  carry; `LucidePanelsTopLeft` reads as a sidebar toggle, which
  `LucideMenu` already carries; `LucideColumns3` is close but says
  "panes side by side" rather than "cards to move between".
  `LucideSquareSplitHorizontal` was rejected *for the strip*, above, and
  then claimed by the maintainer for a different control: the
  **next-card button** (see § "The next-card button"). Its glyph is a
  window divided into two panes, which is what a tab of two cards is,
  and it sits on a hop action rather than a chooser. Switcher
  **entries** still carry no icon — the CSS status dot plus the card
  name — and the breadcrumb separator stays the textual `/` the board
  card's `path()` already uses. The pinned set goes from eighteen to
  twenty; the `docs/DESIGN-SYSTEM.md` table rows are a maintainer edit,
  and this change adds only the `shared/icons.ts` re-exports.
