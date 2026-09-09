import { defineConfig } from "vitest/config";

/**
 * Integration-test config (`pnpm test:int`). Spawns the real bridge as a
 * subprocess against a live local herdr socket — see `integration/README.md`.
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
    include: ["integration/**/*.test.ts"],
    exclude: ["node_modules/**", "dist/**"],
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 20_000,
  },
});
