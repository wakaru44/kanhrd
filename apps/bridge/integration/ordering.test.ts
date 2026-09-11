import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startBridge, waitForHostConnected, type RunningBridge } from './fixtures/bridge.js';
import { IntegrationClient } from './fixtures/ws-client.js';
import { herdrPaneSendText, seededWorld } from './fixtures/herdr-cli.js';
import { requireHerdrOrSkipReason } from './fixtures/require-herdr.js';

/**
 * C. Ordering guarantees — C1-C2 from the L-INT brief.
 *
 * These are the regression tests for the two blocker bugs L5B found (round
 * 1) and L2B fixed (round 2), per VALIDATION-TIER2.md:
 *
 * - Bug A ("ndl-2r-5akbmkaherr" scramble): concurrent per-keystroke
 *   `pane.send_text` calls raced over independent herdr socket connections
 *   with no ordering guarantee. Fixed by `PaneWriteQueue`
 *   (`apps/bridge/src/herdr/write-queue.ts`), which has its own unit test
 *   already (`write-queue.test.ts`) — this integration test proves the fix
 *   holds through the real bridge process end-to-end, not just the queue
 *   data structure in isolation.
 * - Bug B (silent-after-first-snapshot polling): `pane.read.revision` is
 *   hardcoded `0` in herdr 0.8.2, so revision-based dedup in the output
 *   poller never re-fired after the first poll. Fixed by a content-hash
 *   fallback in `apps/bridge/src/output/poller.ts`.
 */
describe('C. ordering guarantees', () => {
  let skipReason: string | undefined;
  let bridge: RunningBridge;
  let client: IntegrationClient;
  let panePid: string;

  beforeAll(async () => {
    skipReason = await requireHerdrOrSkipReason();
    if (skipReason) return;
    bridge = await startBridge();
    await waitForHostConnected(bridge, 'local');
    client = await IntegrationClient.connect(bridge.wsUrl);
    // Use a distinct pane from the ws-methods suite where possible to avoid
    // cross-file content interference; falls back to the only pane if just one exists.
    const { paneIds } = seededWorld();
    panePid = paneIds[1] ?? paneIds[0];
  });

  afterAll(async () => {
    client?.close();
    await bridge?.stop();
  });

  it('C1. burst-send ordering: 20 unawaited pane.send_text calls land in exact send order (no keystroke scramble)', async (ctx) => {
    if (skipReason) return ctx.skip();

    const markers = '0123456789abcdefghij'.split('');
    expect(markers).toHaveLength(20);

    // Deliberately unawaited/concurrent — this is the exact adversarial
    // shape that produced the "ndl-2r-5akbmkaherr" scramble in round 1.
    const sends = markers.map((ch) =>
      client.request('local', 'pane.send_text', { pane_id: panePid, text: ch })
    );
    const sendResults = await Promise.all(sends);
    const failedSends = sendResults.filter((r) => !r.ok);
    expect(failedSends, `some burst sends failed: ${JSON.stringify(failedSends)}`).toHaveLength(0);
    const enterRes = await client.request('local', 'pane.send_keys', {
      pane_id: panePid,
      keys: ['Enter'],
    });
    expect(enterRes.ok, `send_keys(Enter) failed: ${JSON.stringify(enterRes)}`).toBe(true);

    await new Promise((r) => setTimeout(r, 500));
    const data = await client.call('local', 'pane.read', { pane_id: panePid });

    expect(data.content).toContain(markers.join(''));
  }, 10_000);

  it(
    'C2. live-update polling: three externally-triggered pane changes produce three distinct pane.output events ' +
      "(regression for herdr's stuck-at-zero revision — proves the sha1(content) dedup fallback)",
    async (ctx) => {
      if (skipReason) return ctx.skip();

      const { subscription_id } = await client.call('local', 'pane.subscribe_output', {
        pane_id: panePid,
      });
      try {
        const markers = Array.from({ length: 3 }, (_, i) => `hash-test-${Date.now()}-${i}`);
        const seenContents: string[] = [];

        for (const marker of markers) {
          // Fired from a second process (the herdr CLI), external to the WS
          // session under test — simulates "someone/something else changes
          // the pane" per the brief.
          await herdrPaneSendText(panePid, `echo ${marker}\r`);
          const event = await client.waitForEvent(
            (e) =>
              e.event === 'pane.output' &&
              (e.payload as { subscription_id: string; content: string }).subscription_id ===
                subscription_id &&
              (e.payload as { content: string }).content.includes(marker),
            3_000
          );
          seenContents.push((event.payload as { content: string }).content);
          await new Promise((r) => setTimeout(r, 300));
        }

        expect(seenContents).toHaveLength(3);
        expect(new Set(seenContents).size).toBe(3);
      } finally {
        await client
          .call('local', 'pane.unsubscribe_output', { subscription_id })
          .catch(() => undefined);
      }
    },
    15_000
  );
});
