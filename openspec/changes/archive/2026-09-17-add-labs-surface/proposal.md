## Why

The operator wants a read-only file panel next to the agent's terminal in
pane detail: browse the repo the pane works in, read a file, read its diff,
never edit. Before that panel is specced, its **layout** questions have to
be answered — where it sits in portrait and in landscape, how it shares the
key bar's keyboard reserve, what split ratio reads well — and those are
device questions. A drawing or a paragraph cannot settle how a panel feels
on a phone with the soft keyboard up; only a page on the phone can.

kanhrd has no place for that kind of page. Every route is product, listed,
and held to the approved-copy table. So design questions get answered in
prose, and prose is the wrong instrument.

## What Changes

- **`/labs` becomes permanent product furniture**: an unlisted route family
  where a design question is answered by a page in the browser. It outlives
  the file panel.
  - Reachable by URL only. No rail entry, no settings link, no link anywhere
    in the app, and `NotFound` does not suggest it. There is no index page:
    the bare `/labs` is not a route and lands on `NotFound`; only an exact
    mock path resolves.
  - A lab may do whatever it needs — call the real bridge, read or write,
    pull a new dependency. Two structural guards protect the codebase, not
    the lab: every lab route is **lazy-loaded** (`loadComponent`), so nothing
    a lab imports lands in the board's initial bundle; and the **dependency
    arrow is one-way** — a lab may import product code, product code never
    imports from `labs/`, enforced by a unit test.
  - Copy inside a lab is exempt from `docs/BRAND.md`'s approved-copy table
    and is not added to it. In exchange every lab page visibly says it is a
    lab, so a screenshot can never pass for the product.
  - Design tokens and the lucide icon set are **not** exempt: the point of a
    lab is judging real colour and spacing.
  - A mock is deleted by the change that supersedes it.
- **The first inhabitant, `/labs/file-explorer/mock1`**: a static mock of the
  file panel over hard-coded fixture data. A fake pane-detail view (a styled
  box stands in for the terminal; no xterm, no bridge), with the panel
  collapsed by default and toggled from the trailing edge of the repo name.
  The panel is goto bar / body (`file-browser` + `file-viewer`) / status
  line. Two open questions are built in as visible controls rather than
  answered: key bar behaviour while the panel has focus (keep / auto-collapse)
  and split ratio (draggable-and-remembered / fixed default, with the live
  ratio shown).

## Not done

- The file panel itself: no bridge methods, no file reads, no git
  integration. This change ships a mock, not a feature.
- Picking an answer to either device question. The mock offers both; the
  operator settles them on the phone, and the change that specs the real
  panel records the answer.
- A labs index, or any listing of labs. Unlisted is the ruling.

## Impact

- `apps/web/src/app/app.routes.ts` — one lazy route, before `**`.
- `apps/web/src/app/labs/**` — new; the only home of lab code.
- `apps/web/src/app/labs/labs-boundary.spec.ts` — the one-way-import gate.
- No change to the bridge, the schema, `copy.ts`, `icons.ts`, or the design
  docs.
