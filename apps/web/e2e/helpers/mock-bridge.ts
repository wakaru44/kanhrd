import type { Page } from '@playwright/test';
import type { GetHostsResponse, Pane } from '@kanhrd/schema';
import {
  buildHostSummaries,
  buildPopulatedSmall,
  buildSixHundredPanes,
  panesForHost,
  HOSTS,
} from '../fixtures/six-hundred-panes';

/**
 * The six board states the mocked bridge can serve. Shared by the
 * viewport/state matrix (`viewport-matrix.spec.ts`) and the documentation
 * capture run (`capture.spec.ts`) so both boot the app from one definition
 * of "what a populated board is".
 */
export type StateName =
  'empty' | 'populated-small' | 'populated-600' | 'scoped' | 'error' | 'offline';

export interface MockOptions {
  state: StateName;
  /**
   * Serve a tier-3 `bridge.capabilities` payload plus terminal reads, so the
   * pane-detail route renders a live-looking terminal. Off by default: the
   * viewport/state matrix deliberately exercises the tier-1 fallback path.
   */
  tier3?: boolean;
  /** ANSI text `pane.read` replies with when `tier3` is on. */
  terminalContent?: string;
}

/**
 * Installs a fully mocked bridge — HTTP for `/api/hosts`, WS for `/ws`. Every
 * state cell reuses this so the app boots identically apart from the payload
 * differences the state defines.
 */
export async function installMock(page: Page, opts: MockOptions): Promise<void> {
  const state = opts.state;

  // --- HTTP: /api/hosts ---------------------------------------------------
  await page.route('**/api/hosts', async (route) => {
    if (state === 'error') {
      await route.fulfill({ status: 500, contentType: 'text/plain', body: 'forced e2e error' });
      return;
    }
    if (state === 'offline') {
      await route.fulfill({ status: 503, contentType: 'text/plain', body: 'forced e2e offline' });
      return;
    }
    // `empty` cell: zero hosts → the empty-state onboarding renders (the
    // board's `noHostsConfigured` branch). Every other populated/scoped
    // cell advertises the full 3-host fixture so pane.list has hosts to
    // reply for.
    const hosts = state === 'empty' ? [] : buildHostSummaries();
    const body: GetHostsResponse = { hosts };
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });
  });

  // --- WS: /ws ------------------------------------------------------------
  // Pre-compute the pane set the WS will reply with. `empty`/`error` yield an
  // empty pane.list; `populated-small` yields 6; `populated-600`/`scoped`
  // yield the full 600.
  const allPanes: Pane[] =
    state === 'populated-small'
      ? buildPopulatedSmall()
      : state === 'populated-600' || state === 'scoped'
        ? buildSixHundredPanes()
        : [];

  await page.routeWebSocket(/\/ws$/, (ws) => {
    if (state === 'offline') {
      // Close before the app can send anything. The reconnect backoff kicks
      // in but never lands during the test window.
      ws.close({ code: 1011, reason: 'forced e2e offline' });
      return;
    }
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
      if (method === 'pane.list') {
        ws.send(
          JSON.stringify({ id, host, ok: true, data: { panes: panesForHost(allPanes, host) } })
        );
        return;
      }
      if (method === 'events.subscribe') {
        ws.send(JSON.stringify({ id, host, ok: true, data: { subscription_id: `${host}-sub` } }));
        return;
      }
      if (method === 'bridge.capabilities') {
        if (!opts.tier3) {
          // Tier-1 fallback — mirrors `fallbackCapabilities()` in panes.store.ts.
          ws.send(
            JSON.stringify({
              id,
              host,
              ok: false,
              error: { code: 'unsupported', message: 'tier-1 bridge in mock' },
            })
          );
          return;
        }
        ws.send(
          JSON.stringify({
            id,
            host,
            ok: true,
            data: {
              tier: 3,
              terminal: true,
              // Always false on herdr — there is no public PTY resize API.
              paneResize: false,
              paneGraphics: false,
              outputPollIntervalMs: 1000,
              paneCreate: true,
              paneClose: true,
              paneMove: true,
              paneRename: true,
              tabCrud: true,
              workspaceCrud: true,
            },
          })
        );
        return;
      }

      if (opts.tier3 && method === 'pane.read') {
        ws.send(
          JSON.stringify({
            id,
            host,
            ok: true,
            data: { content: opts.terminalContent ?? '', revision: 1 },
          })
        );
        return;
      }

      if (opts.tier3 && method === 'pane.subscribe_output') {
        // Confirm the subscription and then send nothing. A live stream would
        // repaint the terminal mid-capture and break byte-reproducibility.
        ws.send(JSON.stringify({ id, host, ok: true, data: { subscription_id: `${host}-out` } }));
        return;
      }
      // Any tier-2/3 method (e.g. pane.close): reply with a clean error.
      ws.send(
        JSON.stringify({
          id,
          host,
          ok: false,
          error: { code: 'unsupported_operation', message: `mock does not implement ${method}` },
        })
      );
    });
  });
}

/** URL a state should navigate to. `scoped` boots straight into a workspace URL. */
export function urlForState(state: StateName): string {
  if (state === 'scoped') {
    // First workspace of the first host — see the fixture id shape.
    return `/workspace/${HOSTS[0]}-ws1`;
  }
  return '/';
}
