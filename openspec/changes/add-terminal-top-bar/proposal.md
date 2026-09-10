## Why

Two pieces of operator feedback describe the same missing surface:

> "When 2 panes share a tab in herdr, surface the link in kanhrd. Not
> necessarily direct visual grouping — a 'switch pane' button on the
> terminal view is enough."

> "Top bar resembling a real herdr session. Direct access to other
> windows/panes from that bar."

Today `/pane/:host/:id` renders a header with four things: a back link,
the title, the pen seal, and a metadata strip (status, pane id, revision,
last poll). Three facts are missing from it and all three are already in
the browser's hands:

1. **Where this card sits.** The board card renders
   `workspace.name / tab.name` (`board/card.ts:85-88`), and the detail
   route — the one place with room for it — does not. The projected
   `Pane` carries `workspace: { id, name }` and `tab: { id, name }`
   (`packages/schema/src/herdr.ts:221-236`), stamped by `projectPane`
   (`apps/bridge/src/herdr/project.ts:20-31`).
2. **The other cards in this lane.** `PanesStore.panesSignal` holds every
   pane of every pen keyed by `paneKey(host, id)`. Sibling cards are
   `panes.filter(p => p.host === host && p.tab.id === tab.id)` — a pure
   client-side derivation of data already resident.
3. **A way to move between them without going back to the board.** The
   only exit from a terminal today is `back to the board` (and that is
   deliberate — see `docs/UX-GUIDELINES.md`, "Keyboard-first, but the
   terminal owns its keys"). Two cards in one lane means two full round
   trips through the board to compare them.

**No wire, schema or bridge change is required.** See `design.md`
Finding 1.

The "herdr-like" half is grounded rather than imagined: herdr 0.8.2's
own desktop tab row is read from source in `design.md` Finding 2, and
the parts of it that translate to a kanban client (a strip of siblings,
selection marked without a colour fill, overflow behaviour, a right-hand
status area) are the parts adopted. The parts that do not translate
(zoom, `+` new tab, shell-command status segments) are named and
rejected there too.

## What Changes

### One bar, restructured — not a second bar

`.detail-header` **becomes** the top bar. A separate bar stacked above
the existing header would spend a second row of vertical height on the
one route whose whole job is to be a terminal, and would put two
back-paths on screen. The existing header's row order (back → title →
pen seal → meta strip) is preserved; the bar gains a breadcrumb and a
switcher, and its second row stays the metadata strip that
`add-pane-workdir-and-task-title` is extending (see _Composition_).

- **Breadcrumb.** `field / lane` in `--ink-mute`, between the back
  control and the title, with the pen carried by the existing hanko seal
  that already sits in this header. Wire/API terms stay `workspace` /
  `tab` in code; UI copy says field / lane per `docs/BRAND.md`.
- **Card switcher.** A strip of the sibling cards in this lane —
  including the current one — each a `<a routerLink="/pane/:host/:id">`
  carrying a status dot and the card's display name. Selection is marked
  by `--fw-semi` plus a 2px `--ochre-line` underline, the treatment the
  mobile status switcher and the Settings density control already use;
  never a colour fill. The strip renders **only when the lane holds more
  than one card** — a lane of one gets no chrome for a choice that does
  not exist.
- **Overflow.** More siblings than fit scroll horizontally inside the
  strip's own `overflow-x: auto` container, which is what herdr's tab row
  does with its `<` / `>` controls. The page never scrolls horizontally.

### Keyboard

The sharp edge of this lane is that **the terminal owns the keyboard**.
`KeyboardService.handleKeydown` returns early whenever a text input has
focus, and xterm.js's helper element is a real `<textarea>`
(`isTextInputFocused`, `state/keyboard.service.ts`), so while the
terminal is focused *no* kanhrd binding fires — by design, and both
`keyboard-shortcuts` and `host-keybinds-passthrough` depend on it.

- **`prefix + o`** navigates straight to the **next sibling card**,
  wrapping past the last, without opening the switcher. This is herdr's
  and tmux's own meaning for the key ("other pane"), and it sits beside
  the tab movement kanhrd already mirrors (`prefix + n` / `p` / `l` /
  `0-9` in `keyboard.service.ts`). Maintainer decision, 2026-09-10:
  herdr's hierarchy and bindings win for keyboard navigation.
- **`prefix + i`** focuses the switcher strip. `i` is unused by the
  current chord table (`c n p l w & x , 0-9 ? t`). This works when the
  terminal does **not** have focus — on arrival at the route, after
  `Escape`-ing an overlay, after using the back control.
- **`Ctrl+Alt+I`** does the same *while the terminal has focus*, and is
  the only key this change takes away from the pane. `Ctrl+Alt` is the
  one modifier family herdr's own keyboard documentation identifies as
  free across every terminal and desktop it surveyed, and it is the
  family herdr recommends for its own prefix-free bindings; `ctrl+alt+i`
  is not on herdr's published "avoid" list (`ctrl+alt+s` is, which is
  why the strip is not on `s` — see `design.md`). This requires a narrow,
  explicitly-enumerated exception to `keyboard-shortcuts`' suppression
  rule — spelled out as a MODIFIED requirement, not slipped in.
- **A next-card button** carries `prefix + o` for the pointer: it
  renders whenever the lane holds more than one card, carries
  `LucideSquareSplitHorizontal` (a window split in two, which is what a
  shared lane is), and dispatches the same action the chord does. The
  strip stays for picking a specific card; the button is the one-press
  hop that suits the common two-card lane.
- **Everything else is free.** Once the switcher has focus the terminal
  does not, so arrows / `Home` / `End` / `Enter` / `Escape` are ordinary
  focused-widget keys and cost the pane nothing.
- If the effective prefix *is* `Ctrl+Alt+I`, the prefix wins and the
  direct chord is not registered. The prefix is never shadowed.

### Deliberately not in the bar

- **Lifecycle actions (split / close).** They already exist on the card,
  inline and in its overflow menu (`board/card.html`). Duplicating them
  onto the detail route adds a second place to get a confirm dialog
  wrong. Out of scope; revisit only on evidence.
- **Terminal theme and font size.** App-wide preferences that live in
  Settings (`terminal-font-size`,
  `l-ux2-…-terminal-themes`). A per-route duplicate would imply a
  per-pane setting the product does not have.
- **herdr's `tab_bar_right` status area** (hostname, datetime, shell
  command). kanhrd is a browser client, not a session host: the hostname
  is the pen seal already on the bar, and running an operator's shell
  command in a browser has no path.
- **A `+` new-card control.** The board's `+` menu owns creation.

## Impact

- **Affected specs:** new capability `terminal-top-bar`; MODIFIED
  requirement in `keyboard-shortcuts` (one enumerated direct-chord
  exception to input suppression).
- **Affected code:**
  - `apps/web/src/app/pane-detail/pane-detail.{ts,html,scss}`
  - `apps/web/src/app/pane-detail/pane-detail.spec.ts`
  - `apps/web/src/app/pane-detail/card-switcher.{ts,html,scss}` (new)
  - `apps/web/src/app/pane-detail/card-switcher.spec.ts` (new)
  - `apps/web/src/app/state/keyboard.service.{ts,spec.ts}`
  - `apps/web/src/app/shared/keyboard-help-overlay.spec.ts` (the new
    bindings appear in the overlay)
- **No change to:** `packages/schema/**`, `apps/bridge/**`, any wire
  method, any capability flag, any herdr call.
- **Risk:** low, and client-local. The one genuine risk is the stolen
  `Ctrl+Alt+I` chord — a key the pane's program can no longer receive.
  It is one chord, from the family herdr itself designates as safe, and
  it is enumerated in one place so it can be removed in one place.
- **Migration:** none. No storage, no preference, no persisted state.
