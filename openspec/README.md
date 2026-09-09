# openspec

This directory is kanhrd's OpenSpec record: `openspec/specs/` holds the
persistent, per-capability source of truth for what has actually shipped,
and `openspec/changes/` holds in-flight or archived change proposals.
`openspec/changes/archive/` is where the CLI moves a change once it's
archived.

## Go-forward rule

Every substantial lane starts with an OpenSpec proposal
(`openspec new change <name>`), gets its `proposal.md`/`tasks.md`/
`specs/<capability>/spec.md` filled in before or alongside the work, and is
archived (`openspec archive <name> --yes`) once it lands and
`openspec validate <name> --strict` passes. Don't ship a lane's code
without a corresponding change; don't leave a change proposal open once its
work has actually merged.

As of 2026-09-10, this repo ran a retro-catchup to bring `openspec/` back
in sync with shipped reality: the three tier proposals
(`add-tier-1-kanban`, `add-tier-2-terminal`, `add-tier-3-lifecycle`) were
completed and archived, and nine post-MLP lanes that had shipped without
any proposal (theme/settings/stats/mobile UX, keyboard shortcuts, the
bridge integration test suite, the Docker image, Forgejo CI, the
pre-commit lint gate, the OAuth proxy deploy overlay, the mobile Playwright
project, and the self-documenting Makefile) were written up and archived
retroactively. That catch-up is a one-time exception — the expectation
from here on is proposal-first, not retroactive documentation.

A tenth lane, L-UX2 (`add-l-ux2-empty-state-nav-feedback-density-terminal-themes`
— empty-state onboarding, rail-as-navigator URL scoping, the toast/inline-error
feedback layer, terminal loading state, card density/virtual-scroll/drag
scaffold, and per-terminal color themes), was still landing its commit as
this catch-up ran. Its proposal is authored and validated but intentionally
left un-archived in `openspec/changes/`; archive it once its commit lands.
