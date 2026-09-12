/**
 * LIVE-ONLY — this file needs a real herdr session and skips without one.
 *
 * Whether a buffer is truncated is herdr's answer, not something a mock can
 * stand in for: the point is that kanhrd asks for a depth, herdr cuts the
 * snapshot at it and says so, and the terminal tells the reader. The panes
 * it drives are the run's own (`kanhrd-test-e2e`, seeded by
 * `fixtures/isolated-bridge.mjs`), never the operator's.
 *
 * See openspec/changes/add-terminal-scrollback-depth.
 */
import type { Page } from '@playwright/test';
import { test, expect } from './fixtures/kanhrd';
import { herdrAvailable, herdrPaneRead, herdrPaneSendText, seededWorld } from './fixtures/herdr';
import { terminalContainer, xtermElement, xtermRows } from './helpers/selectors';
import { waitFor } from './helpers/wait';

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

/** Home, clear, and drop the pane's scrollback, so its history is only what the test prints next. */
const WIPE = "clear && printf '\\033[3J' && ";

/** Opens the card for `paneId` by its link — SPA-internal navigation, as a reader takes it. */
async function openPane(app: Page, paneId: string): Promise<void> {
  const link = app.locator(
    `a.card-open[href$="/${paneId}"], a.card-open[href$="/${encodeURIComponent(paneId)}"]`
  );
  await expect(link.first()).toBeVisible({ timeout: 10_000 });
  await link.first().click();
  await expect(xtermElement(app)).toBeVisible({ timeout: 3_000 });
}

/** Wheels the terminal until the screen stops changing — the top of its buffer — and returns what is there. */
async function topOfBuffer(app: Page): Promise<string> {
  const box = await terminalContainer(app).boundingBox();
  if (!box) throw new Error('terminal container has no box');
  await app.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  let previous = '';
  for (let settled = 0; settled < 3;) {
    await app.mouse.wheel(0, -2000);
    await app.waitForTimeout(100);
    const current = (await xtermRows(app).textContent()) ?? '';
    settled = current === previous ? settled + 1 : 0;
    previous = current;
  }
  return previous;
}

test('a pane with more history than the depth says herdr cut it, at the head of the buffer', async ({
  app,
}) => {
  const [paneId] = seededWorld().paneIds;
  await herdrPaneSendText(paneId, `${WIPE}seq -f 'depth-%04g' 1 1500\r`);
  await waitFor(async () => (await herdrPaneRead(paneId)).includes('depth-1500'), {
    timeoutMs: 5_000,
    message: 'the seeded output never reached the pane',
  });

  await openPane(app, paneId);
  await waitFor(async () => ((await xtermRows(app).textContent()) ?? '').includes('depth-1500'), {
    timeoutMs: 5_000,
    message: 'the terminal never painted the tail of the output',
  });

  const top = await topOfBuffer(app);
  // The default depth is herdr's ceiling, so no raise hint: no setting brings more back.
  expect(top).toContain('herdr sent the last 1000 lines. history above this line was not sent.');
  expect(top).not.toContain('raise scrollback in settings.');
  expect(top).not.toContain('depth-0001');
  await expect(app.locator('.toast')).toHaveCount(0);
});

test('a pane whose whole history fits says nothing about truncation', async ({ app }) => {
  const paneId = seededWorld().paneIds[1] ?? seededWorld().paneIds[0];
  await herdrPaneSendText(paneId, `${WIPE}seq -f 'short-%04g' 1 20\r`);
  await waitFor(async () => (await herdrPaneRead(paneId)).includes('short-0020'), {
    timeoutMs: 5_000,
    message: 'the seeded output never reached the pane',
  });

  await openPane(app, paneId);
  await waitFor(async () => ((await xtermRows(app).textContent()) ?? '').includes('short-0020'), {
    timeoutMs: 5_000,
    message: 'the terminal never painted the output',
  });

  const top = await topOfBuffer(app);
  expect(top).toContain('short-0001');
  expect(top).not.toContain('herdr sent the last');
});
