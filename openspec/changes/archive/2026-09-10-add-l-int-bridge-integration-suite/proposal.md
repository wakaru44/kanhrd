## Why

Tier-2/tier-3 validation had accumulated a pile of throwaway `curl`/`wscat`/
Node-WS scripts under `/tmp/` that validators hand-wrote and re-wrote every
round. This is a retroactive OpenSpec record of the L-INT lane that closed
that gap by committing a permanent bridge-integration suite exercising the
real bridge process against a real herdr socket, written after the fact
because the work landed without a proposal. Commit: `a480565` (`bridge`).

## What Changes

- Add `apps/bridge/integration/**`: vitest tests that spawn the real bridge
  process (`tsx src/main.ts --port 0`, waits for the "Server listening"
  line, tears down after) and drive it over real HTTP + WebSocket traffic
  against a real local herdr socket — distinct from
  `apps/bridge/src/**/*.test.ts`'s unit tests, which fake the herdr socket,
  and from `apps/web/e2e/**`'s Playwright suite, which drives the browser.
- Four test files: `connectivity.test.ts` (lifecycle + HTTP connectivity),
  `ws-methods.test.ts` (WebSocket protocol methods), `ordering.test.ts`
  (the two ordering-guarantee bugs found in tier-2 validation round 1),
  `lifecycle.test.ts` (tier-3 pane/tab/workspace CRUD + events).
- Add shared fixtures: `fixtures/bridge.ts` (spawn/teardown), `ws-client.ts`
  (`IntegrationClient` — request/response + event waiter),
  `herdr-cli.ts` (Node-friendly herdr CLI driver, a deliberate
  re-implementation of `apps/web/e2e/fixtures/herdr.ts` since Playwright
  fixtures are TS-project-scoped to `apps/web`), and
  `require-herdr.ts` (shared skip-gracefully guard).
- Wire `pnpm test:int` at the repo root and `apps/bridge` package level.
  Every integration test file skips gracefully with a clear
  `[integration] skipping — ...` message when no live herdr server is
  reachable, rather than failing on connection-refused noise.
- Run test files sequentially (`fileParallelism: false` in
  `vitest.integration.config.ts`) since several files churn or type into
  the same live workspace/panes.

## Capabilities

### New Capabilities
- `bridge-integration-suite`: a permanent, committed test suite that
  exercises the real bridge process's HTTP/WS surface against a real herdr
  server, filling the gap between hermetic bridge unit tests and
  browser-level Playwright e2e tests, with graceful per-file skipping when
  no herdr server is available.

### Modified Capabilities
(none)

## Impact

- Affected code: `apps/bridge/integration/**`, `apps/bridge/package.json`
  (`test:int` script), `apps/bridge/vitest.integration.config.ts`.
- Affected systems: requires a reachable local herdr server
  (`~/.config/herdr/herdr.sock`) with at least one open pane to exercise
  for real; degrades to a clean skip otherwise.
