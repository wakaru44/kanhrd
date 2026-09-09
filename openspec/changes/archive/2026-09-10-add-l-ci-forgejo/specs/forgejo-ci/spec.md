## Purpose

A seven-job Forgejo Actions CI pipeline covering lint/typecheck, unit
tests, build, bridge integration tests, Playwright e2e, Docker build, and
coverage, that stays green on generic self-hosted runners lacking optional
infrastructure (a live herdr server, a Dockerfile, a coverage provider)
rather than failing on their absence.

## ADDED Requirements

### Requirement: Pipeline runs on every push and PR to main
CI SHALL trigger on push to any branch and on pull requests targeting
`main`, running all jobs on self-hosted runners pinned to a fixed Node and
pnpm version.

#### Scenario: A feature branch push triggers CI
- **WHEN** a commit is pushed to any branch
- **THEN** the `ci` workflow runs

### Requirement: Herdr-dependent jobs degrade to a clean skip, not a failure
`integration-tests` and `e2e-tests` SHALL check for a reachable local herdr
server before running their suites and SHALL log a visible notice or
warning either way. When herdr is not reachable, the underlying test
suites SHALL skip per-file with a clear message, and the job SHALL still
report success (0 failed).

#### Scenario: Generic runner without herdr stays green
- **WHEN** `integration-tests` or `e2e-tests` runs on a self-hosted runner with no `~/.config/herdr/herdr.sock`
- **THEN** the job logs a warning annotation and completes successfully with every test file reporting a skip

### Requirement: Optional lanes degrade visibly instead of silently
`lint-and-typecheck`'s lint step, `docker-build`, and `coverage`'s bridge
step SHALL detect whether their prerequisite (a `lint` script, a root
`Dockerfile`, a coverage provider dependency) exists and SHALL emit a
`::warning::` annotation naming the missing prerequisite and the lane
expected to add it, rather than failing the job or silently doing nothing.

#### Scenario: Missing Dockerfile does not fail CI before L-DOCKER lands
- **WHEN** `docker-build` runs on a commit before the `Dockerfile` exists
- **THEN** the job emits a warning naming the L-DOCKER lane and completes successfully without attempting a build
