import { spawn } from 'node:child_process';
import { INT_HANDOFF_SCOPE } from './global-setup.js';
import { readHandoff, type SeededWorld } from './herdr-session.js';

/**
 * Thin wrapper around the local `herdr` CLI, used so integration tests can
 * drive/verify real herdr state independently of the bridge under test
 * (e.g. "did the bridge actually reach herdr", "did the pane really receive
 * this text", "did the tab really get created/renamed/closed").
 *
 * **Every call is scoped to the run's throwaway session.** `herdr()` prefixes
 * `--session <name>` and throws if no session handoff exists, so there is no
 * code path from this module to the operator's default socket at
 * `~/.config/herdr/herdr.sock`. Session management itself lives in
 * `herdr-session.ts`, which is the only module allowed to call `herdr`
 * un-targeted.
 *
 * Deliberately mirrors `apps/web/e2e/fixtures/herdr.ts`'s surface (same
 * function names/shapes for the parts that overlap) rather than importing
 * it — Playwright fixtures are TS-project-scoped to `apps/web`, and this
 * package has its own tsconfig/test runner. Keeping the surface identical
 * makes a future extraction to a shared package (if both suites keep
 * growing) a mechanical move instead of a rewrite.
 */
export interface HerdrResult {
  stdout: string;
  stderr: string;
  code: number | null;
}

/**
 * The run's session name, from the handoff written by `global-setup.ts`.
 * Throws when there is none — the suite must never guess.
 */
export function testSessionName(): string {
  const handoff = readHandoff(INT_HANDOFF_SCOPE);
  if (!handoff.session) {
    throw new Error(handoff.unavailable ?? 'no isolated herdr session for this run');
  }
  return handoff.session.name;
}

/** The socket the run's bridge must be pointed at. */
export function testSessionSocket(): string {
  const handoff = readHandoff(INT_HANDOFF_SCOPE);
  if (!handoff.session) {
    throw new Error(handoff.unavailable ?? 'no isolated herdr session for this run');
  }
  return handoff.session.socket;
}

/** The workspace/tab/panes `global-setup.ts` seeded into the run's session. */
export function seededWorld(): SeededWorld {
  const handoff = readHandoff(INT_HANDOFF_SCOPE);
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

export interface HerdrTabSummary {
  tab_id: string;
  workspace_id: string;
  label: string;
}

export interface HerdrWorkspaceSummary {
  workspace_id: string;
  label: string;
}

/** `herdr pane list` — parses the JSON-RPC-shaped stdout into the pane array. */
export async function herdrPaneList(): Promise<HerdrPaneSummary[]> {
  const { stdout, code } = await herdr(['pane', 'list']);
  if (code !== 0) return [];
  const parsed = JSON.parse(stdout) as { result?: { panes?: HerdrPaneSummary[] } };
  return parsed.result?.panes ?? [];
}

/** `herdr tab list`. */
export async function herdrTabList(): Promise<HerdrTabSummary[]> {
  const { stdout, code } = await herdr(['tab', 'list']);
  if (code !== 0) return [];
  const parsed = JSON.parse(stdout) as { result?: { tabs?: HerdrTabSummary[] } };
  return parsed.result?.tabs ?? [];
}

/** `herdr workspace list`. */
export async function herdrWorkspaceList(): Promise<HerdrWorkspaceSummary[]> {
  const { stdout, code } = await herdr(['workspace', 'list']);
  if (code !== 0) return [];
  const parsed = JSON.parse(stdout) as { result?: { workspaces?: HerdrWorkspaceSummary[] } };
  return parsed.result?.workspaces ?? [];
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

/** `herdr pane send-text <id> <text>` — types text into the real pane, bypassing the bridge. */
export async function herdrPaneSendText(paneId: string, text: string): Promise<void> {
  await herdr(['pane', 'send-text', paneId, text]);
}

/** `herdr pane send-keys <id> <key...>` — sends named keys (e.g. "Enter", "Backspace") to the real pane. */
export async function herdrPaneSendKeys(paneId: string, keys: string[]): Promise<void> {
  await herdr(['pane', 'send-keys', paneId, ...keys]);
}

/** `herdr pane split <target-pane-id> --direction <right|down>` — returns the new pane's id, or undefined on failure. */
export async function herdrPaneSplit(
  targetPaneId: string,
  direction: 'right' | 'down' = 'right'
): Promise<string | undefined> {
  const { stdout, code } = await herdr([
    'pane',
    'split',
    targetPaneId,
    '--direction',
    direction,
    '--no-focus',
  ]);
  if (code !== 0) return undefined;
  const parsed = JSON.parse(stdout) as { result?: { pane?: { pane_id?: string } } };
  return parsed.result?.pane?.pane_id;
}

/** `herdr pane close <id>` — best-effort, swallows failure (id may already be gone). */
export async function herdrPaneClose(paneId: string): Promise<void> {
  await herdr(['pane', 'close', paneId]);
}

/** `herdr tab create --workspace <id> --label <label> --no-focus` — returns the new tab's id, or undefined on failure. */
export async function herdrTabCreate(
  workspaceId: string,
  label: string
): Promise<string | undefined> {
  const { stdout, code } = await herdr([
    'tab',
    'create',
    '--workspace',
    workspaceId,
    '--label',
    label,
    '--no-focus',
  ]);
  if (code !== 0) return undefined;
  const parsed = JSON.parse(stdout) as { result?: { tab?: { tab_id?: string } } };
  return parsed.result?.tab?.tab_id;
}

/** `herdr tab close <id>` — best-effort, swallows failure (id may already be gone). */
export async function herdrTabClose(tabId: string): Promise<void> {
  await herdr(['tab', 'close', tabId]);
}

/**
 * Pre-flight guard: reports whether this run has an isolated herdr session
 * to work against. It deliberately does NOT ask whether the operator has
 * panes open — the run seeds its own world (`seedSession()`), so "the
 * operator left a pane open" stopped being a precondition when this suite
 * stopped using the operator's herdr.
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
  return { ok: true };
}
