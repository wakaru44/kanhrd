import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, type Server, type Socket } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { HostRuntime } from '../herdr/hosts.js';
import { RepoFileError } from './errors.js';

/**
 * The remote-host boundary, end to end through `HostRuntime`: a fake herdr
 * socket (the same newline-delimited JSON `hosts.test.ts` fakes) reports the
 * panes, and the bridge must decide from THEIR paths what it may read.
 *
 * `alpaca01` models a host reached through an SSH socket tunnel: its socket
 * is a local file, its paths are on another machine. The dangerous shape is
 * the second pane — a remote cwd that does not exist here but whose ancestor
 * on this machine IS a repository, so the `.git` walk projects the LOCAL
 * repository as the pane's checkout. Serving it would be the wrong machine's
 * file.
 */
const sandbox = realpathSync(mkdtempSync(join(tmpdir(), 'kanhrd-host-files-')));
const localRepo = join(sandbox, 'repo');
const servers: Server[] = [];
const runtimes: HostRuntime[] = [];

interface FakePane {
  pane_id: string;
  workspace_id: string;
  tab_id: string;
  agent_status: string;
  revision: number;
  cwd?: string;
}

async function fakeHerdr(
  name: string,
  panes: FakePane[],
  workspaces: unknown[] = []
): Promise<string> {
  const socketPath = join(sandbox, `${name}.sock`);
  const reply = (socket: Socket, id: string, result: unknown, end = true) => {
    socket.write(`${JSON.stringify({ id, ok: true, result })}\n`);
    if (end) socket.end();
  };
  const server = createServer((socket) => {
    let buffer = '';
    socket.setEncoding('utf8');
    socket.on('data', (chunk: string) => {
      buffer += chunk;
      const idx = buffer.indexOf('\n');
      if (idx === -1) return;
      const request = JSON.parse(buffer.slice(0, idx)) as { id: string; method: string };
      buffer = buffer.slice(idx + 1);
      if (request.method === 'workspace.list') return reply(socket, request.id, { workspaces });
      if (request.method === 'tab.list') return reply(socket, request.id, { tabs: [] });
      if (request.method === 'pane.list') return reply(socket, request.id, { panes });
      if (request.method === 'events.subscribe') return reply(socket, request.id, {}, false);
      return reply(socket, request.id, {});
    });
  });
  await new Promise<void>((resolve) => server.listen(socketPath, resolve));
  servers.push(server);
  return socketPath;
}

async function connected(runtime: HostRuntime): Promise<HostRuntime> {
  runtimes.push(runtime);
  runtime.start();
  const start = Date.now();
  while (!runtime.state().connected) {
    if (Date.now() - start > 2000) throw new Error('fake herdr never connected');
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  return runtime;
}

async function refusal(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (err) {
    if (err instanceof RepoFileError) return err.code;
    throw err;
  }
  throw new Error('expected a RepoFileError, got success');
}

let local: HostRuntime;
let alpaca: HostRuntime;
let disabled: HostRuntime;

beforeAll(async () => {
  execFileSync('git', ['init', '-q', localRepo]);
  mkdirSync(join(localRepo, 'src'));
  writeFileSync(join(localRepo, 'README.md'), 'the LOCAL machine\n');

  const base = { workspace_id: 'w1', tab_id: 't1', agent_status: 'idle', revision: 0 };
  local = await connected(
    new HostRuntime(
      {
        name: 'local',
        socket: await fakeHerdr('local', [{ ...base, pane_id: 'p1', cwd: join(localRepo, 'src') }]),
      },
      60_000
    )
  );
  alpaca = await connected(
    new HostRuntime(
      {
        name: 'alpaca01',
        socket: await fakeHerdr(
          'alpaca01',
          [
            { ...base, pane_id: 'remote', workspace_id: 'w2', cwd: '/home/huberito/src/kanhrd' },
            { ...base, pane_id: 'shadow', cwd: join(localRepo, 'only-on-alpaca01') },
            { ...base, pane_id: 'bare', workspace_id: 'w2' },
          ],
          [
            {
              workspace_id: 'w2',
              label: 'kanhrd',
              worktree: {
                repo_key: 'kanhrd',
                repo_name: 'kanhrd',
                repo_root: '/home/huberito/src/kanhrd',
                checkout_path: '/home/huberito/src/kanhrd',
                is_linked_worktree: false,
              },
            },
          ]
        ),
      },
      60_000
    )
  );
  disabled = await connected(
    new HostRuntime(
      {
        name: 'mirror',
        files: false,
        socket: await fakeHerdr('mirror', [
          { ...base, pane_id: 'p1', cwd: join(localRepo, 'src') },
        ]),
      },
      60_000
    )
  );
});

afterAll(async () => {
  for (const runtime of runtimes) runtime.stop();
  await Promise.all(servers.map((s) => new Promise((resolve) => s.close(resolve))));
  rmSync(sandbox, { recursive: true, force: true });
});

describe('a local host', () => {
  it('marks the pane files_local and serves its checkout', async () => {
    const [pane] = await local.listPanes();
    expect(pane?.project).toMatchObject({ checkout_path: localRepo, files_local: true });
    expect(await local.fileRead({ pane_id: 'p1', path: 'README.md' })).toMatchObject({
      content: 'the LOCAL machine\n',
    });
    expect((await local.repoStatus({ pane_id: 'p1' })).checkout_path).toBe(localRepo);
  });

  it('says pane_not_found for a pane herdr does not list', async () => {
    expect(await refusal(local.repoTree({ pane_id: 'nope' }))).toBe('pane_not_found');
  });
});

describe('a tunnelled host (alpaca01)', () => {
  it('never marks its panes files_local', async () => {
    const panes = await alpaca.listPanes();
    for (const pane of panes) expect(pane.project?.files_local).toBeUndefined();
    // The workspace fallback still projects the remote checkout path; it is
    // the flag, not the path, that is withheld.
    expect(panes.find((p) => p.id === 'bare')?.project?.checkout_path).toBe(
      '/home/huberito/src/kanhrd'
    );
  });

  it('refuses every method for a remote path that does not exist here', async () => {
    expect(await refusal(alpaca.repoStatus({ pane_id: 'remote' }))).toBe('files_not_local');
    expect(await refusal(alpaca.repoTree({ pane_id: 'remote' }))).toBe('files_not_local');
    expect(await refusal(alpaca.fileRead({ pane_id: 'remote', path: 'README.md' }))).toBe(
      'files_not_local'
    );
    expect(await refusal(alpaca.repoDiff({ pane_id: 'remote', path: 'README.md' }))).toBe(
      'files_not_local'
    );
  });

  it('does not serve the LOCAL repository a remote cwd walked up into', async () => {
    const shadow = (await alpaca.listPanes()).find((p) => p.id === 'shadow');
    // The projection DID resolve the local repository — that is the trap.
    expect(shadow?.project?.checkout_path).toBe(localRepo);
    expect(shadow?.project?.files_local).toBeUndefined();
    expect(await refusal(alpaca.fileRead({ pane_id: 'shadow', path: 'README.md' }))).toBe(
      'files_not_local'
    );
  });

  it('refuses a pane with no cwd whose checkout came from the workspace', async () => {
    expect(await refusal(alpaca.fileRead({ pane_id: 'bare', path: 'README.md' }))).toBe(
      'files_not_local'
    );
  });
});

describe('a host configured files: false', () => {
  it('refuses even though its paths exist locally', async () => {
    const [pane] = await disabled.listPanes();
    expect(pane?.project?.checkout_path).toBe(localRepo);
    expect(pane?.project?.files_local).toBeUndefined();
    expect(await refusal(disabled.fileRead({ pane_id: 'p1', path: 'README.md' }))).toBe(
      'files_not_local'
    );
  });
});
