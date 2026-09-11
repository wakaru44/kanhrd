import { defineConfig } from 'vitest/config';

/**
 * Integration-test config (`pnpm test:int`). Spawns the real bridge as a
 * subprocess against a **throwaway** herdr session — never the operator's
 * default socket. See `integration/README.md`.
 *
 * `globalSetup`: sweeps leaked `kanhrd-test-*` sessions, starts and seeds
 * this run's own headless session, and disposes of it on teardown. Without
 * it the fixtures have no session handoff and refuse to run at all, which is
 * the point — there is no silent fallback to `~/.config/herdr/herdr.sock`.
 *
 * `fileParallelism: false`: every test file shares the same live herdr
 * server and, in several cases, the same workspace/panes. Running files
 * concurrently would let one file's churn (pane split/close, burst sends)
 * race another file's assertions on pane content or connection state.
 * Playwright's own e2e suite (`apps/web/e2e`) makes the same call
 * (`workers: 1`, `fullyParallel: false`) for the identical reason.
 */
export default defineConfig({
  test: {
    globalSetup: ['./integration/fixtures/global-setup.ts'],
    include: ['integration/**/*.test.ts'],
    exclude: ['node_modules/**', 'dist/**'],
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 20_000,
  },
});
