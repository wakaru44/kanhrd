import { test, expect } from '@playwright/test';
import type { GetHostsResponse } from '@kanhrd/schema';
import {
  buildHostSummaries,
  buildPopulatedSmall,
  panesForHost,
} from './fixtures/six-hundred-panes';

/**
 * The pane detail view must not strobe.
 *
 * `pane.output` is a full snapshot, and any pane running a full-screen TUI —
 * every coding agent herdr shepherds — sends a snapshot that is *not* a
 * continuation of the last one, so `PaneTerminal.paint()` takes its redraw
 * path on every single frame. The bridge polls at
 * `OUTPUT_POLL_INTERVAL_MS` (150ms), so that path runs ~6.5 times a second.
 *
 * If the redraw clears the screen out-of-band (`Terminal.reset()`) instead of
 * inside the write, xterm blanks every rendered row synchronously while the
 * replacement content is still queued, and the browser composites a fully
 * blank frame in between — a whole-screen black-out at ~6.5Hz, inside the
 * 3-30Hz band WCAG 2.3.1 calls a seizure risk. This is an accessibility
 * defect, not a cosmetic one, so it gets a test that looks at real frames.
 *
 * The instrument is a CDP screencast: the frames Chromium actually
 * composites, not the DOM (a DOM sampler runs before xterm's own rAF and
 * reports a blank either way). CPU throttling widens the window so the
 * regression is caught reliably rather than by luck. A blank terminal is a
 * large flat region, so it compresses far smaller than one full of text —
 * with the defect the captured sizes alternate ~20.8KB / ~14.3KB (-31%),
 * without it every frame sits within 1% of the maximum.
 */

const PANE = 'local-ws1-tab1-p1';
const POLL_MS = 150;
const SPINNER = ['|', '/', '-', '\\'];

/** One frame of an agent TUI: constant shape, a spinner cell that moves. Never a prefix of the last. */
function tuiFrame(n: number): string {
  const lines = ['agent session', 'reading files', 'thinking'];
  for (let i = 0; i < 12; i++) {
    lines.push(`  file ${i} ok`);
  }
  lines.push(`${SPINNER[n % SPINNER.length]} working (${n})`);
  return lines.join('\r\n') + '\r\n';
}

test('the terminal never composites a blank frame while a TUI pane redraws', async ({ page }) => {
  const panes = buildPopulatedSmall();
  await page.route('**/api/hosts', async (route) => {
    const body: GetHostsResponse = { hosts: buildHostSummaries() };
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });
  });

  let framesSent = 0;
  await page.routeWebSocket(/\/ws$/, (ws) => {
    let timer: ReturnType<typeof setInterval> | null = null;
    let n = 0;
    const reply = (id: string, host: string, data: unknown): void => {
      ws.send(JSON.stringify({ id, host, ok: true, data }));
    };
    ws.onMessage((raw) => {
      const text = typeof raw === 'string' ? raw : raw.toString();
      let msg: { id?: string; host?: string; method?: string } | null = null;
      try {
        msg = JSON.parse(text) as { id?: string; host?: string; method?: string };
      } catch {
        return;
      }
      if (!msg?.id || !msg.host || !msg.method) return;
      const { id, host, method } = msg;
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
            outputPollIntervalMs: POLL_MS,
            paneCreate: true,
            paneClose: true,
            paneMove: true,
            paneRename: true,
            tabCrud: true,
            workspaceCrud: true,
          });
        case 'pane.read':
          return reply(id, host, { content: tuiFrame(n), revision: 1 });
        case 'pane.subscribe_output': {
          const subscriptionId = `${host}-out`;
          reply(id, host, { subscription_id: subscriptionId });
          if (timer) clearInterval(timer);
          timer = setInterval(() => {
            n++;
            framesSent++;
            ws.send(
              JSON.stringify({
                event: 'pane.output',
                host,
                payload: {
                  subscription_id: subscriptionId,
                  pane_id: PANE,
                  content: tuiFrame(n),
                  revision: 1 + n,
                },
              })
            );
          }, POLL_MS);
          return;
        }
        case 'pane.unsubscribe_output':
          if (timer) {
            clearInterval(timer);
            timer = null;
          }
          return reply(id, host, {});
        default:
          ws.send(
            JSON.stringify({
              id,
              host,
              ok: false,
              error: { code: 'unsupported_operation', message: method },
            })
          );
      }
    });
  });

  await page.goto(`/pane/local/${PANE}`);
  await page.waitForSelector('.xterm-rows');

  const cdp = await page.context().newCDPSession(page);
  const sizes: number[] = [];
  cdp.on('Page.screencastFrame', (frame) => {
    sizes.push(Buffer.from(frame.data, 'base64').length);
    void cdp.send('Page.screencastFrameAck', { sessionId: frame.sessionId }).catch(() => undefined);
  });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 20 });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 40, everyNthFrame: 1 });
  await page.waitForTimeout(4000);
  await cdp.send('Page.stopScreencast');
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });

  // Enough of a stream to have caught the strobe several times over.
  expect(framesSent).toBeGreaterThanOrEqual(10);
  expect(sizes.length).toBeGreaterThanOrEqual(10);

  // Half-way between "every frame carries the terminal's text" (>=0.99 of the
  // maximum in practice) and "the terminal blanked" (0.68). Any frame below
  // this lost the terminal's content.
  const largest = Math.max(...sizes);
  const floor = largest * 0.85;
  const blank = sizes.filter((bytes) => bytes < floor);
  expect(
    blank.length,
    `${blank.length}/${sizes.length} composited frames lost the terminal's content ` +
      `(sizes: ${sizes.join(',')})`
  ).toBe(0);
});
