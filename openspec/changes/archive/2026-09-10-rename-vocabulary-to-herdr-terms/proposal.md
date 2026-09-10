## Why

The neo-shepherd redesign introduced a copy-only rename: users read
**pen** (host), **field** (workspace), **lane** (tab), while the wire,
code and errors kept herdr's terms. The intent was warmth and a
coherent shepherding metaphor.

In use it costs more than it returns:

1. **It teaches a second vocabulary for no gain.** kanhrd's users are
   herdr users. They already know what a host, a workspace and a tab
   are, and the herdr CLI will keep saying so. The rename asks them to
   hold a translation table for objects they can already name.
2. **A quoted error breaks the illusion anyway.** `copy.ts` deliberately
   passes herdr's wording through verbatim, so `couldn't rename. herdr
   said: Workspace "Main" has no such tab` puts both vocabularies in one
   sentence. The seam is visible at exactly the moment the user is
   already confused.
3. **`lane` collides with the concept the product is built on.** kanhrd
   is a kanban board. In every kanban tool a *lane* (swimlane) is a
   visual grouping of cards. Spending that word on "a herdr tab" leaves
   the actual concept unnamed, and produced a genuine question from the
   maintainer — "what is the difference between a rail and a lane?" —
   which no glossary answers well because the answer is "nothing
   related; they just rhyme".

The third point is the decisive one. The word is needed for what it
means everywhere else in this product category.

## What Changes

**Domain objects take herdr's names in user-facing copy.**

| was | becomes |
| --- | --- |
| pen | **host** |
| field | **workspace** |
| lane | **tab** |

**Kanban UI objects keep kanban's names.** These are not renames of
herdr objects; they are names for things on a board that herdr has no
concept of:

- **card** — the visual unit representing a pane. Stays.
- **status column** — a board grouping derived from `agent_status`. Stays.
- **swimlane** (short form **lane**) — a horizontal band grouping cards
  by a chosen dimension. **Reserved by this change and defined in the
  glossary; the feature that uses it is a separate change.**

The result is one rule instead of a translation table: *herdr's objects
use herdr's words; the board's own furniture uses kanban's words.* A
card is a pane, and the glossary says so once.

**Voice does not change.** Lowercase, terse, verbs of tending, care copy
on lifecycle and empty/error surfaces, no exclamation marks — all of it
stands. This change swaps nouns, nothing else. `let this one rest?`
stays exactly as it is.

## What this is not

- Not a wire, schema, capability or API change. Those already used
  herdr's terms; this makes the UI agree with them.
- Not a redesign. No token, layout, component or interaction changes.
- Not a re-voicing. Do not "improve" any string while renaming it. A
  reviewer must be able to diff this change and see only nouns move.

## Coordination

Three changes are in flight and written in the old vocabulary:
`add-parked-columns` (4/39), `add-terminal-top-bar` (4/36),
`add-bridge-origin-allowlist` (0/26). All three are early enough that
renaming their prose is cheap now and expensive later. The archived
`add-l-brand-neo-shepherd-redesign` is history and is **not** rewritten;
`docs/history/**` is frozen by CLAUDE.md.

`add-parked-columns` additionally overlaps the reserved swimlane concept
— both arrange the board by something other than status. That
relationship is called out in the swimlane change, not resolved here.

## Impact

- Affected specs: `domain-vocabulary` (new, and the authority every
  later change cites).
- Affected docs: `docs/BRAND.md` (rename table, approved-copy table,
  the "lane means one thing" section), `docs/DESIGN-SYSTEM.md`,
  `docs/UX-GUIDELINES.md`, `docs/CONTEXT.md` glossary.
- Affected code: `apps/web/src/app/shared/copy.ts` and every string in
  it that names a domain object; `COPY.rail`, `COPY.create`,
  `COPY.help`, `COPY.confirm`, `COPY.toast`, `COPY.emptyState`,
  `COPY.settings`.
- Affected tests: `copy.spec.ts`'s renamed-vocabulary assertion inverts
  — it currently asserts no user-facing string says host/workspace/tab,
  and must become an assertion that none says pen/field/lane.
- Affected e2e: specs asserting copy through `COPY.*` follow
  automatically; any that hardcode the old nouns do not.
