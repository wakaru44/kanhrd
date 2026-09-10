# neo-shepherd redesign — visual review

Capture set for task 15.3 of the archived change
`add-l-brand-neo-shepherd-redesign`. Every shot is the state after the
redesign, on the build at the commit that added this directory.

## How these were taken

Against two throwaway bridges so the operator's own bridge on `:5173`
and its stored preferences were never touched:

- **populated** — a second bridge on `:5199` against the same herdr
  socket, read-only.
- **empty** — a bridge on `:5198` started with `hosts: []`, which is the
  only honest way to reach the no-hosts state.

Desktop shots are 1280x658 CSS px (a 1600x1000 window); mobile shots are
400x604 (a 430x932 window), below the 900px breakpoint where the board
becomes a one-column-per-screen pager.

Both themes throughout: **washi** (light, the reference palette) and
**sumi** (dark, separately tuned — not an inversion).

## Board

|           | washi                                                  | sumi                                                 |
| --------- | ------------------------------------------------------ | ---------------------------------------------------- |
| populated | ![Populated board in washi](board-populated-washi.jpg) | ![Populated board in sumi](board-populated-sumi.jpg) |
| empty     | ![Empty board in washi](board-empty-washi.jpg)         | ![Empty board in sumi](board-empty-sumi.jpg)         |

The empty state is a next step, not a message: a copyable
`kanhrd.config.yaml` snippet, the command that starts the bridge, a link
to the operating guide, and a heartbeat line while it waits.

## Settings

| washi                                    | sumi                                   |
| ---------------------------------------- | -------------------------------------- |
| ![Settings in washi](settings-washi.jpg) | ![Settings in sumi](settings-sumi.jpg) |

## Pane detail

![Pane detail header chrome in sumi](pane-detail-sumi-header.jpg)

**Cropped to the view's chrome on purpose.** The terminal below it
renders a live herdr pane, so a full-height capture would publish
whatever that session happened to be doing. What matters for review is
here: the back control first in tab order, the rename action, the
UI-sans title, and the mono meta line (status, pane id, revision,
elapsed).

## Mobile — the board pager

One status column per screen, with the persistent switcher above it.

| first                                                                     | middle                                                                      | last                                                                    |
| ------------------------------------------------------------------------- | --------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| ![Mobile pager, first status column, washi](mobile-pager-first-washi.jpg) | ![Mobile pager, middle status column, washi](mobile-pager-middle-washi.jpg) | ![Mobile pager, last status column, washi](mobile-pager-last-washi.jpg) |

Sumi, first column: ![Mobile pager, first status column, sumi](mobile-pager-first-sumi.jpg)

The selected segment carries the current column's count and no other
segment does. Cards are compact below the breakpoint whatever the count.

## Mobile — the drawer

| washi                                                   | sumi                                                  |
| ------------------------------------------------------- | ----------------------------------------------------- |
| ![Mobile drawer open in washi](mobile-drawer-washi.jpg) | ![Mobile drawer open in sumi](mobile-drawer-sumi.jpg) |

The rail becomes an overlay drawer with a dismissing backdrop; it traps
focus while open and returns focus to the hamburger on close.

## What is not here

**Before shots.** The redesign merged long before this capture set was
made, so a genuine "before" would mean building a pre-redesign commit in
a shared working tree. The originating PR is merged and these are
documentation rather than review material.
