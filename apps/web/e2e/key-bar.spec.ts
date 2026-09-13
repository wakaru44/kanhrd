/**
 * MOCKED — no herdr. The pane-detail key bar at the 390 × 844 reference
 * width, against a `page.routeWebSocket` bridge that records every request,
 * so geometry, focus and what goes on the wire are asserted everywhere.
 *
 * What this cannot do: raise a real soft keyboard. The visualViewport
 * placement is unit-tested with numbers (`key-bar.spec.ts`) and verified on a
 * device; see openspec/changes/add-terminal-key-bar/tasks.md 6.4.
 */
import { test, expect, type Page } from '@playwright/test';
import type { GetHostsResponse } from '@kanhrd/schema';
import {
  buildHostSummaries,
  buildPopulatedSmall,
  panesForHost,
} from './fixtures/six-hundred-panes';

const PANE = 'local-ws1-tab1-p1';

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

interface Sent {
  method: string;
  params: Record<string, unknown>;
}

async function mockBridge(page: Page): Promise<Sent[]> {
  const panes = buildPopulatedSmall();
  const sent: Sent[] = [];
  await page.route('**/api/hosts', async (route) => {
    const body: GetHostsResponse = { hosts: buildHostSummaries() };
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });
  });
  await page.routeWebSocket(/\/ws$/, (ws) => {
    const reply = (id: string, host: string, data: unknown): void =>
      ws.send(JSON.stringify({ id, host, ok: true, data }));
    ws.onMessage((raw) => {
      const msg = JSON.parse(typeof raw === 'string' ? raw : raw.toString()) as {
        id?: string;
        host?: string;
        method?: string;
        params?: Record<string, unknown>;
      };
      if (!msg.id || !msg.host || !msg.method) return;
      const { id, host, method } = msg;
      sent.push({ method, params: msg.params ?? {} });
      switch (method) {
        case 'pane.list':
          return reply(id, host, { panes: panesForHost(panes, host) });
        case 'events.subscribe':
          return reply(id, host, { subscription_id: `${host}-sub` });
        case 'bridge.capabilities':
          return reply(id, host, {
            tier: 3,
            terminal: true,
            paneResize: false,
            paneGraphics: false,
            outputPollIntervalMs: 150,
            paneCreate: true,
            paneClose: true,
            paneMove: true,
            paneRename: true,
            tabCrud: true,
            workspaceCrud: true,
          });
        case 'pane.read':
          return reply(id, host, {
            content: Array.from({ length: 60 }, (_, i) => `row ${i}`).join('\r\n'),
            revision: 1,
            truncated: false,
            format: 'ansi',
            source: 'recent',
          });
        case 'pane.subscribe_output':
          return reply(id, host, { subscription_id: `${host}-out` });
        default:
          return reply(id, host, {});
      }
    });
  });
  return sent;
}

async function openPane(page: Page): Promise<void> {
  // Start expanded: the first-visit guess depends on the device, the test must not.
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('kanhrd-e2e-keybar-seeded')) {
      localStorage.setItem('kanhrd.terminal-key-bar', 'expanded');
      sessionStorage.setItem('kanhrd-e2e-keybar-seeded', '1');
    }
  });
  await page.goto(`/pane/local/${PANE}`);
  await page.waitForSelector('.xterm-rows');
  await expect(page.locator('app-key-bar .key').first()).toBeVisible();
}

const sentKeys = (sent: Sent[]) =>
  sent.filter((s) => s.method === 'pane.send_keys').map((s) => s.params['keys']);

test('every key and the strip are touch targets, and only the row scrolls sideways', async ({
  page,
}) => {
  await mockBridge(page);
  await openPane(page);

  for (const key of await page.locator('app-key-bar .key').all()) {
    const box = (await key.boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(40);
    expect(box.height).toBeGreaterThanOrEqual(40);
  }

  // The strip draws short but its hit area reaches 40px: a tap well above its
  // visible box still toggles it.
  const strip = page.locator('app-key-bar .strip');
  const stripBox = (await strip.boundingBox())!;
  expect(stripBox.height).toBeLessThan(40);
  await page.touchscreen.tap(stripBox.x + stripBox.width / 2, stripBox.y + stripBox.height - 36);
  await expect(strip).toHaveAttribute('aria-expanded', 'false');

  // Collapsed, the strip has moved down to the bottom edge: measure again.
  const collapsed = (await strip.boundingBox())!;
  await page.touchscreen.tap(collapsed.x + collapsed.width / 2, collapsed.y + collapsed.height / 2);
  await expect(strip).toHaveAttribute('aria-expanded', 'true');

  const widths = await page.evaluate(() => ({
    doc: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    row: (() => {
      const row = document.querySelector('app-key-bar .row')!;
      return row.scrollWidth - row.clientWidth;
    })(),
  }));
  expect(widths.doc).toBeLessThanOrEqual(1);
  // Nine keys do not fit at 390px; the row scrolls inside itself.
  expect(widths.row).toBeGreaterThan(0);
});

test('the terminal ends above the bar, expanded and collapsed', async ({ page }) => {
  await mockBridge(page);
  await openPane(page);
  const strip = page.locator('app-key-bar .strip');

  for (const expanded of ['true', 'false']) {
    if ((await strip.getAttribute('aria-expanded')) !== expanded) {
      await strip.click();
      await expect(strip).toHaveAttribute('aria-expanded', expanded);
    }
    await expect
      .poll(async () => {
        const terminal = (await page.locator('.terminal-container').boundingBox())!;
        const bar = (await page.locator('app-key-bar').boundingBox())!;
        return terminal.y + terminal.height <= bar.y + 1;
      })
      .toBe(true);
  }
});

test('a tapped key goes to the pane and the terminal keeps focus', async ({ page }) => {
  const sent = await mockBridge(page);
  await openPane(page);
  await page.locator('.xterm-helper-textarea').focus();

  const esc = (await page.locator('app-key-bar [data-cell="esc"]').boundingBox())!;
  await page.touchscreen.tap(esc.x + esc.width / 2, esc.y + esc.height / 2);

  await expect.poll(() => sentKeys(sent)).toEqual([['esc']]);
  expect(
    await page.evaluate(() => document.activeElement?.classList.contains('xterm-helper-textarea'))
  ).toBe(true);
});

test('an armed ctrl modifies the next typed key, then shows idle again', async ({ page }) => {
  const sent = await mockBridge(page);
  await openPane(page);
  await page.locator('.xterm-helper-textarea').focus();

  const ctrl = page.locator('app-key-bar [data-cell="ctrl"]');
  const box = (await ctrl.boundingBox())!;
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
  await expect(ctrl).toHaveAttribute('data-state', 'armed');

  await page.keyboard.type('c');
  await expect.poll(() => sentKeys(sent)).toEqual([['ctrl+c']]);
  await expect(ctrl).toHaveAttribute('data-state', 'idle');
});

test('^B sends a literal ctrl+b, whatever the resolved prefix', async ({ page }) => {
  const sent = await mockBridge(page);
  await page.addInitScript(() =>
    localStorage.setItem('kanhrd.keyboard', JSON.stringify({ prefix: 'Ctrl+Space' }))
  );
  await openPane(page);

  const cell = page.locator('app-key-bar [data-cell="ctrl-b"]');
  await expect(cell).toHaveText('^B');
  const box = (await cell.boundingBox())!;
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
  await expect.poll(() => sentKeys(sent)).toEqual([['ctrl+b']]);
});

test('the expanded or collapsed choice survives a reload', async ({ page }) => {
  await mockBridge(page);
  await openPane(page);
  const strip = page.locator('app-key-bar .strip');
  await strip.click();
  await expect(strip).toHaveAttribute('aria-expanded', 'false');

  await page.reload();
  await page.waitForSelector('.xterm-rows');
  await expect(page.locator('app-key-bar .strip')).toHaveAttribute('aria-expanded', 'false');
  expect(await page.evaluate(() => localStorage.getItem('kanhrd.terminal-key-bar'))).toBe(
    'collapsed'
  );
});

// TEMPORARY (task 6.4): the device-measurement probes, while they exist.
test('the measurement readout and autocomplete switch appear only when the URL asks', async ({
  page,
}) => {
  await mockBridge(page);
  await openPane(page);
  await expect(page.locator('app-key-bar .probe')).toHaveCount(0);
  await expect(page.locator('.xterm-helper-textarea')).toHaveAttribute('autocomplete', 'off');

  await page.goto(`/pane/local/${PANE}?keybar-debug=1&keybar-autocomplete=absent`);
  await page.waitForSelector('.xterm-rows');
  const probe = page.locator('app-key-bar .probe');
  await expect(probe).toContainText('vv.height');
  await expect(probe).toContainText('autocomplete (absent)');
  const box = (await probe.boundingBox())!;
  expect(box.y).toBeLessThanOrEqual(1);
  expect(await page.locator('.xterm-helper-textarea').getAttribute('autocomplete')).toBeNull();
});
