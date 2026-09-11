import { defineConfig, devices } from '@playwright/test';

/**
 * E2E suite for kanhrd's tiered contracts (tier-1 kanban board, tier-2
 * terminal). Assumes the SPA is already built (`pnpm --filter @kanhrd/web
 * build`) and served by the bridge (`pnpm --filter @kanhrd/bridge build`),
 * which this config spawns as the Playwright `webServer`. See
 * `e2e/README.md` for the full run sequence.
 *
 * Two isolation properties are configured here and must not be relaxed:
 *
 * - `webServer.command` is `e2e/fixtures/isolated-bridge.mjs`, which starts
 *   this run's own throwaway herdr session and points the bridge at it.
 *   The bridge is never started against the default config, whose single
 *   host is the operator's live socket.
 * - `reuseExistingServer: false`, on a port that is not the bridge's default
 *   5173. It used to be `true`, which meant a run silently attached to
 *   whatever was already listening — in practice the operator's own bridge,
 *   serving a different build against their live herdr. Playwright now
 *   fails the run outright if the port is busy, which is the honest
 *   outcome: a suite that cannot start its own server has not run.
 */
/** Not 5173: that is the bridge's own default, i.e. the operator's. */
const PORT = process.env['KANHRD_E2E_PORT'] ?? '5273';

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: false,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 1 : 0,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      testIgnore: [/mobile\.spec\.ts$/, /capture\.spec\.ts$/],
    },
    {
      name: 'mobile',
      // devices['iPhone 13'] defaults to WebKit; only Chromium is installed
      // (test:e2e:install), and the brief asks for mobile *Chromium*, so
      // force the browser while keeping the device's viewport/UA/touch bits.
      use: { ...devices['iPhone 13'], browserName: 'chromium' },
      testMatch: /mobile\.spec\.ts$/,
    },
    {
      // Documentation captures. Writes committed LFS binaries, so it is NOT
      // part of `make test-e2e` and never runs in CI — `make screenshots`
      // selects it explicitly with `--project=capture`.
      name: 'capture',
      use: { ...devices['Desktop Chrome'] },
      testMatch: /capture\.spec\.ts$/,
    },
  ],
  webServer: {
    command: 'node e2e/fixtures/isolated-bridge.mjs',
    env: { KANHRD_E2E_PORT: PORT },
    url: `http://127.0.0.1:${PORT}/api/hosts`,
    reuseExistingServer: false,
    // Starting a herdr session and seeding it costs a few seconds on top of
    // the bridge's own start.
    timeout: 40_000,
    // Without this Playwright SIGKILLs the webServer's process group, which
    // the launcher cannot catch — it would leave its herdr session running
    // for the next run's sweep to find. SIGTERM lets it stop and delete the
    // session on the way out, so the sweep stays a backstop rather than the
    // normal path.
    gracefulShutdown: { signal: 'SIGTERM', timeout: 10_000 },
    // The bridge's pino log goes to stdout and is pure noise here; the
    // launcher's own banner (which session, which socket) goes to stderr,
    // which Playwright pipes by default.
  },
});
