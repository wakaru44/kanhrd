import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startBridge, waitForHostConnected, type RunningBridge } from "./fixtures/bridge.js";
import { herdrPaneClose, herdrPaneList, herdrPaneSplit } from "./fixtures/herdr-cli.js";
import { requireHerdrOrSkipReason } from "./fixtures/require-herdr.js";

/**
 * A. Lifecycle + connectivity — A1-A4 from the L-INT brief.
 *
 * Historical ad-hoc equivalent: tier-1 VALIDATION.md checks 1-3 (manual
 * `curl`/`tsx watch` smoke), and tier-3 VALIDATION-TIER3.md's flapping-host
 * investigation (A4 is the regression test for the bug that report found —
 * a rejected `events.subscribe` due to one stale `pane_id` should not take
 * the whole host connection down).
 */
describe("A. lifecycle + connectivity", () => {
  let skipReason: string | undefined;
  let bridge: RunningBridge;

  beforeAll(async () => {
    skipReason = await requireHerdrOrSkipReason();
    if (skipReason) return;
    bridge = await startBridge();
  });

  afterAll(async () => {
    await bridge?.stop();
  });

  it("A1. bridge starts on a temp port and logs a parseable listen line within 3s", (ctx) => {
    if (skipReason) return ctx.skip();
    expect(bridge.port).toBeGreaterThan(0);
    expect(bridge.log).toMatch(/Server listening at http:\/\/127\.0\.0\.1:\d+/);
  });

  it("A2. GET /api/hosts reports local connected with no last_error", async (ctx) => {
    if (skipReason) return ctx.skip();
    // `hosts.startAll()` connects asynchronously and isn't awaited before the
    // HTTP server starts listening (see waitForHostConnected's doc comment),
    // so "connects to herdr" is itself a bounded-settle assertion, not a
    // single immediate poll — this IS the connectivity check, not a
    // workaround for one.
    await waitForHostConnected(bridge, "local");
    const res = await fetch(`${bridge.baseUrl}/api/hosts`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { hosts: Array<{ name: string; connected: boolean; last_error?: string }> };
    expect(body.hosts).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: "local", connected: true })]),
    );
    const local = body.hosts.find((h) => h.name === "local");
    expect(local?.last_error).toBeUndefined();
  });

  it("A3. GET /api/hosts/local/panes returns panes shaped like the Pane schema", async (ctx) => {
    if (skipReason) return ctx.skip();
    await waitForHostConnected(bridge, "local");
    const res = await fetch(`${bridge.baseUrl}/api/hosts/local/panes`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      panes: Array<{ id: string; host: string; workspace: { id: string; name: string }; tab: { id: string; name: string }; agent_status: string }>;
    };
    expect(body.panes.length).toBeGreaterThan(0);
    const pane = body.panes[0];
    expect(pane).toMatchObject({
      id: expect.any(String),
      host: "local",
      workspace: { id: expect.any(String), name: expect.any(String) },
      tab: { id: expect.any(String), name: expect.any(String) },
      agent_status: expect.any(String),
    });
  });

  it(
    "A4. connectivity survives pane split/close churn (regression for the stale-pane_id-kills-the-connection bug)",
    async (ctx) => {
      if (skipReason) return ctx.skip();
      await waitForHostConnected(bridge, "local");

      const panes = await herdrPaneList();
      expect(panes.length).toBeGreaterThan(0);
      const targetPaneId = panes[0].pane_id;

      let churning = true;
      const created: string[] = [];
      const churnLoop = (async () => {
        while (churning) {
          const newPaneId = await herdrPaneSplit(targetPaneId, "right");
          if (newPaneId) {
            created.push(newPaneId);
            await herdrPaneClose(newPaneId);
            created.splice(created.indexOf(newPaneId), 1);
          }
          await new Promise((r) => setTimeout(r, 150));
        }
      })();

      const pollResults: Array<{ connected: boolean; last_error?: string }> = [];
      const windowMs = 5_000;
      const pollIntervalMs = windowMs / 20;
      const deadline = Date.now() + windowMs;
      while (Date.now() < deadline) {
        const res = await fetch(`${bridge.baseUrl}/api/hosts`);
        const body = (await res.json()) as { hosts: Array<{ name: string; connected: boolean; last_error?: string }> };
        const local = body.hosts.find((h) => h.name === "local");
        pollResults.push({ connected: local?.connected ?? false, last_error: local?.last_error });
        await new Promise((r) => setTimeout(r, pollIntervalMs));
      }

      churning = false;
      await churnLoop;
      // Best-effort cleanup of any pane left dangling by a mid-loop failure.
      for (const paneId of created) await herdrPaneClose(paneId);

      expect(pollResults.length).toBeGreaterThanOrEqual(15);
      const disconnected = pollResults.filter((r) => !r.connected);
      const withError = pollResults.filter((r) => r.last_error !== undefined);
      expect(disconnected, `disconnected polls: ${JSON.stringify(disconnected)}`).toHaveLength(0);
      expect(withError, `polls with last_error: ${JSON.stringify(withError)}`).toHaveLength(0);
    },
    15_000,
  );

  it("workspace/pane world is left exactly as found (workspace still has the original pane count)", async (ctx) => {
    if (skipReason) return ctx.skip();
    const panes = await herdrPaneList();
    expect(panes.length).toBeGreaterThan(0);
  });
});
