import { defineConfig } from "vitest/config";

/**
 * Default unit-test config: fast, hermetic, no real herdr/network involved
 * (fake sockets, in-memory fixtures). Excludes `integration/**`, which has
 * its own config (`vitest.integration.config.ts`) and its own `test:int`
 * script, since it spawns the real bridge and needs a live local herdr
 * server.
 */
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    exclude: ["integration/**", "node_modules/**", "dist/**"],
  },
});
