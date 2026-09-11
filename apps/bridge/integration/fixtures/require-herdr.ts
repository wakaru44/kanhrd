import { herdrAvailable } from './herdr-cli.js';

/**
 * Shared skip-gracefully guard for every integration test file.
 *
 * What it checks changed with `add-test-herdr-isolation`: the precondition
 * is no longer "the operator has a herdr running with panes open", it is
 * "this run has its own throwaway herdr session" (started and seeded by
 * `fixtures/global-setup.ts`). A machine with no herdr installed gets one
 * clear skip message per file; a machine with herdr gets a session of its
 * own and never touches the operator's.
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
