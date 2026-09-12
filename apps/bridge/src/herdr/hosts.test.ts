import { mkdtempSync, rmSync } from 'node:fs';
import { createServer, type Server, type Socket } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { HostSummary, WsEvent } from '@kanhrd/schema';
import { HostRuntime } from './hosts.js';

/**
 * Regression coverage for the phantom-lifecycle-event storm: `HostRuntime`
 * used to rebuild (tear down + reopen) its one persistent herdr
 * `events.subscribe` connection on every pane create/close, because herdr's
 * `pane.agent_status_changed` subscription requires a `pane_id` per pane
 * (`Subscription::PaneAgentStatusChanged`, no wildcard form exists on any
 * herdr version — confirmed by reading `src/api/schema/events.rs` in the
 * herdr repo). On herdr builds that predate herdr commit `20a500a7` (which
 * fixed a new subscription's starting point), every rebuilt subscription
 * replays herdr's buffered event backlog to every subscribed browser
 * client — a storm of stale/phantom lifecycle events.
 *
 * The fix: `buildSubscriptionSpecs()` no longer depends on the live pane-id
 * set (agent-status delivery moved to `pollAgentStatus()` polling instead),
 * so `events.subscribe` is called exactly once per connect, never again in
 * response to pane churn. These tests assert that shape directly against a
 * hand-rolled fake herdr server — same pattern as `client.test.ts`,
 * newline-delimited JSON over a unix socket, no mock-socket library needed.
 */
describe('HostRuntime — subscription stability under pane churn', () => {
  let dir: string;
  let socketPath: string;
  let server: Server;
  let subscribeCount: number;
  let lastSubscribeSpecs: Array<{ type: string; pane_id?: string }>;
  let panes: Array<{
    pane_id: string;
    workspace_id: string;
    tab_id: string;
    agent_status: string;
    revision: number;
  }>;
  let subscribeSocket: Socket | null;

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'kanhrd-bridge-hosts-test-'));
    socketPath = join(dir, 'herdr.sock');
    subscribeCount = 0;
    lastSubscribeSpecs = [];
    subscribeSocket = null;
    panes = [
      { pane_id: 'p1', workspace_id: 'w1', tab_id: 't1', agent_status: 'idle', revision: 0 },
      { pane_id: 'p2', workspace_id: 'w1', tab_id: 't1', agent_status: 'idle', revision: 0 },
    ];

    server = createServer((socket) => {
      let buffer = '';
      socket.setEncoding('utf8');
      socket.on('data', (chunk: string) => {
        buffer += chunk;
        const idx = buffer.indexOf('\n');
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
    if (request.method === 'workspace.list') {
      socket.write(`${JSON.stringify({ id: request.id, ok: true, result: { workspaces: [] } })}\n`);
      socket.end();
      return;
    }
    if (request.method === 'tab.list') {
      socket.write(`${JSON.stringify({ id: request.id, ok: true, result: { tabs: [] } })}\n`);
      socket.end();
      return;
    }
    if (request.method === 'pane.list') {
      socket.write(`${JSON.stringify({ id: request.id, ok: true, result: { panes } })}\n`);
      socket.end();
      return;
    }
    if (request.method === 'events.subscribe') {
      subscribeCount++;
      lastSubscribeSpecs = request.params?.subscriptions ?? [];
      subscribeSocket = socket;
      socket.write(`${JSON.stringify({ id: request.id, ok: true, result: {} })}\n`);
      return; // herdr keeps subscribe connections open — no socket.end()
    }
    socket.write(`${JSON.stringify({ id: request.id, ok: true, result: {} })}\n`);
    socket.end();
  }

  async function waitFor(predicate: () => boolean, timeoutMs = 2000): Promise<void> {
    const start = Date.now();
    while (!predicate()) {
      if (Date.now() - start > timeoutMs) throw new Error('waitFor timed out');
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }

  it('subscribes once, with a pane-id-independent spec set, and never resubscribes on pane push events', async () => {
    const host = new HostRuntime({ name: 'test', socket: socketPath });
    const bridgeEvents: WsEvent[] = [];
    host.on('bridge-event', (e: WsEvent) => bridgeEvents.push(e));

    host.start();
    try {
      await waitFor(() => host.state().connected);
      expect(subscribeCount).toBe(1);

      // No `pane_id` anywhere in the spec set — it no longer varies with
      // the live pane-id set, and no `pane.agent_status_changed` entries
      // at all (that kind moved to polling).
      expect(lastSubscribeSpecs.every((spec) => spec.pane_id === undefined)).toBe(true);
      expect(lastSubscribeSpecs.some((spec) => spec.type === 'pane.agent_status_changed')).toBe(
        false
      );
      expect(lastSubscribeSpecs.map((s) => s.type)).toEqual(
        expect.arrayContaining(['pane.created', 'pane.closed', 'tab.created', 'workspace.created'])
      );

      // Simulate herdr pushing several pane.created/pane.closed events in a
      // burst (the exact scenario that used to trigger a debounced
      // resubscribe storm).
      const push = (event: string, data: unknown) =>
        subscribeSocket?.write(`${JSON.stringify({ event, data })}\n`);
      push('pane_created', {
        pane: {
          pane_id: 'p3',
          workspace_id: 'w1',
          tab_id: 't1',
          agent_status: 'idle',
          revision: 0,
        },
      });
      push('pane_closed', { pane_id: 'p3', workspace_id: 'w1' });
      push('pane_created', {
        pane: {
          pane_id: 'p4',
          workspace_id: 'w1',
          tab_id: 't1',
          agent_status: 'idle',
          revision: 0,
        },
      });

      await waitFor(() => bridgeEvents.length >= 3);
      // Give any (incorrect) debounced resubscribe a chance to fire before asserting it didn't.
      await new Promise((resolve) => setTimeout(resolve, 300));
      expect(subscribeCount).toBe(1);
    } finally {
      host.stop();
    }
  });

  /**
   * `pane.updated` is how a rename made anywhere — this board, herdr's own
   * interface, another client — reaches the board. It is a GLOBAL
   * subscription (no `pane_id`), so it joins the fixed spec set without
   * reintroducing the resubscribe-on-pane-churn storm the tests above guard.
   */
  it('subscribes to pane.updated globally and relays it as a projected pane', async () => {
    const host = new HostRuntime({ name: 'test', socket: socketPath });
    const bridgeEvents: WsEvent[] = [];
    host.on('bridge-event', (e: WsEvent) => bridgeEvents.push(e));

    host.start();
    try {
      await waitFor(() => host.state().connected);
      const updatedSpec = lastSubscribeSpecs.find((spec) => spec.type === 'pane.updated');
      expect(updatedSpec).toBeDefined();
      expect(updatedSpec?.pane_id).toBeUndefined();

      subscribeSocket?.write(
        `${JSON.stringify({
          event: 'pane_updated',
          data: {
            pane: {
              pane_id: 'p1',
              workspace_id: 'w1',
              tab_id: 't1',
              agent_status: 'idle',
              revision: 1,
              label: 'fix the backlog storm',
            },
          },
        })}\n`
      );

      await waitFor(() => bridgeEvents.some((e) => e.event === 'pane.updated'));
      const relayed = bridgeEvents.find(
        (e) => e.event === 'pane.updated'
      ) as WsEvent<'pane.updated'>;
      expect(relayed.host).toBe('test');
      expect(relayed.payload.pane.id).toBe('p1');
      expect(relayed.payload.pane.label).toBe('fix the backlog storm');

      // The agent-status poll is untouched by this: no synthetic status
      // event was emitted for a pane whose status did not change.
      await new Promise((resolve) => setTimeout(resolve, 200));
      expect(bridgeEvents.some((e) => e.event === 'pane.agent_status_changed')).toBe(false);
      expect(subscribeCount).toBe(1);
    } finally {
      host.stop();
    }
  });
});

describe('HostRuntime — agent-status polling', () => {
  let dir: string;
  let socketPath: string;
  let server: Server;
  let panes: Array<{
    pane_id: string;
    workspace_id: string;
    tab_id: string;
    agent_status: string;
    revision: number;
  }>;

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'kanhrd-bridge-hosts-poll-test-'));
    socketPath = join(dir, 'herdr.sock');
    panes = [
      { pane_id: 'p1', workspace_id: 'w1', tab_id: 't1', agent_status: 'idle', revision: 0 },
    ];

    server = createServer((socket) => {
      let buffer = '';
      socket.setEncoding('utf8');
      socket.on('data', (chunk: string) => {
        buffer += chunk;
        const idx = buffer.indexOf('\n');
        if (idx === -1) return;
        const line = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 1);
        const request = JSON.parse(line) as { id: string; method: string };
        if (request.method === 'workspace.list') {
          socket.write(
            `${JSON.stringify({ id: request.id, ok: true, result: { workspaces: [] } })}\n`
          );
          socket.end();
          return;
        }
        if (request.method === 'tab.list') {
          socket.write(`${JSON.stringify({ id: request.id, ok: true, result: { tabs: [] } })}\n`);
          socket.end();
          return;
        }
        if (request.method === 'pane.list') {
          socket.write(`${JSON.stringify({ id: request.id, ok: true, result: { panes } })}\n`);
          socket.end();
          return;
        }
        if (request.method === 'events.subscribe') {
          socket.write(`${JSON.stringify({ id: request.id, ok: true, result: {} })}\n`);
          return;
        }
        socket.write(`${JSON.stringify({ id: request.id, ok: true, result: {} })}\n`);
        socket.end();
      });
    });
    await new Promise<void>((resolve) => server.listen(socketPath, resolve));
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    rmSync(dir, { recursive: true, force: true });
  });

  async function waitFor(predicate: () => boolean, timeoutMs = 3000): Promise<void> {
    const start = Date.now();
    while (!predicate()) {
      if (Date.now() - start > timeoutMs) throw new Error('waitFor timed out');
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }

  it('does not emit for the baseline status seen at connect, only for a later change', async () => {
    const host = new HostRuntime(
      { name: 'test', socket: socketPath },
      25 /* fast poll for the test */
    );
    const statusEvents: WsEvent<'pane.agent_status_changed'>[] = [];
    host.on('bridge-event', (e: WsEvent) => {
      if (e.event === 'pane.agent_status_changed')
        statusEvents.push(e as WsEvent<'pane.agent_status_changed'>);
    });

    host.start();
    try {
      await waitFor(() => host.state().connected);
      // Give the poll loop a couple of ticks against the unchanged baseline.
      await new Promise((resolve) => setTimeout(resolve, 80));
      expect(statusEvents).toHaveLength(0);

      panes[0] = {
        pane_id: 'p1',
        workspace_id: 'w1',
        tab_id: 't1',
        agent_status: 'working',
        revision: 0,
      };
      await waitFor(() => statusEvents.length === 1);
      expect(statusEvents[0]?.payload).toMatchObject({
        id: 'p1',
        host: 'test',
        agent_status: 'working',
      });
    } finally {
      host.stop();
    }
  });

  // --- status_since: the bridge's observation of when a status began ------
  //
  // The whole point of the field is what it does NOT claim. herdr reports no
  // timestamp, so a value exists only where this runtime watched the
  // transition itself; everywhere else the field is absent, never zeroed and
  // never stamped "now" to look complete.

  it('gives a pane it found already in its status at connect no status_since at all', async () => {
    const host = new HostRuntime({ name: 'test', socket: socketPath }, 25);
    host.start();
    try {
      await waitFor(() => host.state().connected);
      const pane = (await host.listPanes())[0]!;
      expect(pane.status_since).toBeUndefined();
      expect('status_since' in pane).toBe(false); // omitted, not `undefined`/`0`/`null`

      // Still absent several polls later: a steady status does not become
      // vouchable just because the bridge kept looking at it.
      await new Promise((resolve) => setTimeout(resolve, 80));
      expect((await host.listPanes())[0]?.status_since).toBeUndefined();
    } finally {
      host.stop();
    }
  });

  it('stamps status_since on a transition it observes, and leaves it alone while the status holds', async () => {
    const host = new HostRuntime({ name: 'test', socket: socketPath }, 25);
    const statusEvents: WsEvent<'pane.agent_status_changed'>[] = [];
    host.on('bridge-event', (e: WsEvent) => {
      if (e.event === 'pane.agent_status_changed')
        statusEvents.push(e as WsEvent<'pane.agent_status_changed'>);
    });

    host.start();
    try {
      await waitFor(() => host.state().connected);
      const before = Date.now();
      panes[0] = {
        pane_id: 'p1',
        workspace_id: 'w1',
        tab_id: 't1',
        agent_status: 'working',
        revision: 0,
      };
      await waitFor(() => statusEvents.length === 1);

      const stamped = (await host.listPanes())[0]?.status_since;
      expect(stamped).toBeGreaterThanOrEqual(before);
      expect(stamped).toBeLessThanOrEqual(Date.now());
      // The event carries the same observation, so a client patching a
      // cached pane from it agrees with the next `pane.list`.
      expect(statusEvents[0]?.payload.status_since).toBe(stamped);

      // Several more polls at the same status must not move it — otherwise
      // the duration would never grow.
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect((await host.listPanes())[0]?.status_since).toBe(stamped);

      // A second transition re-stamps.
      panes[0] = {
        pane_id: 'p1',
        workspace_id: 'w1',
        tab_id: 't1',
        agent_status: 'idle',
        revision: 0,
      };
      await waitFor(() => statusEvents.length === 2);
      const restamped = (await host.listPanes())[0]?.status_since;
      expect(restamped).toBeGreaterThanOrEqual(stamped as number);
      expect(statusEvents[1]?.payload.status_since).toBe(restamped);
    } finally {
      host.stop();
    }
  });

  /**
   * The operator's report: a session dies from inside (the process exits,
   * the agent finishes, it crashes) or is closed from herdr's own CLI/TUI.
   * Nothing calls `pane.close` through the bridge, and herdr pushes no
   * `pane.closed` here — so the ONLY signal is the pane leaving `pane.list`.
   * Before the fix the poll noticed exactly that and told no one, leaving a
   * card on the board for a session that no longer exists.
   *
   * This fake herdr never pushes a lifecycle event at all: the pane just
   * disappears from `pane.list`.
   */
  it('synthesizes pane.closed for a pane that vanishes from pane.list with no push', async () => {
    const host = new HostRuntime({ name: 'test', socket: socketPath }, 25);
    const closed: WsEvent<'pane.closed'>[] = [];
    host.on('bridge-event', (e: WsEvent) => {
      if (e.event === 'pane.closed') closed.push(e as WsEvent<'pane.closed'>);
    });

    host.start();
    try {
      await waitFor(() => host.state().connected);
      await new Promise((resolve) => setTimeout(resolve, 80)); // steady polls emit nothing
      expect(closed).toHaveLength(0);

      panes.splice(0, 1); // the pane dies; herdr says nothing

      await waitFor(() => closed.length === 1);
      expect(closed[0]?.host).toBe('test');
      expect(closed[0]?.payload).toEqual({ id: 'p1', host: 'test', workspace: { id: 'w1' } });

      // Exactly one frame — later polls must not re-announce a pane already
      // reported gone, or the client would see a close storm.
      await new Promise((resolve) => setTimeout(resolve, 120));
      expect(closed).toHaveLength(1);
    } finally {
      host.stop();
    }
  });

  it('drops the record when a pane leaves pane.list, and stamps a returning id fresh', async () => {
    const host = new HostRuntime({ name: 'test', socket: socketPath }, 25);
    host.start();
    try {
      await waitFor(() => host.state().connected);
      expect((await host.listPanes())[0]?.status_since).toBeUndefined();

      const removed = panes.splice(0, 1);
      await new Promise((resolve) => setTimeout(resolve, 80)); // polls prune it
      expect(await host.listPanes()).toHaveLength(0);

      const returned = Date.now();
      panes.push(removed[0]!);
      await new Promise((resolve) => setTimeout(resolve, 80)); // a poll sees it again

      // Seen arriving while this runtime was watching, so the bridge CAN
      // vouch for it now — and the stamp is from the return, not resumed
      // from the pane's previous life (which had no stamp at all).
      const since = (await host.listPanes())[0]?.status_since;
      expect(since).toBeGreaterThanOrEqual(returned);
    } finally {
      host.stop();
    }
  });
});

/**
 * Direct reproduction of the storm CLASS itself, independent of any real
 * herdr build's backlog-replay behavior: a fake herdr that responds to
 * EVERY `events.subscribe` call by immediately pushing a large burst of
 * `pane.created`/`pane.closed` events (simulating a full backlog replay,
 * the exact thing herdr builds predating commit `20a500a7` do on a fresh
 * subscription).
 *
 * Before the fix, `pane.created`/`pane.closed` push handlers called
 * `scheduleResubscribe()`, so a burst full of those events would itself
 * trigger a resubscribe — which, against this fake server, would receive
 * ANOTHER full burst, cascading without bound. The fix removes that
 * resubscribe trigger entirely (the herdr subscription spec set no longer
 * depends on the live pane-id set), so receiving a burst — however large —
 * must not cause a second `events.subscribe` call, and the number of
 * `bridge-event`s emitted must match the burst exactly (no amplification).
 */
describe('HostRuntime — resubscribe-cascade storm reproduction', () => {
  let dir: string;
  let socketPath: string;
  let server: Server;
  let subscribeCount: number;
  const BURST_SIZE = 500;

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'kanhrd-bridge-hosts-storm-test-'));
    socketPath = join(dir, 'herdr.sock');
    subscribeCount = 0;

    server = createServer((socket) => {
      let buffer = '';
      socket.setEncoding('utf8');
      socket.on('data', (chunk: string) => {
        buffer += chunk;
        let idx = buffer.indexOf('\n');
        while (idx !== -1) {
          const line = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 1);
          idx = buffer.indexOf('\n');
          handleRequest(socket, JSON.parse(line));
        }
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
  }

  function handleRequest(socket: Socket, request: FakeRequest): void {
    if (request.method === 'workspace.list') {
      socket.write(`${JSON.stringify({ id: request.id, ok: true, result: { workspaces: [] } })}\n`);
      socket.end();
      return;
    }
    if (request.method === 'tab.list') {
      socket.write(`${JSON.stringify({ id: request.id, ok: true, result: { tabs: [] } })}\n`);
      socket.end();
      return;
    }
    if (request.method === 'pane.list') {
      socket.write(`${JSON.stringify({ id: request.id, ok: true, result: { panes: [] } })}\n`);
      socket.end();
      return;
    }
    if (request.method === 'events.subscribe') {
      subscribeCount++;
      socket.write(`${JSON.stringify({ id: request.id, ok: true, result: {} })}\n`);
      // Simulate a full backlog replay: a burst of phantom create/close
      // pairs for ids that were never returned by `pane.list` above.
      for (let i = 0; i < BURST_SIZE; i++) {
        const paneId = `phantom-${i}`;
        socket.write(
          `${JSON.stringify({
            event: 'pane_created',
            data: {
              pane: {
                pane_id: paneId,
                workspace_id: 'w1',
                tab_id: 't1',
                agent_status: 'idle',
                revision: 0,
              },
            },
          })}\n`
        );
        socket.write(
          `${JSON.stringify({ event: 'pane_closed', data: { pane_id: paneId, workspace_id: 'w1' } })}\n`
        );
      }
      return; // herdr keeps subscribe connections open — no socket.end()
    }
    socket.write(`${JSON.stringify({ id: request.id, ok: true, result: {} })}\n`);
    socket.end();
  }

  async function waitFor(predicate: () => boolean, timeoutMs = 3000): Promise<void> {
    const start = Date.now();
    while (!predicate()) {
      if (Date.now() - start > timeoutMs) throw new Error('waitFor timed out');
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }

  it('absorbs a full backlog-replay burst without cascading into repeat subscribes', async () => {
    const host = new HostRuntime({ name: 'test', socket: socketPath });
    const bridgeEvents: WsEvent[] = [];
    host.on('bridge-event', (e: WsEvent) => bridgeEvents.push(e));

    host.start();
    try {
      await waitFor(() => bridgeEvents.length === BURST_SIZE * 2, 5000);

      // Give any (incorrect) resubscribe-on-churn a chance to fire and
      // deliver a SECOND burst before asserting it didn't.
      await new Promise((resolve) => setTimeout(resolve, 500));

      expect(subscribeCount).toBe(1);
      expect(bridgeEvents).toHaveLength(BURST_SIZE * 2); // exactly one burst, no amplification
      expect(host.state().connected).toBe(true); // no disconnect/reconnect cycling either
    } finally {
      host.stop();
    }
  });
});
