## Why

Recorded after the fact: this change documents what shipped in `043d787`
and `f541972`, which were made as a direct layout fix and are larger than
the foreman-inline exemption in `CLAUDE.md` (four files, new user-facing
copy). The spec record should exist for the same reason the docs should:
the product does what the code does.

**The chrome was taking the screen.** Measured against the built SPA on the
mocked bridge:

| viewport | filter bar | first card at | chrome share |
| --- | --- | --- | --- |
| 1600×900 | 160px | 284px | 32% |
| 1600×900, scoped | 160px | 342px | 38% |
| 1280×800, scoped | 160px | 342px | **43%** |

`.filter-bar` was `flex-direction: column`, so its three groups — hosts,
column chips, group-by — each took a fixed 40px row while using about a
third of the available width. The "Small laptop" scenario in this
capability still passed, which is the point worth recording: it passed by
about five cards in a column that holds sixteen, so the assertion was too
weak to catch this.

**Then merging them removed the only thing that told the chips apart.** A
host chip and a status-column chip are the same outlined chip with the same
8px dot: `local` beside `working 0` is, in the operator's words, "is it a
host? is it a status? is it a wot?". The row break had been carrying that
distinction for free.

## What Changes

### The bar is a wrapping row of groups, and the groups wrap in turn

The groups were already wrapping rows of chips; only the outer box changed.
That composition IS the responsive behaviour — no media query, no
breakpoint to keep in step:

| viewport | result | bar height |
| --- | --- | --- |
| 1600 | hosts │ columns │ group by, one line | 64px |
| 1280 | groups wrap as units, two lines | 112px |
| 900 | each group on its own line | 160px |
| 390 | groups stacked, chips wrapping inside each group | 256px |

First card after: 246px (27%) at 1600×900, 294px (37%) at 1280×800. No
horizontal page scroll at any width.

### Every group carries its own label

The group-by row already did this, in its own words: "the row's own label
in front of it so the chips are not left to explain themselves". Hosts and
columns get the same `.row-label`, which is also the group's accessible
name (`role="group"`, `aria-label`), and which travels with its group
wherever that group wraps. It costs no height at any width — the labels sit
on lines the chips had already claimed.

`columns` covers both kinds on the board, the status columns and the
operator's parked ones; `status columns` would be a lie about half the
chips. `hosts` is deliberately the word Settings already uses, because
herdr's objects take herdr's words on every surface.

### Deliberately not done

- **No chip or column removed, and nothing hidden.** The column chips carry
  their per-column count, which is the reason they stay visible rather than
  collapsing into a menu (maintainer decision, 2026-09-12).
- **No `<app-chip>` component.** It would have one consumer, and when this
  codebase needed to share a control's look it shared a stylesheet
  (`shared/_controls.scss`, `shared/_icon-button.scss`) because Angular's
  emulated encapsulation stops a parent styling a child's template. Extract
  `shared/_chip.scss` first, and only if a second consumer appears.
- **The scope pill and the `+` button keep their own band**, worth roughly
  another 130px if they move into the header row. Separate change.
- **The host chip's connection dot still borrows the status palette** —
  green for connected, red for unreachable — so a green dot means two
  things in one row. The group label disambiguates it; giving connection
  state a shape of its own is a design-system decision.

## Impact

- **Affected specs:** `l-brand-neo-shepherd-redesign` — MODIFIED "Board
  composition communicates attention before decoration": the chrome now has
  a stated ceiling and the filter groups have to name themselves. Both
  existing scenarios are carried forward unchanged.
- **Affected code:** `apps/web/src/app/board/filter-bar.{html,scss}`
  (+ spec), `apps/web/src/app/shared/copy.ts`, `docs/BRAND.md`.
- **No change to:** what any chip does, the per-column filter keys, the
  board grid, `--column-min-width`, or any token.
