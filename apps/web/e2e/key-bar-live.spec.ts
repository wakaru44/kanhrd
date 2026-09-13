/**
 * LIVE-ONLY — this file needs a real herdr session and skips without one.
 *
 * The key bar's keys must reach the program in the pane, not stop at the
 * wire: `cat -v` in the run's own throwaway pane (`kanhrd-test-e2e`) echoes
 * what arrives. The mocked `key-bar.spec.ts` covers geometry and requests.
 */
import type { Page } from '@playwright/test';
import { test, expect } from './fixtures/kanhrd';
import {
  herdrAvailable,
  herdrPaneRead,
  herdrPaneSendKeys,
  herdrPaneSendText,
  seededWorld,
} from './fixtures/herdr';
import { xtermElement } from './helpers/selectors';
import { waitFor } from './helpers/wait';

let preflightReason: string | undefined;

test.beforeAll(async () => {
  const result = await herdrAvailable();
  if (!result.ok) preflightReason = result.reason;
});

test.beforeEach(() => {
  test.skip(!!preflightReason, `herdr pre-flight failed: ${preflightReason}`);
});

/**
 * Starts `cat -v` in the pane and returns once it is really echoing. The
 * seeded shell may still be starting when this file runs early in a suite,
 * and a command typed into a half-started shell is lost, so this retries
 * until a marker comes back twice: once from the tty's echo, once from cat.
 */
async function catReady(paneId: string): Promise<void> {
  const marker = 'kb-ready';
  await waitFor(
    async () => {
      await herdrPaneSendKeys(paneId, ['ctrl+c']);
      await herdrPaneSendKeys(paneId, ['ctrl+u']);
      await herdrPaneSendText(paneId, 'clear && cat -v\r');
      await new Promise((resolve) => setTimeout(resolve, 700));
      await herdrPaneSendText(paneId, `${marker}\r`);
      await new Promise((resolve) => setTimeout(resolve, 500));
      return (await herdrPaneRead(paneId)).split(marker).length - 1 >= 2;
    },
    { timeoutMs: 20_000, intervalMs: 200, message: 'cat -v never started in the seeded pane' }
  );
}

async function openPane(app: Page, paneId: string): Promise<void> {
  await app.evaluate(() => localStorage.setItem('kanhrd.terminal-key-bar', 'expanded'));
  await app.reload();
  const link = app.locator(
    `a.card-open[href$="/${paneId}"], a.card-open[href$="/${encodeURIComponent(paneId)}"]`
  );
  await expect(link.first()).toBeVisible({ timeout: 10_000 });
  await link.first().click();
  await expect(xtermElement(app)).toBeVisible({ timeout: 3_000 });
  await expect(app.locator('app-key-bar .key').first()).toBeVisible();
}

test('esc, an arrow and ctrl-modified keys from the bar reach the program in the pane', async ({
  app,
}) => {
  const [paneId] = seededWorld().paneIds;
  await catReady(paneId);
  await openPane(app, paneId);

  await app.locator('app-key-bar [data-cell="esc"]').click();
  await app.locator('app-key-bar [data-cell="up"]').click();
  await app.locator('app-key-bar [data-cell="ctrl"]').click();
  await app.locator('app-key-bar [data-cell="left"]').click();
  // No Enter: the tty echoes each key as it arrives, which is proof enough. An
  // Enter sent through the herdr CLI would also overtake the bar's keys, which
  // travel through the bridge's queue. The echo renders ESC as ^[ : esc, then
  // ESC [ A, then ctrl+left as ESC [ 1 ; 5 D.
  await waitFor(async () => (await herdrPaneRead(paneId)).includes('^[^[[A^[[1;5D'), {
    timeoutMs: 5_000,
    message: 'the bar keys never arrived at the pane as esc, up and ctrl+left',
  });
  await expect(app.locator('app-key-bar [data-cell="ctrl"]')).toHaveAttribute('data-state', 'idle');
  await herdrPaneSendKeys(paneId, ['ctrl+c']);
});
