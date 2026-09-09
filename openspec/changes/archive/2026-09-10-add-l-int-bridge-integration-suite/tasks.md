## 1. Fixtures

- [x] 1.1 `fixtures/bridge.ts`: spawn the real bridge on `--port 0`, wait for "Server listening", tear down after — `apps/bridge/integration/fixtures/bridge.ts`
- [x] 1.2 `fixtures/ws-client.ts`: `IntegrationClient` request/response + event waiter over a real WebSocket — `apps/bridge/integration/fixtures/ws-client.ts`
- [x] 1.3 `fixtures/herdr-cli.ts`: Node-friendly herdr CLI driver mirroring `apps/web/e2e/fixtures/herdr.ts`'s function names/shapes — `apps/bridge/integration/fixtures/herdr-cli.ts`
- [x] 1.4 `fixtures/require-herdr.ts`: shared skip-gracefully guard used by every test file — `apps/bridge/integration/fixtures/require-herdr.ts`

## 2. Test files

- [x] 2.1 `connectivity.test.ts` — lifecycle + HTTP connectivity — `apps/bridge/integration/connectivity.test.ts`
- [x] 2.2 `ws-methods.test.ts` — WebSocket protocol methods — `apps/bridge/integration/ws-methods.test.ts`
- [x] 2.3 `ordering.test.ts` — the two ordering-guarantee bugs found in tier-2 validation round 1 — `apps/bridge/integration/ordering.test.ts`
- [x] 2.4 `lifecycle.test.ts` — tier-3 pane/tab/workspace CRUD + events — `apps/bridge/integration/lifecycle.test.ts`

## 3. Wiring

- [x] 3.1 `pnpm test:int` script at repo root and `apps/bridge` package level — `apps/bridge/package.json`, `package.json`
- [x] 3.2 `vitest.integration.config.ts` runs files sequentially (`fileParallelism: false`) since several tests churn shared live workspace/pane state — `apps/bridge/vitest.integration.config.ts`
- [x] 3.3 Every file skips gracefully (not a hard fail) with a clear message when no live herdr server is reachable — `apps/bridge/integration/fixtures/require-herdr.ts`

## 4. Validator

- [x] 4.1 `openspec validate add-l-int-bridge-integration-suite --strict` passes with zero errors
