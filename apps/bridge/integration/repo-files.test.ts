import { realpathSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startBridge, waitForHostConnected, type RunningBridge } from './fixtures/bridge.js';
import { IntegrationClient } from './fixtures/ws-client.js';
import { seededWorld } from './fixtures/herdr-cli.js';
import { requireHerdrOrSkipReason } from './fixtures/require-herdr.js';

/**
 * G. Repo file reads through the real bridge and the run's own
 * `kanhrd-test-*` herdr session.
 *
 * `global-setup.ts` seeds the session's panes with this repository as their
 * cwd, so the checkout under test is kanhrd itself — read, never written.
 * The wrong-machine case needs a herdr reporting paths from another machine,
 * which one local session cannot; `src/files/host-files.test.ts` covers it
 * against a fake herdr socket.
 */
const REPO_ROOT = realpathSync(resolve(dirname(fileURLToPath(import.meta.url)), '../../..'));

describe('G. repo file reads', () => {
  let skipReason: string | undefined;
  let bridge: RunningBridge;
  let client: IntegrationClient;
  let paneId: string;

  beforeAll(async () => {
    skipReason = await requireHerdrOrSkipReason();
    if (skipReason) return;
    bridge = await startBridge();
    await waitForHostConnected(bridge, 'local');
    client = await IntegrationClient.connect(bridge.wsUrl);
    paneId = seededWorld().paneIds[0];
  });

  afterAll(async () => {
    client?.close();
    await bridge?.stop();
  });

  it('G1. bridge.capabilities advertises repoFiles with its caps', async (ctx) => {
    if (skipReason) return ctx.skip();
    const data = await client.call('local', 'bridge.capabilities', {});
    expect(data.repoFiles).toMatchObject({
      statusPollIntervalMs: expect.any(Number),
      fileReadMaxBytes: expect.any(Number),
      diffMaxBytes: expect.any(Number),
      treeMaxEntries: expect.any(Number),
      statusMaxEntries: expect.any(Number),
    });
  });

  it('G2. a pane whose checkout is on this machine is marked files_local', async (ctx) => {
    if (skipReason) return ctx.skip();
    const { panes } = await client.call('local', 'pane.list', {});
    const pane = panes.find((p) => p.id === paneId);
    expect(pane?.project).toMatchObject({ checkout_path: REPO_ROOT, files_local: true });
  });

  it('G3. repo.status reports the checkout, a branch and an entry list', async (ctx) => {
    if (skipReason) return ctx.skip();
    const data = await client.call('local', 'repo.status', { pane_id: paneId });
    expect(data.checkout_path).toBe(REPO_ROOT);
    expect(Array.isArray(data.entries)).toBe(true);
    expect(typeof data.truncated).toBe('boolean');
  });

  it('G4. repo.tree lists one level of the checkout without .git', async (ctx) => {
    if (skipReason) return ctx.skip();
    const root = await client.call('local', 'repo.tree', { pane_id: paneId });
    expect(root.path).toBe('');
    const names = root.entries.map((e) => e.name);
    expect(names).toContain('apps');
    expect(names).not.toContain('.git');
    expect(root.entries.every((e) => !e.path.includes('/'))).toBe(true);
    const nodeModules = root.entries.find((e) => e.name === 'node_modules');
    if (nodeModules) expect(nodeModules.ignored).toBe(true);

    const apps = await client.call('local', 'repo.tree', { pane_id: paneId, path: 'apps' });
    expect(apps.entries.map((e) => e.path)).toContain('apps/bridge');
  });

  it('G5. file.read returns UTF-8 text for a file in the checkout', async (ctx) => {
    if (skipReason) return ctx.skip();
    const data = await client.call('local', 'file.read', {
      pane_id: paneId,
      path: 'apps/bridge/package.json',
    });
    expect(data.binary).toBe(false);
    if (!data.binary) {
      expect(data.encoding).toBe('utf-8');
      expect(JSON.parse(data.content)).toMatchObject({ name: '@kanhrd/bridge' });
    }
  });

  it('G6. repo.diff answers for a tracked path', async (ctx) => {
    if (skipReason) return ctx.skip();
    const data = await client.call('local', 'repo.diff', { pane_id: paneId, path: 'README.md' });
    expect(data.path).toBe('README.md');
    expect(['unchanged', 'modified']).toContain(data.change);
  });

  it('G7. confinement and pane errors reach the client as codes', async (ctx) => {
    if (skipReason) return ctx.skip();
    const code = async (method: 'file.read' | 'repo.tree', params: Record<string, unknown>) => {
      const res = await client.request('local', method, params as never);
      return res.ok ? 'ok' : res.error.code;
    };
    expect(await code('file.read', { pane_id: paneId, path: '../outside' })).toBe(
      'path_outside_checkout'
    );
    expect(await code('file.read', { pane_id: paneId, path: '/etc/hosts' })).toBe(
      'path_outside_checkout'
    );
    expect(await code('file.read', { pane_id: paneId, path: '.git/config' })).toBe(
      'path_outside_checkout'
    );
    expect(await code('repo.tree', { pane_id: 'w999:p999' })).toBe('pane_not_found');
  });
});
