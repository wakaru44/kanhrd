# kanhrd documentation

Everything written down about kanhrd lives here, grouped by what you came for.
Nothing in this index restates its targets — each line says what the document
gives you and when to open it.

## Operate it

You want kanhrd running on a machine.

- [OPERATING.md](./OPERATING.md) — the three deployment shapes (laptop-only,
  cloud hub behind oauth2-proxy, mixed hub plus reverse-tunnelled laptop),
  with the trust boundary each one buys you. Start here before you deploy.
- [how-to/oauth-proxy.md](./how-to/oauth-proxy.md) — the step-by-step for
  recipe 2: putting a cloud VM behind oauth2-proxy, including the
  troubleshooting you will need when the callback URL is wrong.
- [THREAT-MODEL.md](./THREAT-MODEL.md) — what kanhrd exposes, who the adversary
  is, and which deployment shape defends against what. Read it alongside
  `OPERATING.md` before exposing kanhrd beyond loopback.

## Use it

You have kanhrd open in front of you.

- [USER-GUIDE.md](./USER-GUIDE.md) — the prefix chords, moving between cards
  and tabs from inside a terminal, columns of your own with their exit rules,
  and the chip rows and scoping that narrow the board. Open it once you are
  past the first click.

## Understand it

You want to know why kanhrd is shaped the way it is.

- [adr/](./adr/) — the load-bearing decisions, one file each, with the
  alternatives they beat and the trade-off accepted. Read these before
  proposing anything that changes the architecture; [adr/README.md](./adr/README.md)
  is the index.
- [CONTEXT.md](./CONTEXT.md) — the domain glossary. Pane, tab, workspace, host
  and their kanhrd-facing renames. Read it once and the rest of the docs stop
  being ambiguous.
- [history/](./history/) — frozen artifacts from before the repo existed.
  Preserved for provenance, not maintained; `CONTEXT.md` is the living version.
- [research/](./research/) — investigation memos. Explanations and open
  questions, never decisions; a memo becomes binding only when a maintainer
  folds it into a design doc or an ADR.

## Design authority

These three are **binding contracts for UI work, not suggestions.** If you are
touching `apps/web/src/**` or writing user-facing copy, read all three before
you write a line. Only a maintainer extends them — if your case is not covered,
say so in your PR rather than inventing an answer.

- [DESIGN-SYSTEM.md](./DESIGN-SYSTEM.md) — the token source of truth: colour,
  typography, spacing, radii, motion, iconography. It is enforced, not merely
  documented: the `scss-design-tokens` pre-commit hook fails any raw hex or raw
  `rem` in `apps/web` stylesheets. See its "Lint gate" section.
- [BRAND.md](./BRAND.md) — voice, wordmark, motifs, and the domain vocabulary
  used in UI copy (which deliberately differs from the wire and code terms in
  `CONTEXT.md`).
- [UX-GUIDELINES.md](./UX-GUIDELINES.md) — interaction patterns: visible
  affordances over hover-reveal, keyboard-first, URL-as-state, empty states as
  next steps. Its "E2E-assertable requirements" are numbered and asserted by the
  mobile Playwright specs.
- [assets/](./assets/) — the wordmark, light and dark. Use these files rather
  than re-drawing the mark.
- [screenshots/](./screenshots/) — reference captures of the shipped UI.

## Contribute

- [CONTRIBUTING.md](./CONTRIBUTING.md) — whether a change wants a PR or a
  proposal first, the pre-commit toolchain, and the test suites (including the
  one that drives a real herdr and must stay opt-in).

## The change record

[`openspec/`](../openspec/) at the repo root is not documentation — it is the
change record. `openspec/specs/` holds the persistent, per-capability source of
truth for what has actually shipped; `openspec/changes/` holds proposals that
are in flight, with archived ones under `openspec/changes/archive/`. The
go-forward rule is proposal-first: substantial work starts as a change there
and is archived once it lands. See [openspec/README.md](../openspec/README.md).

If you are reading a spec and a doc under `docs/` that disagree, the spec
records what shipped and the design docs record what is binding going forward —
raise the conflict rather than guessing which one won.
