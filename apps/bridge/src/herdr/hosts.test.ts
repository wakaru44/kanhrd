import { mkdtempSync, rmSync } from "node:fs";
import { createServer, type Server, type Socket } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { HostSummary } from "@kanhrd/schema";
import { HostRuntime } from "./hosts.js";

/**
 * Regression test for the "bridge cycles connected/disconnected under pane
 * churn" bug: herdr's `events.subscribe` rejects the WHOLE request when ANY
 * one `pane.agent_status_changed { pane_id }` spec names a pane that no
 * longer exists (verified live: `{"error":{"code":"pane_not_found",
 * "message":"pane <id> not found"}}`). `HostRuntime` must prune that pane id
 * and retry rather than treat the whole host as disconnected — see
 * `HostRuntime.subscribeWithPaneRecovery`.
 *
 * ponytail: hand-rolled fake herdr server, same pattern as client.test.ts —
 * newline-delimited JSON over a unix socket, no mock-socket library needed.
 */
describe("HostRuntime — pane_not_found subscribe recovery", () => {
  let dir: string;
  let socketPath: string;
  let server: Server;
  let subscribeAttempts: Array<string[]>;

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), "kanhrd-bridge-hosts-test-"));
    socketPath = join(dir, "herdr.sock");
    subscribeAttempts = [];

    server = createServer((socket) => {
      let buffer = "";
      socket.setEncoding("utf8");
      socket.on("data", (chunk: string) => {
        buffer += chunk;
        const idx = buffer.indexOf("\n");
        if (idx === -1) return;
        const line = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 1);
        handleRequest(socket, JSON.parse(line));
      });
    });
    await new Promise<void>((resolve) => server.listen(socketPath, resolve));
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    rmSync(dir, { recursive: true, force: true });
  });

  interface FakeRequest {
    id: string;
    method: string;
    params?: { subscriptions?: Array<{ type: string; pane_id?: string }> };
  }

  function handleRequest(socket: Socket, request: FakeRequest): void {
    if (request.method === "workspace.list") {
      socket.write(`${JSON.stringify({ id: request.id, ok: true, result: { workspaces: [] } })}\n`);
      socket.end();
      return;
    }
    if (request.method === "tab.list") {
      socket.write(`${JSON.stringify({ id: request.id, ok: true, result: { tabs: [] } })}\n`);
      socket.end();
      return;
    }
    if (request.method === "pane.list") {
      socket.write(
        `${JSON.stringify({
          id: request.id,
          ok: true,
          result: {
            panes: [
              { pane_id: "p1", workspace_id: "w1", tab_id: "t1", agent_status: "idle", revision: 0 },
              { pane_id: "p2", workspace_id: "w1", tab_id: "t1", agent_status: "idle", revision: 0 },
            ],
          },
        })}\n`,
      );
      socket.end();
      return;
    }
    if (request.method === "events.subscribe") {
      const paneIds = (request.params?.subscriptions ?? [])
        .filter((spec) => spec.type === "pane.agent_status_changed")
        .map((spec) => spec.pane_id as string);
      subscribeAttempts.push(paneIds);

      // First attempt (p1 + p2): herdr rejects because p1 "closed" in the
      // gap between our pane.list and this subscribe landing — the exact
      // race this test simulates. Every subsequent attempt succeeds.
      if (paneIds.includes("p1") && subscribeAttempts.length === 1) {
        socket.write(
          `${JSON.stringify({ id: "", error: { code: "pane_not_found", message: "pane p1 not found" } })}\n`,
        );
        socket.end();
        return;
      }
      socket.write(`${JSON.stringify({ id: request.id, ok: true, result: {} })}\n`);
      return; // herdr keeps subscribe connections open — no socket.end()
    }
    socket.write(`${JSON.stringify({ id: request.id, ok: true, result: {} })}\n`);
    socket.end();
  }

  async function waitFor(predicate: () => boolean, timeoutMs = 2000): Promise<void> {
    const start = Date.now();
    while (!predicate()) {
      if (Date.now() - start > timeoutMs) throw new Error("waitFor timed out");
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }

  it("prunes the stale pane_id and retries instead of disconnecting", async () => {
    const host = new HostRuntime({ name: "test", socket: socketPath });
    const states: HostSummary[] = [];
    host.on("state", (s: HostSummary) => states.push(s));

    host.start();
    try {
      await waitFor(() => host.state().connected);

      // The fix worked: connected on the first successful state transition,
      // no intermediate "disconnected, backing off" state was ever emitted.
      expect(states).toHaveLength(1);
      expect(states[0]).toEqual({ name: "test", connected: true });
      expect(host.state()).toEqual({ name: "test", connected: true });

      // Proves recovery actually happened (not a fluke): attempt 1 included
      // the stale p1, attempt 2 dropped it after the prune.
      expect(subscribeAttempts).toHaveLength(2);
      expect(subscribeAttempts[0]?.sort()).toEqual(["p1", "p2"]);
      expect(subscribeAttempts[1]?.sort()).toEqual(["p2"]);
    } finally {
      host.stop();
    }
  });
});
