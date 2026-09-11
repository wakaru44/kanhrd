/**
 * Playwright's `webServer` entry point: the bridge under test, and nothing
 * the operator owns.
 *
 * Playwright starts `webServer` *before* `globalSetup` (see
 * `createGlobalSetupTasks()` in playwright's runner — plugin setup tasks run
 * first), so the run's herdr session cannot be started from a global setup
 * hook and handed to an already-running bridge. This launcher therefore owns
 * the whole lifecycle:
 *
 *   1. sweep any `kanhrd-test-*` session a crashed run leaked;
 *   2. start this run's own headless session and seed a workspace + panes;
 *   3. write the handoff `e2e/fixtures/herdr.ts` reads, and a bridge config
 *      naming that session's socket;
 *   4. spawn the bridge with `--config`, and dispose of the session on exit.
 *
 * When herdr is missing or a session refuses to start, it still serves the
 * SPA — against a socket path that deliberately does not exist — and records
 * the reason in the handoff. The mocked specs (`page.route`-backed) then run
 * and pass; the live specs skip with that reason. That is the proposal's Q2,
 * enforced by construction: there is no configuration of this file that
 * points the bridge at `~/.config/herdr/herdr.sock`.
 *
 * Plain `.mjs` rather than TypeScript because `webServer.command` is a shell
 * command and `tsx` is not resolvable from `apps/web`.
 */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const FIXTURES_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(FIXTURES_DIR, '../../../..');

const TEST_SESSION_PREFIX = 'kanhrd-test-';
const SESSION_NAME = 'kanhrd-test-e2e';
const DEFAULT_HERDR_SOCKET = resolve(homedir(), '.config/herdr/herdr.sock');
/** Deliberately absent: the bridge connects to nothing and reports it. */
const NONEXISTENT_SOCKET = join(tmpdir(), 'kanhrd-e2e-nonexistent.sock');

const HANDOFF_DIR = join(tmpdir(), 'kanhrd-test-herdr');
const HANDOFF_PATH = join(HANDOFF_DIR, 'e2e.json');
const CONFIG_PATH = join(HANDOFF_DIR, 'e2e-bridge.config.yaml');

const PORT = process.env.KANHRD_E2E_PORT ?? '5273';

function herdr(args) {
  return spawnSync('herdr', args, { encoding: 'utf8' });
}

function assertIsolatedSocket(socket) {
  if (socket === DEFAULT_HERDR_SOCKET) {
    throw new Error(`refusing the operator's default herdr socket (${socket})`);
  }
  if (!socket.includes(`/sessions/${TEST_SESSION_PREFIX}`)) {
    throw new Error(`refusing herdr socket "${socket}": not a ${TEST_SESSION_PREFIX}* session`);
  }
  return socket;
}

function listSessions() {
  const { stdout, status } = herdr(['session', 'list']);
  if (status !== 0 || !stdout) return [];
  return stdout
    .split('\n')
    .slice(1)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.split(/\s+/))
    .filter((cols) => cols.length >= 4)
    .map(([name, status_, directory, socket]) => ({ name, status: status_, directory, socket }));
}

function disposeSession(name) {
  if (!name.startsWith(TEST_SESSION_PREFIX)) {
    throw new Error(`refusing to dispose session "${name}": not a ${TEST_SESSION_PREFIX}* session`);
  }
  herdr(['session', 'stop', name]);
  herdr(['session', 'delete', name]);
}

function sweepLeakedSessions() {
  const leaked = listSessions()
    .map((s) => s.name)
    .filter((name) => name.startsWith(TEST_SESSION_PREFIX));
  for (const name of leaked) disposeSession(name);
  return leaked;
}

async function startSession() {
  const version = herdr(['--version']);
  if (version.status !== 0) {
    throw new Error('the `herdr` CLI is not on PATH');
  }
  sweepLeakedSessions();
  const server = spawn('herdr', ['--session', SESSION_NAME, 'server'], {
    stdio: 'ignore',
    detached: true,
  });
  server.unref();

  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const row = listSessions().find((s) => s.name === SESSION_NAME);
    if (row?.status === 'running' && existsSync(row.socket)) {
      assertIsolatedSocket(row.socket);
      if (herdr(['--session', SESSION_NAME, 'pane', 'list']).status === 0) {
        return { name: SESSION_NAME, socket: row.socket };
      }
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  disposeSession(SESSION_NAME);
  throw new Error(`herdr session "${SESSION_NAME}" did not start within 15s`);
}

/**
 * One workspace whose root pane's cwd is this repository (the bridge derives
 * `Pane.project` from each pane's own cwd via a `.git` walk), plus a second
 * pane. Bare shells — see the proposal's Q3.
 */
function seedSession(name) {
  const created = herdr([
    '--session',
    name,
    'workspace',
    'create',
    '--label',
    'kanhrd-test',
    '--cwd',
    REPO_ROOT,
    '--no-focus',
  ]);
  if (created.status !== 0) throw new Error(`could not seed workspace: ${created.stderr}`);
  const { result } = JSON.parse(created.stdout);
  const rootPane = result?.root_pane;
  const workspaceId = result?.workspace?.workspace_id;
  if (!rootPane || !workspaceId)
    throw new Error(`unexpected workspace.create reply: ${created.stdout}`);

  const split = herdr([
    '--session',
    name,
    'pane',
    'split',
    rootPane.pane_id,
    '--direction',
    'right',
    '--no-focus',
  ]);
  const second = split.status === 0 ? JSON.parse(split.stdout).result?.pane?.pane_id : undefined;

  return {
    workspaceId,
    tabId: rootPane.tab_id,
    paneIds: second ? [rootPane.pane_id, second] : [rootPane.pane_id],
  };
}

function writeFiles(handoff, socket) {
  mkdirSync(HANDOFF_DIR, { recursive: true });
  writeFileSync(HANDOFF_PATH, JSON.stringify(handoff, null, 2));
  writeFileSync(CONFIG_PATH, `port: ${PORT}\nhosts:\n  - name: local\n    socket: ${socket}\n`);
}

let session;
let handoff;
let socket;
try {
  session = await startSession();
  handoff = { session, world: seedSession(session.name) };
  socket = session.socket;
  console.error(
    `[e2e] isolated herdr session "${session.name}" at ${socket} ` +
      `(workspace ${handoff.world.workspaceId}, panes ${handoff.world.paneIds.join(', ')})`
  );
} catch (err) {
  session = undefined;
  socket = NONEXISTENT_SOCKET;
  handoff = { unavailable: `no isolated herdr session available: ${err.message}` };
  console.warn(`[e2e] ${handoff.unavailable} — live specs will skip; mocked specs run normally`);
}
writeFiles(handoff, socket);

const bridge = spawn(
  'node',
  [resolve(FIXTURES_DIR, '../../../bridge/dist/main.js'), '--config', CONFIG_PATH],
  // stdout swallowed: the bridge's pino log would drown the test report.
  // stderr is inherited so a bridge crash is still visible.
  { stdio: ['ignore', 'ignore', 'inherit'] }
);

let disposed = false;
function dispose() {
  if (disposed) return;
  disposed = true;
  rmSync(HANDOFF_PATH, { force: true });
  if (session) {
    try {
      disposeSession(session.name);
    } catch {
      /* the next run's sweep is the backstop */
    }
  }
}

for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  process.on(signal, () => {
    bridge.kill(signal);
    dispose();
    process.exit(0);
  });
}
bridge.on('exit', (code) => {
  dispose();
  process.exit(code ?? 0);
});
