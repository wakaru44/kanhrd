/**
 * LIVE-ONLY — this file needs a real herdr session and skips without one.
 *
 * A pane whose session ends while it is open in the detail view must say
 * so: `exit` in a real shell, then the gone state within one `pane.list`
 * poll, the live stream unsubscribed and typing kept off the wire. The pane
 * is this test's own, split from the run's seeded root pane in the
 * throwaway `kanhrd-test-e2e` session, so the seeded panes other specs rely
 * on are never ended.
 */
import type { Page, WebSocket } from '@playwright/test';
import { test, expect } from './fixtures/kanhrd';
import { herdr, herdrAvailable, herdrPaneList, herdrPaneRead, seededWorld } from './fixtures/herdr';
import { terminalContainer, xtermElement } from './helpers/selectors';
import { waitFor } from './helpers/wait';

let preflightReason: string | undefined;

test.beforeAll(async () => {
  const result = await herdrAvailable();
  if (!result.ok) preflightReason = result.reason;
});

test.beforeEach(() => {
  test.skip(!!preflightReason, `herdr pre-flight failed: ${preflightReason}`);
});

/** Splits a fresh shell pane off the seeded root pane and returns its id. */
async function splitThrowawayPane(): Promise<string> {
  const root = seededWorld().paneIds[0];
  const { stdout, code, stderr } = await herdr([
    'pane',
    'split',
    root,
    '--direction',
    'down',
    '--no-focus',
  ]);
  expect(code, `pane split failed: ${stderr}`).toBe(0);
  const id = (JSON.parse(stdout) as { result?: { pane?: { pane_id?: string } } }).result?.pane
    ?.pane_id;
  if (!id) throw new Error(`unexpected pane.split reply: ${stdout}`);
  return id;
}

/** Every text frame the page sends on any socket, from the moment this is called. */
function recordSentFrames(page: Page): string[] {
  const frames: string[] = [];
  page.on('websocket', (socket: WebSocket) => {
    socket.on('framesent', ({ payload }) => {
      if (typeof payload === 'string') frames.push(payload);
    });
  });
  return frames;
}

test('a pane whose shell exits while open is reported gone, unwatched and unwritable', async ({
  app,
}) => {
  const paneId = await splitThrowawayPane();
  try {
    // The shell must be up before `exit`, or the keystrokes land nowhere.
    await waitFor(async () => (await herdrPaneRead(paneId)).trim().length > 0, {
      timeoutMs: 10_000,
      message: 'the throwaway shell never drew a prompt',
    });

    const sent = recordSentFrames(app);
    await app.reload();
    const link = app.locator(
      `a.card-open[href$="/${paneId}"], a.card-open[href$="/${encodeURIComponent(paneId)}"]`
    );
    await expect(link.first()).toBeVisible({ timeout: 10_000 });
    await link.first().click();
    await expect(xtermElement(app)).toBeVisible({ timeout: 5_000 });
    await expect(app.locator('.terminal-loading')).toHaveCount(0, { timeout: 5_000 });

    await terminalContainer(app).click();
    await app.keyboard.type('exit\r');

    const gone = app.locator('.terminal-gone');
    // One agent-status `pane.list` poll is 5s; herdr's own push is usually sooner.
    await expect(gone).toBeVisible({ timeout: 12_000 });
    await expect(gone).toContainText('the session ended. this is the last thing it said.');
    await expect(gone.locator('a.state-back')).toBeVisible();
    await expect(app.locator('button.retry')).toHaveCount(0);
    await expect(terminalContainer(app)).toHaveClass(/\binert\b/);
    await expect(xtermElement(app)).toBeVisible();

    await waitFor(async () => sent.some((frame) => frame.includes('pane.unsubscribe_output')), {
      timeoutMs: 3_000,
      message: 'entering gone never sent pane.unsubscribe_output',
    });

    const before = sent.length;
    // The state box sits over the middle of the frame; focus the terminal beside it.
    await terminalContainer(app).click({ position: { x: 8, y: 8 } });
    await app.keyboard.type('echo nobody-home\r');
    await app.waitForTimeout(500);
    const typed = sent
      .slice(before)
      .filter((frame) => frame.includes('pane.send_text') || frame.includes('pane.send_keys'));
    expect(typed).toEqual([]);
  } finally {
    if ((await herdrPaneList()).some((pane) => pane.pane_id === paneId)) {
      await herdr(['pane', 'close', paneId]);
    }
  }
});
