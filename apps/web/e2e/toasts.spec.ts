import { test, expect } from "@playwright/test";
import { herdrAvailable } from "./fixtures/herdr";

/**
 * Feedback layer (L-UX2): toasts on a failing bridge method response. Uses
 * `page.routeWebSocket` to intercept the real `/ws` connection and force an
 * error reply for exactly one method (`pane.close`) while transparently
 * proxying every other frame to the real bridge/herdr — this is the "mock
 * the ws-client to error" the brief asks for, without needing to fake the
 * whole board state (every other panel/card renders off real herdr data).
 */

let preflightReason: string | undefined;

test.beforeAll(async () => {
  const result = await herdrAvailable();
  if (!result.ok) {
    preflightReason = result.reason;
  }
});

test.beforeEach(() => {
  test.skip(!!preflightReason, `herdr pre-flight failed: ${preflightReason}`);
});

test("a failing pane.close request surfaces an error toast", async ({ page }) => {
  await page.routeWebSocket(/\/ws$/, (ws) => {
    const server = ws.connectToServer();
    ws.onMessage((message) => {
      const text = typeof message === "string" ? message : message.toString();
      let parsed: { id?: string; method?: string } | null = null;
      try {
        parsed = JSON.parse(text);
      } catch {
        // not JSON — forward as-is
      }
      if (parsed?.method === "pane.close") {
        ws.send(
          JSON.stringify({
            id: parsed.id,
            ok: false,
            error: { code: "forced_e2e_failure", message: "forced failure for L-UX2 toast test" },
          }),
        );
        return; // do not forward to the real bridge
      }
      server.send(text);
    });
    server.onMessage((message) => ws.send(message));
  });

  await page.goto("/");
  await expect(page.locator(".state.loading")).toHaveCount(0, { timeout: 10_000 });

  const closeButton = page.locator(".card-action.close").first();
  test.skip(
    (await closeButton.count()) === 0,
    "no host advertises paneClose capability — nothing to click to trigger the failure",
  );

  // The close button only becomes hit-testable on `.card:hover` (card.scss:
  // `.card-actions { opacity: 0; pointer-events: none }` until hovered) —
  // hover the card first, mirroring apps/web/e2e/tier3.spec.ts's pattern.
  await closeButton.locator("xpath=ancestor::*[contains(@class, 'card')][1]").hover();
  await closeButton.click();
  await page.locator("app-confirm-modal .modal-actions .btn.danger").click();

  const toast = page.locator(".toast.error");
  await expect(toast).toBeVisible({ timeout: 5_000 });
  await expect(toast).toContainText("Could not close");
});
