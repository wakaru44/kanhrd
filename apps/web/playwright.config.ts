import { defineConfig, devices } from "@playwright/test";

/**
 * E2E suite for kanhrd's tiered contracts (tier-1 kanban board, tier-2
 * terminal). Assumes the SPA is already built (`pnpm --filter @kanhrd/web
 * build`) and served by the bridge (`pnpm --filter @kanhrd/bridge build`),
 * which this config spawns as the Playwright `webServer`. See
 * `e2e/README.md` for the full run sequence.
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: false,
  forbidOnly: !!process.env["CI"],
  retries: process.env["CI"] ? 1 : 0,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:5173",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
      testIgnore: /mobile\.spec\.ts$/,
    },
    {
      name: "mobile",
      // devices['iPhone 13'] defaults to WebKit; only Chromium is installed
      // (test:e2e:install), and the brief asks for mobile *Chromium*, so
      // force the browser while keeping the device's viewport/UA/touch bits.
      use: { ...devices["iPhone 13"], browserName: "chromium" },
      testMatch: /mobile\.spec\.ts$/,
    },
  ],
  webServer: {
    command: "node ../bridge/dist/main.js",
    url: "http://127.0.0.1:5173/api/hosts",
    reuseExistingServer: true,
    timeout: 15_000,
  },
});
