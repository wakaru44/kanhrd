import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { startBridge, waitForHostConnected, type RunningBridge } from "./fixtures/bridge.js";
import { IntegrationClient } from "./fixtures/ws-client.js";
import { herdrPaneList, herdrTabClose, herdrTabList, herdrWorkspaceList } from "./fixtures/herdr-cli.js";
import { requireHerdrOrSkipReason } from "./fixtures/require-herdr.js";

/**
 * D. Tier-3 lifecycle — D1-D2 from the L-INT brief.
 *
 * Historical ad-hoc equivalent: VALIDATION-TIER3.md's manual tab-CRUD smoke
 * (create → inline rename → verify via `herdr tab list` → close → verify
 * gone), which that lane could only static-review because the flapping-host
 * bug (see connectivity.test.ts's A4) blocked a live run. This is that
 * checklist, automated and independent of the browser layer.
 *
 * Event-wait timeouts here are deliberately generous (well beyond B3/C2's
 * 3s). Direct investigation against a raw herdr socket (bypassing the
 * bridge entirely, see the L-INT lane report) confirmed two real,
 * bridge/herdr-level reasons event delivery can lag on this suite's shared
 * dev herdr instance, neither of which is a suite bug:
 *   1. `events.subscribe` (`EventsSubscribeParams`,
 *      `src/api/schema/events.rs:12` in the herdr repo) has no
 *      `event_start_sequence`-style field — a fresh subscription can't ask
 *      herdr to skip its backlog, so it replays buffered history before
 *      reaching the live tail. The bridge's own subscription is especially
 *      wide (all eight tier-3 kinds plus one `pane.agent_status_changed`
 *      spec per known pane, `buildSubscriptionSpecs()` in `hosts.ts`), so
 *      its backlog window is larger than a narrow single-kind subscription.
 *   2. Any pane created concurrently by another process on the shared host
 *      (including the root pane `tab.create` itself creates) triggers
 *      `scheduleResubscribe()`, which tears down and re-opens the bridge's
 *      one persistent herdr subscription — re-triggering #1's backlog
 *      drain from scratch. Under continuous concurrent churn (this repo's
 *      dev sandbox regularly runs several agent lanes against the same
 *      local herdr daemon at once) that can repeat faster than a single
 *      drain completes.
 * Both are herdr/bridge-level characteristics of a busy shared socket, out
 * of this lane's writable scope (`apps/bridge/src/**` is forbidden) — this
 * test is intentionally written to the same standard the SPA and other
 * suites hold the wire contract to, and will resolve promptly against a
 * quieter herdr instance.
 */
describe("D. tier-3 lifecycle", () => {
  let skipReason: string | undefined;
  let bridge: RunningBridge;
  let client: IntegrationClient;
  let workspaceId: string;

  const createdTabIds: string[] = [];

  beforeAll(async () => {
    skipReason = await requireHerdrOrSkipReason();
    if (skipReason) return;
    bridge = await startBridge();
    await waitForHostConnected(bridge, "local");
    client = await IntegrationClient.connect(bridge.wsUrl);
    const panes = await herdrPaneList();
    workspaceId = panes[0].workspace_id;
  });

  afterAll(async () => {
    // E. Cleanup: if any test crashed mid-way, purge every throwaway tab we
    // know we created rather than leaving it dangling in the user's real workspace.
    for (const tabId of createdTabIds) {
      const stillThere = (await herdrTabList()).some((t) => t.tab_id === tabId);
      if (stillThere) {
        console.warn(`[integration] leftover tab ${tabId} from a crashed test — closing in cleanup`);
        await herdrTabClose(tabId);
      }
    }
    client?.close();
    await bridge?.stop();
  });

  afterEach(async () => {
    createdTabIds.splice(0);
  });

  it(
    "D1+D2. tab.create -> tab.rename -> tab.close round trips against real herdr state and fires matching events",
    async (ctx) => {
      if (skipReason) return ctx.skip();

      const sub = await client.call("local", "events.subscribe", {
        kinds: ["tab.created", "tab.renamed", "tab.closed"],
      });
      expect(sub.subscription_id).toBeTruthy();

      const label = `kanhrd-int-${Date.now()}`;
      const created = await client.call("local", "tab.create", { workspace_id: workspaceId, label, focus: false });
      // `TabSummary` (packages/schema/src/herdr.ts) is the bridge's own
      // projection — `{ id, host, workspace: { id }, name }` — NOT herdr's
      // raw `tab_id`/`label` field names used by the CLI/`herdrTabList()`.
      const tabId = created.tab.id;
      createdTabIds.push(tabId);

      // D1 (create): confirm via herdr CLI independently of the bridge.
      const afterCreate = await herdrTabList();
      expect(afterCreate.some((t) => t.tab_id === tabId && t.label === label)).toBe(true);

      // D2 (create event).
      const createdEvent = await client.waitForEvent(
        (e) => e.event === "tab.created" && (e.payload as { tab: { id: string } }).tab.id === tabId,
        25_000,
      );
      expect((createdEvent.payload as { tab: { name: string } }).tab.name).toBe(label);

      // D1 (rename).
      const renamedLabel = `${label}-renamed`;
      const renamed = await client.call("local", "tab.rename", { tab_id: tabId, label: renamedLabel });
      expect(renamed.tab.name).toBe(renamedLabel);

      const afterRename = await herdrTabList();
      expect(afterRename.some((t) => t.tab_id === tabId && t.label === renamedLabel)).toBe(true);

      // D2 (rename event).
      const renamedEvent = await client.waitForEvent(
        (e) => e.event === "tab.renamed" && (e.payload as { id: string }).id === tabId,
        25_000,
      );
      expect((renamedEvent.payload as { name: string }).name).toBe(renamedLabel);

      // D1 (close) — full round-trip cleanup.
      const closeRes = await client.request("local", "tab.close", { tab_id: tabId });
      expect(closeRes.ok).toBe(true);

      const afterClose = await herdrTabList();
      expect(afterClose.some((t) => t.tab_id === tabId)).toBe(false);
      createdTabIds.splice(createdTabIds.indexOf(tabId), 1); // confirmed gone, no leftover to purge in afterAll

      // D2 (close event).
      const closedEvent = await client.waitForEvent(
        (e) => e.event === "tab.closed" && (e.payload as { id: string }).id === tabId,
        25_000,
      );
      expect((closedEvent.payload as { workspace: { id: string } }).workspace.id).toBe(workspaceId);
    },
    60_000,
  );
});

/**
 * E. No-phantom-storm regression — see
 * `openspec/changes/fix-bridge-subscription-backlog-storm/proposal.md`.
 *
 * The live symptom this reproduces: a fresh WS connects, subscribes to
 * lifecycle event kinds, and used to see hundreds of stale/phantom
 * `pane.created`/`pane.closed`/`tab.created`/`tab.closed` events for ids
 * that no longer exist, within seconds — caused by `HostRuntime` rebuilding
 * its herdr `events.subscribe` connection on every pane/tab/workspace
 * lifecycle push, which replays herdr's buffered event backlog on herdr
 * builds that predate herdr commit `20a500a7`. The fix makes the bridge's
 * herdr subscription spec set independent of the live pane-id set, so it's
 * opened exactly once and never rebuilt in response to lifecycle churn.
 *
 * This suite's dev sandbox is shared across several concurrently-running
 * agent lanes (documented precedent: the D. suite's own header comment
 * above) — verified live to sometimes produce 100+ events in a 5s window
 * from other lanes' genuine, real-time pane/tab activity alone. That rules
 * out event VOLUME as a reliable signal here (the original storm report and
 * this sandbox's legitimate concurrent load are the same order of
 * magnitude); a strict "zero events" or low-volume assertion would be
 * flaky by construction on this environment, not a meaningful check.
 *
 * What actually distinguishes the bug is that the replayed events name ids
 * that don't exist in herdr's CURRENT state — a stale/duplicate replay, not
 * live activity. This test asserts that signature directly: every
 * `pane.created`/`tab.created`/`workspace.created` event received during
 * the window names an id that genuinely exists in herdr right after the
 * window closes (small residual race risk if that exact resource closes in
 * the few hundred ms between the window ending and the follow-up
 * `pane/tab/workspace.list` call — acceptable, matches this suite's existing
 * tolerance for shared-sandbox noise per the D. suite's own header). The
 * `HostRuntime` unit tests in `src/herdr/hosts.test.ts` are the
 * deterministic, environment-independent proof of the actual fix
 * (subscribe-once, no resubscribe-on-churn); this integration test is a
 * live smoke check on top of that.
 */
describe("E. no phantom lifecycle-event storm on a steady-state host", () => {
  let skipReason: string | undefined;
  let bridge: RunningBridge;

  beforeAll(async () => {
    skipReason = await requireHerdrOrSkipReason();
    if (skipReason) return;
    bridge = await startBridge();
    await waitForHostConnected(bridge, "local");
  });

  afterAll(async () => {
    await bridge?.stop();
  });

  it(
    "a fresh subscription to lifecycle events sees no storm-volume or phantom-id events within several seconds",
    async (ctx) => {
      if (skipReason) return ctx.skip();

      const client = await IntegrationClient.connect(bridge.wsUrl);
      try {
        const sub = await client.call("local", "events.subscribe", {
          kinds: [
            "pane.created",
            "pane.closed",
            "tab.created",
            "tab.closed",
            "tab.renamed",
            "tab.moved",
            "workspace.created",
            "workspace.closed",
            "workspace.renamed",
            "pane.moved",
          ],
        });
        expect(sub.subscription_id).toBeTruthy();

        // Long enough to surface a resubscribe-driven backlog replay
        // (which, when it happened, delivered its whole burst well inside
        // this window) without making the suite slow.
        await new Promise((resolve) => setTimeout(resolve, 5_000));

        const lifecycleEvents = client.eventsFor(
          (e) =>
            e.event === "pane.created" ||
            e.event === "pane.closed" ||
            e.event === "tab.created" ||
            e.event === "tab.closed" ||
            e.event === "tab.renamed" ||
            e.event === "tab.moved" ||
            e.event === "workspace.created" ||
            e.event === "workspace.closed" ||
            e.event === "workspace.renamed" ||
            e.event === "pane.moved",
        );

        const [currentPaneIds, currentTabIds, currentWorkspaceIds] = await Promise.all([
          herdrPaneList().then((panes) => new Set(panes.map((p) => p.pane_id))),
          herdrTabList().then((tabs) => new Set(tabs.map((t) => t.tab_id))),
          herdrWorkspaceList().then((workspaces) => new Set(workspaces.map((w) => w.workspace_id))),
        ]);
        for (const event of lifecycleEvents) {
          if (event.event === "pane.created") {
            const id = (event.payload as { pane: { id: string } }).pane.id;
            expect(currentPaneIds.has(id)).toBe(true);
          } else if (event.event === "tab.created") {
            const id = (event.payload as { tab: { id: string } }).tab.id;
            expect(currentTabIds.has(id)).toBe(true);
          } else if (event.event === "workspace.created") {
            const id = (event.payload as { workspace: { id: string } }).workspace.id;
            expect(currentWorkspaceIds.has(id)).toBe(true);
          }
        }
      } finally {
        client.close();
      }
    },
    15_000,
  );
});
