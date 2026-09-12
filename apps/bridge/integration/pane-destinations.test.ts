import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startBridge, waitForHostConnected, type RunningBridge } from './fixtures/bridge.js';
import { IntegrationClient } from './fixtures/ws-client.js';
import {
  herdrPaneClose,
  herdrPaneList,
  herdrTabClose,
  herdrTabList,
  seededWorld,
} from './fixtures/herdr-cli.js';
import { requireHerdrOrSkipReason } from './fixtures/require-herdr.js';

/**
 * F. Destinations — the live half of openspec `add-pane-destinations`
 * (task 5.2), against the run's own throwaway session.
 *
 * The SPA now states a destination on every creation instead of letting
 * herdr resolve one from whatever it has focused, and `PanesStore.movePane`
 * reconciles a move's cascade from the response. Both rest on herdr
 * semantics that no unit test can prove, because the unit tests supply the
 * responses themselves:
 *
 *   - `pane.split` carrying `target_pane_id` lands in THAT pane's tab, not
 *     the focused one. The whole bug was that an omitted destination is not
 *     "no preference", it is "herdr's focus" — a place the operator is not
 *     looking at.
 *   - moving the last pane out of a tab really does close that tab, and
 *     herdr really does report it as `closed_tab_id` on the move's own
 *     response rather than only as a later event. That response field is
 *     what the store replays as a `pane.moved` frame; if herdr omitted it,
 *     the board would keep a tab row for a tab that no longer exists.
 *
 * No event assertions here on purpose. This suite's D/E files document at
 * length why event delivery on a live herdr can lag (backlog replay on a
 * fresh subscription), and the SPA path under test consumes the RESPONSE,
 * not the broadcast — `applyFrame` exists precisely so the acting client
 * never waits on one. The broadcast path has its own coverage in
 * `panes.store.spec.ts` and in E's phantom-storm check.
 *
 * Every tab this file creates is closed again in the same test, and each
 * test builds its own panes rather than consuming the seeded pair, so the
 * files that run after it see the world they were seeded with.
 */
describe('F. every creation and move names its destination', () => {
  let skipReason: string | undefined;
  let bridge: RunningBridge;
  let client: IntegrationClient;
  let workspaceId: string;
  let seededTabId: string;
  let rootPaneId: string;

  beforeAll(async () => {
    skipReason = await requireHerdrOrSkipReason();
    if (skipReason) return;
    bridge = await startBridge();
    await waitForHostConnected(bridge, 'local');
    client = await IntegrationClient.connect(bridge.wsUrl);
    const world = seededWorld();
    workspaceId = world.workspaceId;
    seededTabId = world.tabId;
    rootPaneId = world.paneIds[0];
  });

  afterAll(async () => {
    client?.close();
    await bridge?.stop();
  });

  /** A throwaway tab in the seeded workspace, plus the root pane herdr gives it. */
  async function createTab(label: string): Promise<{ tabId: string; paneId: string }> {
    const created = await client.call('local', 'tab.create', {
      workspace_id: workspaceId,
      label,
      focus: false,
    });
    return { tabId: created.tab.id, paneId: created.pane.id };
  }

  /** herdr's own view of which tab a pane sits in — never the bridge's. */
  async function tabOf(paneId: string): Promise<string | undefined> {
    return (await herdrPaneList()).find((p) => p.pane_id === paneId)?.tab_id;
  }

  it('F1. tab.create lands in the named workspace, and a split targeting a pane lands in THAT pane’s tab', async (ctx) => {
    if (skipReason) return ctx.skip();

    const { tabId, paneId } = await createTab(`kanhrd-dest-${Date.now()}`);
    try {
      // The destination the SPA now sends for a tab-scoped board.
      expect(
        (await herdrTabList()).some((t) => t.tab_id === tabId && t.workspace_id === workspaceId)
      ).toBe(true);

      const split = await client.call('local', 'pane.split', {
        workspace_id: workspaceId,
        target_pane_id: paneId,
        direction: 'right',
        focus: false,
      });

      expect(
        split.pane.tab.id,
        'a split naming a target pane must land in that pane’s tab, whatever herdr has focused'
      ).toBe(tabId);
      expect(await tabOf(split.pane.id)).toBe(tabId);
    } finally {
      await herdrTabClose(tabId);
    }
  }, 30_000);

  it('F2. pane.move reparents a pane into another tab, and herdr agrees it moved', async (ctx) => {
    if (skipReason) return ctx.skip();

    // A pane of this test's own, in the seeded tab, so nothing else's world
    // changes shape when it leaves.
    const extra = await client.call('local', 'pane.split', {
      workspace_id: workspaceId,
      target_pane_id: rootPaneId,
      direction: 'right',
      focus: false,
    });
    const { tabId } = await createTab(`kanhrd-move-${Date.now()}`);
    try {
      const moved = await client.call('local', 'pane.move', {
        pane_id: extra.pane.id,
        destination: { type: 'tab', tab_id: tabId, split: 'right' },
        focus: false,
      });

      expect(moved.changed, `herdr declined the move: ${moved.reason ?? 'no reason given'}`).toBe(
        true
      );
      expect(moved.pane.tab.id).toBe(tabId);
      expect(moved.previous_tab_id).toBe(seededTabId);
      expect(await tabOf(extra.pane.id)).toBe(tabId);
    } finally {
      await herdrTabClose(tabId);
    }
  }, 30_000);

  it('F3. moving a tab’s LAST pane out closes that tab, and the move’s own response says so', async (ctx) => {
    if (skipReason) return ctx.skip();

    // A tab with exactly one pane: moving it out leaves nothing behind, so
    // herdr cascades the tab closed. This is the case the board has to
    // reconcile without a stale row, and `closed_tab_id` is how it learns.
    const { tabId, paneId } = await createTab(`kanhrd-cascade-${Date.now()}`);
    let cascaded = false;
    try {
      const moved = await client.call('local', 'pane.move', {
        pane_id: paneId,
        destination: { type: 'tab', tab_id: seededTabId, split: 'right' },
        focus: false,
      });

      expect(moved.changed).toBe(true);
      expect(
        moved.closed_tab_id,
        'the emptied tab must be reported on the response, not only as a later event'
      ).toBe(tabId);
      // The seeded workspace still holds its own tab, so only the tab
      // cascades — no workspace close to reconcile here.
      expect(moved.closed_workspace_id).toBeUndefined();
      expect((await herdrTabList()).some((t) => t.tab_id === tabId)).toBe(false);
      cascaded = true;

      await herdrPaneClose(paneId);
    } finally {
      if (!cascaded) await herdrTabClose(tabId);
    }
  }, 30_000);
});
