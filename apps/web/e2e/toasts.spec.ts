import { test, expect } from '@playwright/test';
import { herdrAvailable } from './fixtures/herdr';
import { COPY } from '../src/app/shared/copy';

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

test('a failing pane.close request surfaces an error toast', async ({ page }) => {
  await page.routeWebSocket(/\/ws$/, (ws) => {
    const server = ws.connectToServer();
    ws.onMessage((message) => {
      const text = typeof message === 'string' ? message : message.toString();
      let parsed: { id?: string; method?: string } | null = null;
      try {
        parsed = JSON.parse(text);
      } catch {
        // not JSON — forward as-is
      }
      if (parsed?.method === 'pane.close') {
        ws.send(
          JSON.stringify({
            id: parsed.id,
            ok: false,
            error: { code: 'forced_e2e_failure', message: 'forced failure for L-UX2 toast test' },
          })
        );
        return; // do not forward to the real bridge
      }
      server.send(text);
    });
    server.onMessage((message) => ws.send(message));
  });

  await page.goto('/');
  await expect(page.locator('.state.loading')).toHaveCount(0, { timeout: 10_000 });

  // Capabilities arrive over the socket after the first cards render, so
  // wait for the action cluster rather than snapshotting `.count()` the
  // instant the board paints (that raced into a false skip).
  const closeButton = page.locator('.card-action.close').first();
  const advertised = await closeButton
    .waitFor({ state: 'visible', timeout: 5_000 })
    .then(() => true)
    .catch(() => false);
  test.skip(
    !advertised,
    'no host advertises paneClose capability — nothing to click to trigger the failure'
  );

  // No hover: card actions are visible on first render (the
  // `.card-actions { opacity: 0; pointer-events: none }` hover-reveal is
  // gone — docs/UX-GUIDELINES.md, "Visible affordances").
  await expect(closeButton).toBeVisible();
  await closeButton.click();
  // A pane close is accent-filled, not `--danger-fill` (that is reserved
  // for irrecoverable local-data loss), so the confirm is `.btn.primary`.
  await page.locator('app-confirm-modal .modal-actions .btn.primary').click();

  const toast = page.locator('.toast.error');
  await expect(toast).toBeVisible({ timeout: 5_000 });
  // Read the expected copy from the single source, never a literal.
  await expect(toast).toContainText(COPY.toast.closeFailed.split('{')[0]!.trim());
});
