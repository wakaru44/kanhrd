## Why

kanhrd's commands were spread across pnpm scripts, docker CLI invocations,
and pre-commit, with no single discoverable entry point for a new
contributor. This is a retroactive OpenSpec record of the L-MAKEFILE lane,
written after the fact because the work landed without a proposal.
Commits: `1749a4e` (`chore(tooling): self-documenting Makefile + gitignore
codegraph`), extended by `8c3b990`/`84fb610` (dev/run split, Tailscale
targets) and `f234ec2` (`keyboard`, which added `test-e2e-install`-adjacent
housekeeping).

## What Changes

- Add a root `Makefile` that becomes the project's command entry point.
  Every target carries a `## <description>` comment; the default `help`
  target (also the `.DEFAULT_GOAL`) scrapes those comments with `awk` into
  a categorized listing (`## <Category>` section headers group targets).
- Targets delegate to pnpm/docker/pre-commit one-liners rather than
  reimplementing them, so the underlying stack — not the Makefile — stays
  the source of truth for how each step actually works.
- Categories: Setup (`install`, `hooks`), Run (`run`, `run-exposed`,
  `run-tailscale`, `run-tailscale-serve` — a spectrum from safe-loopback to
  LAN-exposed to Tailscale-fronted, each target's description states its
  exposure honestly), Dev (`dev-web`, `dev-bridge`, watch mode), Build
  (`build`, `build-schema`, `build-bridge`, `build-web`), Quality
  (`typecheck`, `test`, `test-unit`, `test-int`, `test-e2e`,
  `test-e2e-install`, `lint`, `format`), Docker (`docker-build`,
  `docker-up`, `docker-down`, `docker-logs`), CI (`ci` — fast local-parity
  suite; `ci-full` — adds herdr-dependent suites), Housekeeping (`clean`,
  `nuke`, `tailconnect`).
- Common flow documented in the commit message: `make install` ->
  `make hooks` -> `make dev`.
- Also gitignore `.codegraph/` (the local code-intelligence index produced
  by `codegraph init`), unrelated to the Makefile itself but landed in the
  same commit as general tooling hygiene.

## Capabilities

### New Capabilities
- `tooling-makefile`: a self-documenting `make help` entry point covering
  setup, run (with an explicit safe-to-exposed spectrum), dev, build,
  quality, Docker, and CI targets, delegating to the underlying tools
  rather than reimplementing them.

### Modified Capabilities
(none)

## Impact

- Affected code: `Makefile`, `.gitignore`.
- Affected systems: none required to exist beforehand — every target
  degrades to whatever the underlying pnpm/docker/pre-commit command would
  do on its own (e.g. `test-int`/`test-e2e` skip gracefully without a live
  herdr server, same as running the pnpm scripts directly).
