import type { Locator } from "@playwright/test";

/**
 * Small polling helper for assertions that need to reach outside
 * Playwright's own auto-waiting locators — e.g. polling the `herdr` CLI
 * for a pane's real content after driving input through the browser.
 */
export async function waitFor(
  check: () => Promise<boolean> | boolean,
  options: { timeoutMs?: number; intervalMs?: number; message?: string } = {},
): Promise<void> {
  const timeoutMs = options.timeoutMs ?? 5000;
  const intervalMs = options.intervalMs ?? 150;
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (await check()) {
      return;
    }
    if (Date.now() >= deadline) {
      throw new Error(options.message ?? `waitFor: condition not met within ${timeoutMs}ms`);
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

/**
 * Polls `locator.count()` until two consecutive reads agree, then returns
 * that count. Real herdr state is live (panes can be created/closed by the
 * user at any moment), so a single `.count()` snapshot can go stale between
 * being taken and being asserted against later in a test. This doesn't make
 * a test race-proof against churn happening mid-assertion, but it avoids
 * snapshotting mid-burst in the common case.
 */
export async function waitForStableCount(
  locator: Locator,
  options: { timeoutMs?: number; intervalMs?: number } = {},
): Promise<number> {
  const intervalMs = options.intervalMs ?? 200;
  let previous = await locator.count();
  let stable = 0;
  await waitFor(
    async () => {
      const current = await locator.count();
      if (current === previous) {
        stable++;
      } else {
        stable = 0;
        previous = current;
      }
      return stable >= 1;
    },
    { timeoutMs: options.timeoutMs ?? 5000, intervalMs, message: "pane count never stabilized" },
  );
  return previous;
}
