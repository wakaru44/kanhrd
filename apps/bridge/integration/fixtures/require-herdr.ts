import { herdrAvailable } from "./herdr-cli.js";

/**
 * Shared skip-gracefully guard for every integration test file. Mirrors the
 * pattern `apps/web/e2e` uses (`herdrAvailable()` + `test.skip`) so a
 * machine without a live local herdr server (no `~/.config/herdr/herdr.sock`,
 * or zero panes open) gets one clear skip message per file instead of a wall
 * of connection-refused failures.
 *
 * Usage:
 * ```ts
 * let skipReason: string | undefined;
 * beforeAll(async () => {
 *   skipReason = await requireHerdrOrSkipReason();
 * });
 * it("...", async (ctx) => {
 *   if (skipReason) return ctx.skip();
 *   ...
 * });
 * ```
 * vitest doesn't support an async top-level skip condition, so every test
 * body checks the resolved reason itself and calls `ctx.skip()`.
 */
export async function requireHerdrOrSkipReason(): Promise<string | undefined> {
  const result = await herdrAvailable();
  return result.ok ? undefined : result.reason;
}
