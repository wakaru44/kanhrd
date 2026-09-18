## Why

Three things are wrong with the board card, and two of them have the same
cause.

**The title is squeezed by rows it has nothing to do with.** `card.scss`
lays the whole card out as ONE grid:

```scss
grid-template-columns: auto minmax(0, 1fr) auto;
grid-template-areas:
  'dot    title  seal'
  'path   path   path'
  'status meta   actions';
```

A grid column is as wide as the widest cell in it across EVERY row. So
column 1 is sized by `.status-label` ("working", "unknown") in row 3, and
column 3 by `.card-actions` — four 28px buttons. The title, in row 1,
starts after an inset it does not use and ends before an edge it does not
reach. At `--column-min-width` (260px) with seven columns on the board,
that leaves the title roughly 70px: `Kanhr…`, with visible emptiness on
both sides of it. The title is not too long; it is paying rent for two
other rows.

**Three truncations in one line say less than one whole string.** The
locator row renders `workspace / tab`, the repo name and the checkout tail
side by side, each with its own ellipsis: `kanhrd / do-…  kan…
…/wakaru44/ka…`. Nothing there is readable, and the repo is very often the
same word as the workspace, so one of the three ellipses is spent
repeating its neighbour.

**The layout approach is the bug.** Named grid areas over a shared column
set couple rows that are not related. Rows and columns as GROUPING
(a row box holds what belongs on that row, and nothing else can reach
into it) is both the operator's stated preference and the shape that makes
this class of defect impossible.

## What Changes

### The card becomes nested row and column boxes

One column box (the card), holding row boxes. Each row box sizes its own
children; no row can widen or inset another. Concretely:

```text
┌ card (column box) ─────────────────────────┐
│ ┌ row: identity ─────────────────────────┐ │
│ │ ● │ Kanhrd Service            │ [local]│ │   dot, title (fills), seal
│ └────────────────────────────────────────┘ │
│ ┌ row: locators (wraps) ─────────────────┐ │
│ │ kanhrd / SVC        ~/…/wakaru44/kanhrd│ │   at most two per line
│ └────────────────────────────────────────┘ │
│ ┌ row: state ────────────────────────────┐ │
│ │ working  2m              → ↓ ✕ ⋯       │ │   status word, elapsed, actions
│ └────────────────────────────────────────┘ │
└────────────────────────────────────────────┘
```

The status word **stays** (maintainer decision, 2026-09-12): a card is
self-describing wherever it is rendered, and the reason it was pushing the
title around was the shared grid column, not the word. In a row box it
sits on its own line and costs the title nothing.

### Locators wrap, at most two per line, rather than truncating three

The locator row is a wrapping row box whose children each claim at least
half of it. Two short locators share a line; one long locator takes the
line and pushes its neighbour to the next. Ellipsis survives only as the
last resort for a pathological string, and now over half a card rather
than a third of it.

The repo name is **suppressed when it equals the workspace name**, which
is the common case on this board: `kanhrd / SVC` already says `kanhrd`,
and reprinting it buys nothing. Nothing is hidden that the operator cannot
reach: the full checkout path is still rendered on keyboard focus and in
full on the detail route.

### Compact stays one row, and becomes a row box too

The compact variant keeps exactly the items it has today — dot, title,
seal, elapsed, status cue, overflow trigger — on one line, rebuilt as a
row box. The title is still the only element permitted to truncate there.

## Impact

- **Affected specs:**
  - `l-brand-neo-shepherd-redesign` — ADDED "The card's rows are
    independent", which pins the information hierarchy and the
    at-most-two-locators rule; MODIFIED "Card renders in a compact
    single-row variant when density warrants it" (unchanged in content,
    restated so the single row is a row box and the truncation rule is
    stated once).
- **Affected code:** `apps/web/src/app/board/card.{html,scss,ts}`
  (+ `card.spec.ts`).
- **No change to:** the card's DOM ORDER (so screen-reader reading order
  is untouched), any class name a spec or E2E asserts on (`.card-open`,
  `.status-label`, `.host-seal`, `.path`, `.meta`, `.card-actions`), the
  stretched-link pattern, the overflow-menu portal, `--column-min-width`,
  or any token.
- **Deliberately not here:** the board's own chrome (four stacked rows of
  filters above the columns), which is its own change; and the pane
  view's hierarchy, which is `add-pane-tab-hierarchy`.
- **Risk:** low and visual. The failure mode is a wrong line break, not a
  lost control.
