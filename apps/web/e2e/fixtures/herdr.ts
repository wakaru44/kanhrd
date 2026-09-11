import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Thin wrapper around the local `herdr` CLI, used so tests can verify state
 * independently of the bridge/browser (e.g. "did the bridge actually reach
 * herdr", "did the pane really receive this text").
 *
 * **Every call is scoped to the run's throwaway herdr session.** The session
 * is created, seeded and disposed of by `fixtures/isolated-bridge.mjs` — the
 * Playwright `webServer` — which leaves a handoff file naming it. `herdr()`
 * prefixes `--session <name>` and throws when there is no handoff, so this
 * module has no code path to the operator's default socket at
 * `~/.config/herdr/herdr.sock`.
 *
 * Before `add-test-herdr-isolation` this file drove whatever herdr happened
 * to be running: on 2026-09-10 a suite run typed `echo <marker>` into the
 * operator's real panes, including one running an agent, which executed it
 * as a prompt. The panes these helpers touch are now disposable by
 * construction, which is what retired that risk — the opt-in variable that
 * used to guard it did not, and could not.
 *
 * Assumes `herdr` is on PATH (installed at /opt/homebrew/bin/herdr in the
 * dev/CI environment this suite targets).
 */
export interface HerdrResult {
  stdout: string;
  stderr: string;
  code: number | null;
}

export interface SeededWorld {
  workspaceId: string;
  tabId: string;
  /** Two bare shell panes, in creation order. */
  paneIds: string[];
}

interface SessionHandoff {
  session?: { name: string; socket: string };
  world?: SeededWorld;
  /** Set instead of `session` when herdr is unreachable: the skip reason. */
  unavailable?: string;
}

const HANDOFF_PATH = join(tmpdir(), 'kanhrd-test-herdr', 'e2e.json');

function readHandoff(): SessionHandoff {
  let raw: string;
  try {
    raw = readFileSync(HANDOFF_PATH, 'utf8');
  } catch {
    throw new Error(
      `no isolated herdr session for this run (expected ${HANDOFF_PATH}). ` +
        "This suite refuses to fall back to the operator's default herdr socket. " +
        'Run it through `pnpm --filter @kanhrd/web test:e2e` so the webServer launcher ' +
        '(e2e/fixtures/isolated-bridge.mjs) starts the session first.'
    );
  }
  return JSON.parse(raw) as SessionHandoff;
}

/** The run's session name. Throws when there is none — never guesses. */
export function testSessionName(): string {
  const handoff = readHandoff();
  if (!handoff.session) {
    throw new Error(handoff.unavailable ?? 'no isolated herdr session for this run');
  }
  return handoff.session.name;
}

/** The workspace/tab/panes the launcher seeded into the run's session. */
export function seededWorld(): SeededWorld {
  const handoff = readHandoff();
  if (!handoff.world) {
    throw new Error(handoff.unavailable ?? "the run's herdr session was never seeded");
  }
  return handoff.world;
}

export function herdr(args: string[]): Promise<HerdrResult> {
  const session = testSessionName();
  return new Promise((resolvePromise, reject) => {
    const proc = spawn('herdr', ['--session', session, ...args], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (chunk: Buffer) => (stdout += chunk.toString('utf8')));
    proc.stderr.on('data', (chunk: Buffer) => (stderr += chunk.toString('utf8')));
    proc.on('error', reject);
    proc.on('close', (code) => resolvePromise({ stdout, stderr, code }));
  });
}

export interface HerdrPaneSummary {
  pane_id: string;
  workspace_id: string;
  tab_id: string;
  agent_status: string;
}

/** `herdr pane list` — parses the JSON-RPC-shaped stdout into the pane array. */
export async function herdrPaneList(): Promise<HerdrPaneSummary[]> {
  const { stdout, code } = await herdr(['pane', 'list']);
  if (code !== 0) {
    return [];
  }
  const parsed = JSON.parse(stdout) as { result?: { panes?: HerdrPaneSummary[] } };
  return parsed.result?.panes ?? [];
}

/** `herdr pane read <id>` — returns the raw text content of the pane (detection-friendly format). */
export async function herdrPaneRead(paneId: string): Promise<string> {
  const { stdout } = await herdr([
    'pane',
    'read',
    paneId,
    '--format',
    'text',
    '--source',
    'recent',
  ]);
  return stdout;
}

/** `herdr pane send-text <id> <text>` — types text into the real pane, bypassing the bridge/browser. */
export async function herdrPaneSendText(paneId: string, text: string): Promise<void> {
  await herdr(['pane', 'send-text', paneId, text]);
}

/** `herdr pane send-keys <id> <key...>` — sends named keys (e.g. "Enter", "Backspace") to the real pane. */
export async function herdrPaneSendKeys(paneId: string, keys: string[]): Promise<void> {
  await herdr(['pane', 'send-keys', paneId, ...keys]);
}

/**
 * Pre-flight guard: confirms this run has its own isolated herdr session with
 * seeded panes, so a machine with no herdr gets a clear skip message instead
 * of confusing selector timeouts. Call from a `test.beforeAll` and
 * `test.skip(!ok, message)`.
 *
 * It no longer asks whether the operator has panes open — the run seeds its
 * own — and it no longer asks for consent, because there is nothing of the
 * operator's left to consent to.
 */
export async function herdrAvailable(): Promise<{ ok: true } | { ok: false; reason: string }> {
  let session: string;
  try {
    session = testSessionName();
  } catch (err) {
    return { ok: false, reason: (err as Error).message };
  }
  const { code, stderr } = await herdr(['pane', 'list']);
  if (code !== 0) {
    return {
      ok: false,
      reason: `isolated herdr session "${session}" unreachable: ${stderr || `exit ${code}`}`,
    };
  }
  const panes = await herdrPaneList();
  if (panes.length === 0) {
    return {
      ok: false,
      reason: `isolated herdr session "${session}" has no seeded panes; the webServer launcher failed to seed it`,
    };
  }
  return { ok: true };
}
