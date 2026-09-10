# `.forgejo/` — CI reference

Operational reference for the Forgejo Actions pipeline in this repository.
Not a tutorial; describes what exists and why.

## Workflows

### `workflows/ci.yml`

Triggers: `push` on any branch, `pull_request` targeting `main`.

All jobs run on `runs-on: self-hosted` (generic label). No `kanhrd-herdr-available`
runner label is configured yet — see "herdr-dependent jobs" below.

Pinned toolchain (no `packageManager` field or `.nvmrc` exists in the repo to
read from yet): Node `22`, pnpm `10`, set once via `env:` at the top of the
file. Update these in one place if the repo later adds `packageManager` to
`package.json`.

| job                  | depends on           | what it runs                                                          | notes                                                                                                                                           |
| -------------------- | -------------------- | --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `lint-and-typecheck` | —                    | `pnpm typecheck` (schema, bridge, web); lint                          | lint step no-ops with a visible `::warning::` — no package currently declares a `lint` script                                                   |
| `unit-tests`         | `lint-and-typecheck` | `pnpm --filter @kanhrd/bridge test`, `pnpm --filter @kanhrd/web test` | installs `google-chrome-stable` for `karma-chrome-launcher`; JUnit artifact step is a no-op until apps/** wire up reporters (see below)         |
| `build`              | `lint-and-typecheck` | builds schema, web, bridge                                            | uploads `web-dist` (`apps/web/dist/web/browser/`) and `bridge-dist` (`apps/bridge/dist/`) artifacts                                             |
| `integration-tests`  | `build`              | `pnpm test:int`                                                       | herdr-dependent, see below                                                                                                                      |
| `e2e-tests`          | `build`              | `pnpm test:e2e`                                                       | herdr-dependent, see below; uploads `apps/web/test-results/` on failure                                                                         |
| `docker-build`       | `build`              | `docker build -t kanhrd/bridge:$SHA .`                                | no-ops with a visible `::warning::` until a root `Dockerfile` exists (L-DOCKER); no registry push wired up yet, image stays local to the runner |
| `coverage`           | `unit-tests`         | web coverage via `ng test --code-coverage`                            | bridge coverage no-ops (no coverage provider devDependency in `apps/bridge`); uploads `coverage-lcov` artifact                                  |

### `workflows/nightly.yml`

Not created. Nothing in the current suite is slow enough (no cross-browser
matrix, no long-running scenario suite) to justify splitting it out of `ci.yml`.
Add it if/when one of those shows up.

## herdr-dependent jobs

`integration-tests` and `e2e-tests` need a reachable local herdr server
(`~/.config/herdr/herdr.sock` plus, for `test:int`, at least one open pane).
Generic self-hosted runners don't have this. Both jobs run a `check herdr
availability` step first that logs a `::notice::` (socket found) or
`::warning::` (not found, expected) so a green run is legible as "ran for
real" vs. "skipped" at a glance — the suites themselves already skip
gracefully per-file/per-spec (`apps/bridge/integration/fixtures/require-herdr.ts`,
`apps/web/e2e/fixtures/herdr.ts`), so a missing herdr never fails the job.

To make these jobs actually exercise the suites instead of skipping, stand
up (or point at) a runner that has herdr installed and running, label it
`kanhrd-herdr-available` in its Forgejo runner config, and change
`runs-on: self-hosted` to `runs-on: [self-hosted, kanhrd-herdr-available]`
in both jobs. The rest of the pipeline keeps running on generic runners
either way.

## Artifacts

| name                      | produced by                  | contents                                                                                   | retention |
| ------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------ | --------- |
| `web-dist`                | `build`                      | `apps/web/dist/web/browser/`                                                               | 7 days    |
| `bridge-dist`             | `build`                      | `apps/bridge/dist/`                                                                        | 7 days    |
| `junit-results`           | `unit-tests`                 | `apps/{bridge,web}/junit.xml` (currently never produced, see below)                        | default   |
| `playwright-test-results` | `e2e-tests`, on failure only | `apps/web/test-results/`                                                                   | default   |
| `coverage-lcov`           | `coverage`                   | `apps/web/coverage/`, `apps/bridge/coverage/` (bridge currently never produced, see below) | 14 days   |

## Known gaps (require apps/** changes, out of scope for this lane)

- **JUnit reporters.** Neither `apps/bridge/vitest.config.ts` /
  `vitest.integration.config.ts` nor `apps/web`'s `angular.json` karma test
  builder emit JUnit XML today. `unit-tests`' JUnit upload step is wired up
  but has nothing to find (`if-no-files-found: ignore`). To activate it: add
  a JUnit reporter to the bridge's vitest configs (e.g.
  `vitest-junit-reporter`, pointed at `apps/bridge/junit.xml`) and a
  `karma-junit-reporter` to the web project's test builder config, pointed
  at `apps/web/junit.xml`.
- **Bridge lcov coverage.** `apps/bridge/package.json` has no
  `@vitest/coverage-v8` (or `-istanbul`) devDependency, so `vitest run
--coverage` isn't runnable. The `coverage` job detects this and skips the
  bridge half with a visible warning. To activate it: add
  `@vitest/coverage-v8` as a devDependency and (optionally) a `coverage`
  block in `apps/bridge/vitest.config.ts` (`reporter: ["lcov", "text"]`) so
  output lands in `apps/bridge/coverage/lcov.info`.
- **Web coverage is already possible without an apps/** change** — `ng test
--code-coverage` uses the `karma-coverage` devDependency that's already
  installed, via Angular's built-in default karma config (no
  `karma.conf.js` exists in the repo, so Angular's own default applies).
  Output lands in `apps/web/coverage/`.
- **`docker-build`** assumes a root `Dockerfile` from the L-DOCKER lane and a
  `docker build` context of `.`. Neither exists yet; the job checks for the
  file and no-ops with a warning until it lands. No registry is configured —
  once one exists, add a login + `docker push` step after the build step.
- **Lint.** No package declares a `lint` script yet. `lint-and-typecheck`
  detects this at runtime and no-ops with a warning; once L-PRECOMMIT lands
  per-package `lint` scripts, `pnpm -r --if-present lint` picks them up with
  no workflow change needed.

## Runner assumptions

Linux, Docker available, `sudo apt-get` available for installing
`google-chrome-stable` (needed by `karma-chrome-launcher` for
`ChromeHeadless`), outbound network access to `npm`/`dl.google.com`/GitHub
Actions marketplace mirrors used by `actions/checkout`, `actions/setup-node`,
`pnpm/action-setup`, and `actions/{up,down}load-artifact`.
