import { spawn } from 'node:child_process';

/**
 * Thin wrapper around the local `herdr` CLI, used so tests can verify state
 * independently of the bridge/browser (e.g. "did the bridge actually reach
 * herdr", "did the pane really receive this text"). Mirrors the pattern
 * L5B used for tier-2 validation (see tmp/foreman/VALIDATION-TIER2.md).
 *
 * Assumes `herdr` is on PATH (installed at /opt/homebrew/bin/herdr in the
 * dev/CI environment this suite targets).
 */
export interface HerdrResult {
  stdout: string;
  stderr: string;
  code: number | null;
}

export function herdr(args: string[]): Promise<HerdrResult> {
  return new Promise((resolvePromise, reject) => {
    const proc = spawn('herdr', args, { stdio: ['ignore', 'pipe', 'pipe'] });
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
 * Opt-in switch for every spec that drives a real herdr.
 *
 * These specs do not use a fixture or a sandbox: they call the `herdr` CLI
 * against whatever server is running on this machine, pick a pane out of
 * `herdr pane list`, and type into it. On a developer's own machine that is
 * their live session — on 2026-09-10 a suite run typed `echo <marker>` into
 * the operator's real panes, including the one running an agent, which
 * executed it as a prompt. Reachability is therefore NOT consent: a herdr
 * being up says nothing about whether its panes are yours to type into.
 *
 * Set `KANHRD_E2E_LIVE_HERDR=1` to opt in, and only against a herdr you are
 * willing to have typed into. Mirrors how the bridge's integration suite
 * gates on `KANHRD_INT_HERDR_SOCKET`.
 */
export const LIVE_HERDR_OPT_IN = 'KANHRD_E2E_LIVE_HERDR';

/**
 * Pre-flight guard: confirms the operator has opted in AND that a local herdr
 * server is reachable with at least one pane, so a dev/CI environment gets a
 * clear skip message instead of confusing selector timeouts — or, worse, a
 * suite silently typing into someone's live terminals. Call from a
 * `test.beforeAll` and `test.skip(!ok, message)`.
 */
export async function herdrAvailable(): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (process.env[LIVE_HERDR_OPT_IN] !== '1') {
    return {
      ok: false,
      reason:
        `these specs type into a real herdr pane; set ${LIVE_HERDR_OPT_IN}=1 to opt in, ` +
        'and only against a herdr whose panes you are willing to have typed into',
    };
  }
  const { code, stderr } = await herdr(['pane', 'list']);
  if (code !== 0) {
    return {
      ok: false,
      reason: `herdr CLI unavailable or server unreachable: ${stderr || `exit ${code}`}`,
    };
  }
  const panes = await herdrPaneList();
  if (panes.length === 0) {
    return {
      ok: false,
      reason: 'herdr server reachable but has zero panes; open at least one pane to run this suite',
    };
  }
  return { ok: true };
}
