import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

/**
 * Throwaway herdr sessions — the isolation primitive the whole
 * `add-test-herdr-isolation` change rests on.
 *
 * herdr sessions are isolated by socket. The facts below were established
 * experimentally against herdr 0.8.2 on 2026-09-11 and are what every
 * helper here encodes:
 *
 *   $ herdr --session kanhrd-test-probe1 server      # headless, no TTY
 *   herdr server running; you can use any herdr CLI command in another terminal.
 *   api socket: ~/.config/herdr/sessions/kanhrd-test-probe1/herdr.sock
 *
 *   $ herdr --session kanhrd-test-probe1 workspace create --label … --cwd …
 *   {"result":{"root_pane":{"pane_id":"w1:p1",…},"workspace":{"workspace_id":"w1"}}}
 *
 *   $ herdr session stop kanhrd-test-probe1 && herdr session delete kanhrd-test-probe1
 *   stopped session kanhrd-test-probe1
 *   deleted session kanhrd-test-probe1
 *   # ~/.config/herdr/sessions/ is empty afterwards; `session list` shows only `default`
 *
 * A fresh named session starts with **zero** workspaces, tabs and panes, so
 * a suite that needs any must seed them (`seedSession()`), and a suite's
 * assertions can therefore be about panes it created rather than about
 * whatever the operator happened to leave open.
 */

/**
 * Every session this repo's suites create carries this prefix. It is what
 * makes a leaked session recognisable to the next run's sweep, and it is
 * the only thing `disposeTestSession()` will ever act on.
 */
export const TEST_SESSION_PREFIX = 'kanhrd-test-';

/** The operator's live session. Nothing here may ever address it. */
export const DEFAULT_HERDR_SOCKET = resolve(homedir(), '.config/herdr/herdr.sock');

const START_TIMEOUT_MS = 15_000;

export interface HerdrSessionRow {
  name: string;
  status: string;
  directory: string;
  socket: string;
}

export interface TestSession {
  name: string;
  socket: string;
}

/** Raw, un-targeted `herdr …`. Only session management may use this. */
function herdrRaw(
  args: string[]
): Promise<{ stdout: string; stderr: string; code: number | null }> {
  return new Promise((resolvePromise) => {
    const proc = spawn('herdr', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (c: Buffer) => (stdout += c.toString('utf8')));
    proc.stderr.on('data', (c: Buffer) => (stderr += c.toString('utf8')));
    proc.on('error', (err) => resolvePromise({ stdout, stderr: String(err), code: 127 }));
    proc.on('close', (code) => resolvePromise({ stdout, stderr, code }));
  });
}

/**
 * Refuses any socket that is not inside a `kanhrd-test-` session directory.
 *
 * This is the load-bearing guard: every path that could plausibly be handed
 * the default socket (a stale handoff file, a mis-parsed `session list`, a
 * config generated before the session existed) runs through here first, so
 * the failure mode is a thrown error rather than a suite quietly typing into
 * the operator's terminals.
 */
export function assertIsolatedSocket(socket: string): string {
  if (socket === DEFAULT_HERDR_SOCKET) {
    throw new Error(
      `refusing to use the operator's default herdr socket (${socket}); tests must run against a ${TEST_SESSION_PREFIX}* session`
    );
  }
  if (!socket.includes(`/sessions/${TEST_SESSION_PREFIX}`)) {
    throw new Error(
      `refusing to use herdr socket "${socket}": not inside a ${TEST_SESSION_PREFIX}* session directory`
    );
  }
  return socket;
}

/** `herdr session list`, parsed. Columns are whitespace-separated. */
export async function listSessions(): Promise<HerdrSessionRow[]> {
  const { stdout, code } = await herdrRaw(['session', 'list']);
  if (code !== 0) return [];
  return stdout
    .split('\n')
    .slice(1) // header row: name status directory socket
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.split(/\s+/))
    .filter((cols) => cols.length >= 4)
    .map(([name, status, directory, socket]) => ({ name, status, directory, socket }));
}

/**
 * Stops and deletes one session. Refuses anything without the test prefix,
 * so a bad name can never take the operator's `default` session down.
 */
export async function disposeTestSession(name: string): Promise<void> {
  if (!name.startsWith(TEST_SESSION_PREFIX)) {
    throw new Error(`refusing to dispose session "${name}": not a ${TEST_SESSION_PREFIX}* session`);
  }
  await herdrRaw(['session', 'stop', name]);
  await herdrRaw(['session', 'delete', name]);
}

/**
 * Disposes of every `kanhrd-test-*` session left behind by a run that died
 * before its teardown. Called before a run starts its own session; returns
 * the names it swept so the caller can log them.
 */
export async function sweepLeakedSessions(): Promise<string[]> {
  const leaked = (await listSessions())
    .map((s) => s.name)
    .filter((name) => name.startsWith(TEST_SESSION_PREFIX));
  for (const name of leaked) await disposeTestSession(name);
  return leaked;
}

/**
 * Sweeps leaks, then starts `<name>` headlessly and resolves once its socket
 * answers. Rejects (never falls back) if herdr is absent or the session
 * refuses to come up.
 */
export async function startTestSession(name: string): Promise<TestSession> {
  if (!name.startsWith(TEST_SESSION_PREFIX)) {
    throw new Error(`test session name must start with "${TEST_SESSION_PREFIX}": got "${name}"`);
  }
  await sweepLeakedSessions();

  const proc = spawn('herdr', ['--session', name, 'server'], {
    stdio: 'ignore',
    detached: true,
  });
  proc.unref();

  const deadline = Date.now() + START_TIMEOUT_MS;
  let lastError = 'herdr session never became reachable';
  while (Date.now() < deadline) {
    const row = (await listSessions()).find((s) => s.name === name);
    if (row?.status === 'running') {
      const socket = assertIsolatedSocket(row.socket);
      if (existsSync(socket)) {
        const probe = await herdrRaw(['--session', name, 'pane', 'list']);
        if (probe.code === 0) return { name, socket };
        lastError = probe.stderr || `pane list exited ${probe.code}`;
      }
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  await disposeTestSession(name).catch(() => undefined);
  throw new Error(
    `herdr session "${name}" did not start within ${START_TIMEOUT_MS}ms: ${lastError}`
  );
}

export interface SeededWorld {
  workspaceId: string;
  tabId: string;
  /** Two bare shell panes, in creation order. `pane.split` gives the second. */
  paneIds: string[];
}

/**
 * Seeds the world the suites assert against: one workspace whose root pane's
 * cwd is inside this repository (the bridge derives `Pane.project` from the
 * pane's own cwd via a `.git` walk), plus a second pane so files that want
 * two independent panes get them.
 *
 * Bare shells on purpose — see the proposal's Q3. kanhrd renders what the
 * wire reports; herdr's agent detection is herdr's contract, not this
 * suite's to re-prove.
 */
export async function seedSession(name: string, cwd: string): Promise<SeededWorld> {
  const created = await herdrRaw([
    '--session',
    name,
    'workspace',
    'create',
    '--label',
    'kanhrd-test',
    '--cwd',
    cwd,
    '--no-focus',
  ]);
  if (created.code !== 0) {
    throw new Error(`could not seed workspace in session "${name}": ${created.stderr}`);
  }
  const parsed = JSON.parse(created.stdout) as {
    result?: {
      workspace?: { workspace_id: string };
      root_pane?: { pane_id: string; tab_id: string };
    };
  };
  const workspaceId = parsed.result?.workspace?.workspace_id;
  const rootPane = parsed.result?.root_pane;
  if (!workspaceId || !rootPane) {
    throw new Error(`unexpected workspace.create reply while seeding: ${created.stdout}`);
  }

  const split = await herdrRaw([
    '--session',
    name,
    'pane',
    'split',
    rootPane.pane_id,
    '--direction',
    'right',
    '--no-focus',
  ]);
  const secondPaneId =
    split.code === 0
      ? (JSON.parse(split.stdout) as { result?: { pane?: { pane_id?: string } } }).result?.pane
          ?.pane_id
      : undefined;

  return {
    workspaceId,
    tabId: rootPane.tab_id,
    paneIds: secondPaneId ? [rootPane.pane_id, secondPaneId] : [rootPane.pane_id],
  };
}

/* -------------------------------------------------------------------------
 * Handoff — how a run tells its own test workers which session to address.
 *
 * A file rather than an environment variable because the consumers sit in
 * different processes with different launchers (vitest workers, a Playwright
 * `webServer` child, the browser-side specs). Its **absence** is meaningful:
 * a herdr helper with no handoff throws rather than falling through to the
 * default socket, which is what makes the isolation provable instead of
 * merely intended.
 * ---------------------------------------------------------------------- */

export interface SessionHandoff {
  session?: TestSession;
  world?: SeededWorld;
  /** Set instead of `session` when herdr is unreachable: the skip reason. */
  unavailable?: string;
}

export function handoffPath(scope: string): string {
  return join(tmpdir(), 'kanhrd-test-herdr', `${scope}.json`);
}

export function writeHandoff(scope: string, handoff: SessionHandoff): void {
  const path = handoffPath(scope);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(handoff, null, 2));
}

export function clearHandoff(scope: string): void {
  rmSync(handoffPath(scope), { force: true });
}

/** Reads the run's handoff, or throws with the reason it cannot be trusted. */
export function readHandoff(scope: string): SessionHandoff {
  const path = handoffPath(scope);
  let raw: string;
  try {
    raw = readFileSync(path, 'utf8');
  } catch {
    throw new Error(
      `no isolated herdr session for this run (expected ${path}). ` +
        "This suite refuses to fall back to the operator's default herdr socket. " +
        'Run it through its own entry point (`pnpm test:int` / `pnpm test:e2e`) so the session fixture starts first.'
    );
  }
  const handoff = JSON.parse(raw) as SessionHandoff;
  if (handoff.session) assertIsolatedSocket(handoff.session.socket);
  return handoff;
}
