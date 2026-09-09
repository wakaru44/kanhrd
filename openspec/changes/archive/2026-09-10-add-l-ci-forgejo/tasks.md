## 1. Workflow scaffold

- [x] 1.1 `.forgejo/workflows/ci.yml`: triggers on push (any branch) and PRs targeting `main`, self-hosted runners, Node 22 / pnpm 10 pinned via `env:` — `.forgejo/workflows/ci.yml`
- [x] 1.2 `.forgejo/README.md` documents the runner setup — `.forgejo/README.md`

## 2. Core jobs

- [x] 2.1 `lint-and-typecheck`: typecheck across schema/bridge/web; lint step self-skips with a visible warning until a package declares a `lint` script
- [x] 2.2 `unit-tests`
- [x] 2.3 `build`

## 3. Herdr-gated jobs

- [x] 3.1 `integration-tests`: runs `pnpm test:int` on self-hosted runners, checks herdr availability and logs a notice/warning either way; suite skips per-file gracefully via `require-herdr.ts` when herdr isn't reachable
- [x] 3.2 `e2e-tests`: runs `pnpm test:e2e` with the same herdr-availability check/log pattern, uploads `playwright-test-results` on failure
- [x] 3.3 Comment documents the optional `kanhrd-herdr-available` runner label for pinning these jobs to a herdr-equipped runner in the future (not wired up yet — no such runner exists)

## 4. Remaining jobs

- [x] 4.1 `docker-build`: self-skips with a visible warning if no root `Dockerfile` exists; builds (does not push, no registry configured) when it does
- [x] 4.2 `coverage`: karma web coverage via headless Chrome install; bridge coverage self-skips visibly since no `@vitest/coverage-*` devDependency is installed; uploads `coverage-lcov` artifact

## 5. Validator

- [x] 5.1 `openspec validate add-l-ci-forgejo --strict` passes with zero errors
