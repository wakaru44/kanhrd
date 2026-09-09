import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { startBridge, waitForHostConnected, type RunningBridge } from "./fixtures/bridge.js";
import { IntegrationClient } from "./fixtures/ws-client.js";
import { herdrPaneList, herdrPaneSendText } from "./fixtures/herdr-cli.js";
import { requireHerdrOrSkipReason } from "./fixtures/require-herdr.js";

/**
 * B. WebSocket protocol methods — B1-B7 from the L-INT brief.
 *
 * Historical ad-hoc equivalent: VALIDATION-TIER2.md's raw-WS Node script
 * (checklist items 3-10), re-run manually every validation round against a
 * throwaway `/tmp/kanhrd-ws-test.mjs`. This file is that script, committed.
 */
describe("B. WebSocket protocol methods", () => {
  let skipReason: string | undefined;
  let bridge: RunningBridge;
  let client: IntegrationClient;
  let panePid: string;

  beforeAll(async () => {
    skipReason = await requireHerdrOrSkipReason();
    if (skipReason) return;
    bridge = await startBridge();
    await waitForHostConnected(bridge, "local");
    client = await IntegrationClient.connect(bridge.wsUrl);
    const panes = await herdrPaneList();
    panePid = panes[0].pane_id;
  });

  afterAll(async () => {
    client?.close();
    await bridge?.stop();
  });

  const openSubscriptions: string[] = [];
  afterEach(async () => {
    for (const id of openSubscriptions.splice(0)) {
      await client.call("local", "pane.unsubscribe_output", { subscription_id: id }).catch(() => undefined);
    }
  });

  it("B1. bridge.capabilities reports all tier-2 + tier-3 booleans", async (ctx) => {
    if (skipReason) return ctx.skip();
    const data = await client.call("local", "bridge.capabilities", {});
    expect(data.tier).toBe(3);
    expect(data).toMatchObject({
      terminal: true,
      paneResize: false,
      paneGraphics: false,
      outputPollIntervalMs: expect.any(Number),
      paneCreate: true,
      paneClose: true,
      paneMove: true,
      tabCrud: true,
      workspaceCrud: true,
    });
  });

  it("B2. pane.read returns non-empty ansi/recent content with an integer revision", async (ctx) => {
    if (skipReason) return ctx.skip();
    const data = await client.call("local", "pane.read", { pane_id: panePid });
    expect(data.content.length).toBeGreaterThan(0);
    expect(Number.isInteger(data.revision)).toBe(true);
    expect(data.format).toBe("ansi");
    expect(data.source).toBe("recent");
  });

  it("B3. pane.subscribe_output mints a subscription_id and delivers a pane.output event within 3s", async (ctx) => {
    if (skipReason) return ctx.skip();
    const { subscription_id } = await client.call("local", "pane.subscribe_output", { pane_id: panePid });
    openSubscriptions.push(subscription_id);
    expect(subscription_id).toBeTruthy();

    // Nudge the pane so there is guaranteed fresh content for the poller to observe.
    void herdrPaneSendText(panePid, "echo kanhrd-b3-nudge\r");

    const event = await client.waitForEvent(
      (e) => e.event === "pane.output" && (e.payload as { subscription_id: string }).subscription_id === subscription_id,
      3_000,
    );
    const payload = event.payload as { subscription_id: string; pane_id: string; revision: number; content: string; format: string; truncated: boolean };
    expect(payload.pane_id).toBe(panePid);
    expect(typeof payload.content).toBe("string");
    expect(payload.content.length).toBeGreaterThan(0);
    expect(typeof payload.revision).toBe("number");
    expect(typeof payload.truncated).toBe("boolean");
  });

  it("B4. pane.unsubscribe_output returns {} and stops further pane.output events", async (ctx) => {
    if (skipReason) return ctx.skip();
    const { subscription_id } = await client.call("local", "pane.subscribe_output", { pane_id: panePid });
    // Let at least one event land so we know the subscription was live.
    await client.waitForEvent(
      (e) => e.event === "pane.output" && (e.payload as { subscription_id: string }).subscription_id === subscription_id,
      3_000,
    );

    const res = await client.request("local", "pane.unsubscribe_output", { subscription_id });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data).toEqual({});

    const countBefore = client.eventsFor(
      (e) => e.event === "pane.output" && (e.payload as { subscription_id: string }).subscription_id === subscription_id,
    ).length;
    await new Promise((r) => setTimeout(r, 500));
    const countAfter = client.eventsFor(
      (e) => e.event === "pane.output" && (e.payload as { subscription_id: string }).subscription_id === subscription_id,
    ).length;
    expect(countAfter).toBe(countBefore);
  });

  it("B5. pane.send_text reaches the real pane (verified via a follow-up pane.read)", async (ctx) => {
    if (skipReason) return ctx.skip();
    const marker = `kanhrd-b5-marker-${Date.now()}`;
    const res = await client.request("local", "pane.send_text", { pane_id: panePid, text: `echo ${marker}\r` });
    expect(res.ok).toBe(true);

    await new Promise((r) => setTimeout(r, 500));
    const data = await client.call("local", "pane.read", { pane_id: panePid });
    expect(data.content).toContain(marker);
  });

  it("B6. pane.resize rejects with not_supported", async (ctx) => {
    if (skipReason) return ctx.skip();
    const res = await client.request("local", "pane.resize", { pane_id: panePid, cols: 80, rows: 24 });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("not_supported");
  });

  it("B7. pane.graphics.info and pane.graphics.stream reject with not_supported", async (ctx) => {
    if (skipReason) return ctx.skip();
    const infoRes = await client.request("local", "pane.graphics.info", { pane_id: panePid });
    expect(infoRes.ok).toBe(false);
    if (!infoRes.ok) expect(infoRes.error.code).toBe("not_supported");

    const streamRes = await client.request("local", "pane.graphics.stream", { pane_id: panePid });
    expect(streamRes.ok).toBe(false);
    if (!streamRes.ok) expect(streamRes.error.code).toBe("not_supported");
  });
});
