import { mkdtempSync, rmSync } from 'node:fs';
import { createServer, type Server, type Socket } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  HerdrClient,
  herdrEventKindToDotName,
  type HerdrPushedEvent,
  type HerdrSubscription,
} from './client.js';

// ponytail: hand-rolled fake herdr server instead of pulling in a mock-socket
// library — newline-delimited JSON over a unix socket is a few lines of
// node:net, and this is the one place that shape actually needs exercising.
//
// Mirrors herdr's real transport: ordinary requests get ONE response line
// and the server closes the connection; `events.subscribe` gets an ack line
// and then the connection is kept open for pushed frames.
describe('HerdrClient', () => {
  let dir: string;
  let socketPath: string;
  let server: Server;

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'kanhrd-bridge-test-'));
    socketPath = join(dir, 'herdr.sock');
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
    if (request.method === 'pane.list') {
      socket.write(`${JSON.stringify({ id: request.id, ok: true, result: { panes: [] } })}\n`);
      socket.end();
      return;
    }
    if (request.method === 'boom') {
      socket.write(
        `${JSON.stringify({ id: request.id, ok: false, error: { code: 'bad', message: 'boom failed' } })}\n`
      );
      socket.end();
      return;
    }
    if (request.method === 'events.subscribe') {
      // Mirror herdr: a `pane.agent_status_changed` subscription without a
      // `pane_id` fails the whole request (real bug this fixture exists to
      // catch — see apps/bridge/src/herdr/hosts.ts).
      const invalid = request.params?.subscriptions?.some(
        (spec) => spec.type === 'pane.agent_status_changed' && !spec.pane_id
      );
      if (invalid) {
        socket.write(
          `${JSON.stringify({ id: '', error: { code: 'invalid_request', message: 'missing field `pane_id`' } })}\n`
        );
        socket.end();
        return;
      }
      // Ack, then keep the connection open and push a couple of frames.
      socket.write(`${JSON.stringify({ id: request.id, ok: true, result: {} })}\n`);
      socket.write(
        `${JSON.stringify({ event: 'pane.created', data: { pane: { pane_id: 'p1' } } })}\n`
      );
      socket.write(
        `${JSON.stringify({ event: 'pane.closed', data: { pane_id: 'p1', workspace_id: 'w1' } })}\n`
      );
      return; // no socket.end() — herdr keeps subscribe connections open
    }
    socket.write(`${JSON.stringify({ id: request.id, ok: true, result: {} })}\n`);
    socket.end();
  }

  it('opens a fresh connection per request and correlates the single response', async () => {
    const client = new HerdrClient(socketPath);

    const result = await client.request<{ panes: unknown[] }>('pane.list');

    expect(result).toEqual({ panes: [] });
  });

  it('rejects the request when herdr responds ok: false', async () => {
    const client = new HerdrClient(socketPath);

    await expect(client.request('boom')).rejects.toThrow('boom failed');
  });

  it('issues independent requests on independent connections (no shared state)', async () => {
    const client = new HerdrClient(socketPath);

    const [first, second] = await Promise.all([
      client.request<{ panes: unknown[] }>('pane.list'),
      client.request<{ panes: unknown[] }>('pane.list'),
    ]);

    expect(first).toEqual({ panes: [] });
    expect(second).toEqual({ panes: [] });
  });

  it('subscribe keeps the connection open and routes pushed frames to onEvent', async () => {
    const client = new HerdrClient(socketPath);
    const events: HerdrPushedEvent[] = [];

    const subscription: HerdrSubscription = await client.subscribe(
      [{ type: 'pane.created' }, { type: 'pane.closed' }],
      (evt) => events.push(evt)
    );

    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(events).toEqual([
      { event: 'pane.created', data: { pane: { pane_id: 'p1' } } },
      { event: 'pane.closed', data: { pane_id: 'p1', workspace_id: 'w1' } },
    ]);

    subscription.close();
  });

  it('rejects subscribe when herdr errors on the ack line (e.g. missing per-pane pane_id)', async () => {
    const client = new HerdrClient(socketPath);

    await expect(
      client.subscribe([{ type: 'pane.agent_status_changed' }], () => {})
    ).rejects.toThrow(/pane_id/);
  });

  it('emits disconnect on the subscription handle when the connection closes', async () => {
    const client = new HerdrClient(socketPath);
    const subscription = await client.subscribe([{ type: 'pane.created' }], () => {});

    const disconnected = new Promise<void>((resolve) => {
      subscription.on('disconnect', () => resolve());
    });

    subscription.close();
    await disconnected;
  });
});

/**
 * Verified live against herdr (2026-09-09): the real `EventEnvelope.event`
 * wire value is snake_case from `EventKind`'s own derive (e.g.
 * `"tab_created"`), NOT the dot-form `Subscription` request enum's names —
 * two different herdr enums that happen to share dot_name() output only for
 * one of them. See `herdrEventKindToDotName`'s doc for the full source
 * citation.
 */
describe('herdrEventKindToDotName', () => {
  it('converts the first underscore to a dot, leaving the rest of a multi-word suffix intact', () => {
    expect(herdrEventKindToDotName('tab_created')).toBe('tab.created');
    expect(herdrEventKindToDotName('tab_renamed')).toBe('tab.renamed');
    expect(herdrEventKindToDotName('tab_closed')).toBe('tab.closed');
    expect(herdrEventKindToDotName('workspace_created')).toBe('workspace.created');
    expect(herdrEventKindToDotName('workspace_closed')).toBe('workspace.closed');
    expect(herdrEventKindToDotName('pane_moved')).toBe('pane.moved');
    expect(herdrEventKindToDotName('pane_agent_status_changed')).toBe('pane.agent_status_changed');
  });

  it('is a no-op for a string with no underscore', () => {
    expect(herdrEventKindToDotName('pane.created')).toBe('pane.created');
    expect(herdrEventKindToDotName('ping')).toBe('ping');
  });
});
