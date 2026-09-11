import Fastify, { type FastifyInstance } from 'fastify';
import { WebSocket } from 'ws';
import { afterEach, describe, expect, it } from 'vitest';
import { loadConfig, type OriginPolicy } from '../config.js';
import { HostRegistry } from '../herdr/hosts.js';
import { registerRest } from '../http/rest.js';
import { registerWebSocket } from './server.js';

/**
 * Handshake enforcement, driven through a real listening bridge and a real
 * `ws` client — `app.inject` cannot perform a protocol upgrade, and the
 * whole point of this check is what the upgrade does.
 *
 * Hermetic: `new HostRegistry([])` never touches a herdr socket, and the
 * server listens on an ephemeral loopback port.
 */

const NO_CONFIG = '/nonexistent/kanhrd.config.yaml';

function policy(overrides: Parameters<typeof loadConfig>[0] = {}): OriginPolicy {
  return loadConfig({ configPath: NO_CONFIG, ...overrides }).origins;
}

let app: FastifyInstance | undefined;

async function startBridge(origins: OriginPolicy): Promise<string> {
  app = Fastify({ logger: false });
  const hosts = new HostRegistry([]);
  await registerWebSocket(app, hosts, origins);
  await registerRest(app, hosts, '/nonexistent/spa', origins);
  await app.listen({ host: '127.0.0.1', port: 0 });
  const address = app.server.address();
  if (address === null || typeof address === 'string') throw new Error('no ephemeral port');
  return `127.0.0.1:${address.port}`;
}

/** Resolves `'open'` when the upgrade succeeds, or the error text when it is
 * refused. A refused handshake never produces a socket, so nothing the
 * client sends can reach `dispatch`. */
function handshake(authority: string, headers: Record<string, string>): Promise<string> {
  return new Promise((resolvePromise) => {
    const socket = new WebSocket(`ws://${authority}/ws`, { headers });
    socket.on('open', () => {
      // If we got here the socket is live; prove the message loop is wired
      // by closing cleanly rather than leaking the connection.
      socket.close();
      resolvePromise('open');
    });
    socket.on('error', (err: Error) => resolvePromise(err.message));
  });
}

afterEach(async () => {
  await app?.close();
  app = undefined;
});

describe('/ws handshake origin allowlist', () => {
  // The allowlist is derived from the *configured* port, not the ephemeral
  // one the test server happens to listen on, so a default-config bridge
  // admits `http://localhost:5173` exactly as `make run` does.
  it('upgrades a handshake from a derived loopback origin', async () => {
    const authority = await startBridge(policy());
    expect(await handshake(authority, { origin: 'http://localhost:5173' })).toBe('open');
  });

  it('upgrades a handshake from a configured origin', async () => {
    const authority = await startBridge(policy({ allowedOrigins: ['https://kanhrd.example.com'] }));
    expect(await handshake(authority, { origin: 'https://kanhrd.example.com' })).toBe('open');
  });

  it('refuses a cross-site origin with 403 and creates no socket', async () => {
    const authority = await startBridge(policy());
    expect(await handshake(authority, { origin: 'https://evil.example' })).toMatch(/403/);
  });

  it('refuses the literal `Origin: null`', async () => {
    const authority = await startBridge(policy());
    expect(await handshake(authority, { origin: 'null' })).toMatch(/403/);
  });

  it('permits a handshake with no Origin header by default', async () => {
    const authority = await startBridge(policy());
    expect(await handshake(authority, {})).toBe('open');
  });

  it('refuses a handshake with no Origin header under --require-origin', async () => {
    const authority = await startBridge(policy({ requireOrigin: true }));
    expect(await handshake(authority, {})).toMatch(/403/);
  });

  it('permits every origin under --allow-any-origin', async () => {
    const authority = await startBridge(policy({ allowAnyOrigin: true }));
    expect(await handshake(authority, { origin: 'https://evil.example' })).toBe('open');
  });

  // The original hole: any page in the operator's browser could open this
  // socket and drive `pane.send_text`. A refused handshake yields no socket
  // at all, so there is nothing to send a dispatch verb down.
  it('gives a refused origin no socket to send a dispatch verb on', async () => {
    const authority = await startBridge(policy());
    const socket = new WebSocket(`ws://${authority}/ws`, {
      headers: { origin: 'https://evil.example' },
    });
    const outcome = await new Promise<string>((done) => {
      socket.on('open', () => done('open'));
      socket.on('error', () => done('refused'));
    });
    expect(outcome).toBe('refused');
    expect(socket.readyState).not.toBe(WebSocket.OPEN);
    const sendError = await new Promise<Error | undefined>((done) => {
      socket.send(JSON.stringify({ id: '1', method: 'pane.send_text' }), done);
    });
    expect(sendError).toBeInstanceOf(Error);
  });

  it('answers a refused handshake with a body that says nothing about why', async () => {
    const authority = await startBridge(policy());
    const res = await fetch(`http://${authority}/ws`, {
      headers: { origin: 'https://evil.example' },
    });
    expect(res.status).toBe(403);
    expect(res.headers.get('content-type')).toMatch(/application\/json/);
    expect(await res.json()).toEqual({ error: 'origin not allowed' });
  });

  it('refuses a cross-site origin on the REST routes too', async () => {
    const authority = await startBridge(policy());
    const res = await fetch(`http://${authority}/api/hosts`, {
      headers: { origin: 'https://evil.example' },
    });
    expect(res.status).toBe(403);
  });

  it('serves the REST routes for the SPA, which sends no Origin same-origin', async () => {
    const authority = await startBridge(policy({ requireOrigin: true }));
    const res = await fetch(`http://${authority}/api/hosts`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ hosts: [] });
  });
});
