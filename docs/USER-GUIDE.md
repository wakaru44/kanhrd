# Using kanhrd

kanhrd is herdr in a browser. The objects are herdr's objects — host,
workspace, tab, pane — and the keys are herdr's keys: a prefix chord, then
an action key. Nothing here is a new model to learn. This page covers the
parts that are not obvious from looking at the screen.

## Start with the shortcut overlay

Press `?`. That is the whole reference, rendered from the same table the
app dispatches from, with your prefix already substituted.

The prefix is `Ctrl+B` by default, and follows your herdr's own configured
prefix when the host reports one — Settings › keyboard shows the current
prefix and where it came from. Press the prefix, release it, then press the
action key within two seconds.

| Do this                   | Press                      |
| ------------------------- | -------------------------- |
| next tab                  | prefix + `n`               |
| previous tab              | prefix + `p`               |
| last tab (the one before) | prefix + `l`               |
| jump to tab 0–9           | prefix + `0`…`9`           |
| next card in this tab     | prefix + `o`               |
| cards in this tab         | prefix + `i`, `Ctrl+Alt+I` |
| open a card               | prefix + `c`               |
| open and focus the rail   | prefix + `w`               |
| rename the current tab    | prefix + `,`               |
| close the current tab     | prefix + `&`               |
| shortcut overlay          | `?` or prefix + `?`        |
| close the open overlay    | `Escape`                   |

Two entries in the overlay are marked `not yet.` — close the current card
and focus search. They are listed so the reference stays honest; they do
nothing today.

## Moving between cards and tabs from a terminal

![A live terminal for one pane, with the tab breadcrumb and the card controls in the top bar](./screenshots/terminal_detail.png)

Open a card and you get that pane's terminal. When the tab holds more than
one card, the top bar gains two things:

- a **next-card** button, and prefix + `o`, which move to the next card in
  the tab and wrap past the last;
- a **card switcher** — the strip of every card in the tab, current one
  included. prefix + `i` moves focus onto it. Arrows, `Home` and `End` move
  along the strip without loading anything; `Enter` or `Space` opens the
  card the focus is on; `Escape` hands the keyboard back to the terminal.

Each entry is a link to that card's own route, so the URL always names the
card you are looking at.

One rule matters while a terminal has focus: every keystroke belongs to the
program running in the pane, the prefix included. `Ctrl+Alt+I` is the single
exception — it reaches the card switcher from inside a live terminal. To use
any other chord, leave the terminal first.

Tabs move with prefix + `n` / `p` / `l` and prefix + `0`…`9`, the same keys
herdr uses.

## Parking cards in columns of your own

The five status columns are herdr's reading of each pane and are read-only.
Beside them you can keep columns of your own.

Create one from a card: **more actions › park in… › new column…**. The
column appears to the right of `unknown`, holding that card. Its own header
menu renames it, sets its exit rule, or removes it — removing sends its
cards back to their status columns and changes nothing on the host.

A parked column has an **exit rule**, shown as a word beside its name:

- **never** — only you take a card out, with **unpark** on the card.
- **on agent activity** — the card leaves when its agent status changes
  into `working` or `blocked`. A card going `working → done` stays parked.
  This is the default for a new column.

A rule applies from the next status change onward; changing it never
unparks anything retroactively.

**Drag and drop** is available once two conditions hold: at least one
parked column exists, and the window is at least 900px wide. Below that the
board is one column per screen, so the destination would never be visible
and cards are not drag sources at all. Drops land only in parked columns —
a status column refuses a foreign card, and one released over its own
column goes home.

Parked columns live in this browser: they are not shared between browsers
or devices, herdr never sees them, and clearing site data loses them.
Settings › clear parked columns removes them deliberately.

## Narrowing the board

![The board with host chips, per-column chips and the group-by row above the status columns](./screenshots/desktop_board.png)

Three chip rows sit above the board, all visible, none hidden in a menu.

- **Hosts.** One chip per configured host, with its connection dot. Toggle
  a host off and its cards leave the board.
- **Columns.** One chip per column the board renders — the five status
  columns, then your parked columns — each with a live card count. The chip
  toggles the column it names, and a hidden column keeps counting, which is
  how you know what you are not looking at. A parked card is hidden by its
  own column's chip, never by the status it happens to carry.
- **Group by.** `none`, `host`, `repository`, `checkout path` or `tab`.
  Anything but `none` splits the board into swimlanes along that dimension.

## Scoping to a workspace or a tab

![The board scoped to a single workspace, with the scope pill above it](./screenshots/desktop_board_scoped.png)

The rail is a navigator, not a filter. Click a workspace or a tab in it and
kanhrd navigates: the URL becomes `/workspace/:workspaceId` or
`/workspace/:workspaceId/tab/:tabId`, and a scope pill above the board names
where you are. Because the scope is in the URL, the view is a link — bookmark
it, or send it to whoever asked what that agent is doing.

Clear the scope with the pill's `×`, by clicking the active row again, or
with `Escape` once nothing else is open. prefix + `w` opens the rail and
puts focus in it.
