## Why

kanhrd had no CI — every check (typecheck, unit tests, e2e, build) was run
by hand. This is a retroactive OpenSpec record of the L-CI lane that added
a Forgejo Actions pipeline, written after the fact because the work landed
without a proposal. Commit: `8e4e0bb` (`deploy`).

## What Changes

- Add `.forgejo/workflows/ci.yml`, triggered on push to any branch and on
  pull requests targeting `main`, running on `self-hosted` runners, pinned
  to Node 22 / pnpm 10.
- Seven jobs: `lint-and-typecheck` (typecheck across schema/bridge/web;
  lint step self-skips with a visible warning until a package declares a
  `lint` script — expected from the L-PRECOMMIT lane), `unit-tests`,
  `build`, `integration-tests` (bridge integration suite, herdr-availability
  gated — see below), `e2e-tests` (Playwright, same herdr-availability
  gating), `docker-build` (self-skips with a visible warning if no root
  `Dockerfile` exists yet — expected from the L-DOCKER lane; builds the
  image but does not push, since no registry is configured), and
  `coverage` (karma web coverage; bridge coverage self-skips visibly since
  `apps/bridge` has no coverage provider installed).
- `integration-tests` and `e2e-tests` run on generic `self-hosted` runners
  that don't have herdr installed. Rather than failing, each job checks for
  `~/.config/herdr/herdr.sock` + the `herdr` CLI and logs a notice/warning;
  the suites themselves (via `require-herdr.ts`/`fixtures/herdr.ts`) skip
  per-file with a clear message, so the job stays green ("0 skipped, not 0
  failed"). A comment documents pinning these jobs to an optional
  `kanhrd-herdr-available` runner label later, once such a runner exists.
- Every graceful-degradation path (missing lint script, missing
  Dockerfile, missing coverage provider, missing herdr) emits a visible
  `::warning::`/`::notice::` annotation rather than silently no-op'ing, so
  the gap is discoverable from the CI UI without reading the workflow file.

## Capabilities

### New Capabilities
- `forgejo-ci`: a seven-job CI pipeline covering lint/typecheck, unit
  tests, build, bridge integration tests, Playwright e2e, Docker build,
  and coverage, running on self-hosted runners with graceful,
  visibly-annotated degradation for lanes that hadn't landed yet
  (lint config, Dockerfile, coverage provider) or infrastructure that
  isn't always present (a live herdr server).

### Modified Capabilities
(none)

## Impact

- Affected code: `.forgejo/workflows/ci.yml`, `.forgejo/README.md`.
- Affected systems: requires self-hosted Forgejo runners; does not require
  a herdr-available runner to stay green, but exercises more when one is
  present.
