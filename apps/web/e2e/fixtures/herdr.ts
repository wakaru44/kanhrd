import { spawn } from "node:child_process";

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
    const proc = spawn("herdr", args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (chunk: Buffer) => (stdout += chunk.toString("utf8")));
    proc.stderr.on("data", (chunk: Buffer) => (stderr += chunk.toString("utf8")));
    proc.on("error", reject);
    proc.on("close", (code) => resolvePromise({ stdout, stderr, code }));
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
  const { stdout, code } = await herdr(["pane", "list"]);
  if (code !== 0) {
    return [];
  }
  const parsed = JSON.parse(stdout) as { result?: { panes?: HerdrPaneSummary[] } };
  return parsed.result?.panes ?? [];
}

/** `herdr pane read <id>` — returns the raw text content of the pane (detection-friendly format). */
export async function herdrPaneRead(paneId: string): Promise<string> {
  const { stdout } = await herdr(["pane", "read", paneId, "--format", "text", "--source", "recent"]);
  return stdout;
}

/** `herdr pane send-text <id> <text>` — types text into the real pane, bypassing the bridge/browser. */
export async function herdrPaneSendText(paneId: string, text: string): Promise<void> {
  await herdr(["pane", "send-text", paneId, text]);
}

/** `herdr pane send-keys <id> <key...>` — sends named keys (e.g. "Enter", "Backspace") to the real pane. */
export async function herdrPaneSendKeys(paneId: string, keys: string[]): Promise<void> {
  await herdr(["pane", "send-keys", paneId, ...keys]);
}

/**
 * Pre-flight guard: confirms a local herdr server is actually reachable and
 * has at least one pane, so a dev/CI environment without herdr running gets
 * a clear skip message instead of confusing selector timeouts. Call from a
 * `test.beforeAll` and `test.skip(!ok, message)`.
 */
export async function herdrAvailable(): Promise<{ ok: true } | { ok: false; reason: string }> {
  const { code, stderr } = await herdr(["pane", "list"]);
  if (code !== 0) {
    return { ok: false, reason: `herdr CLI unavailable or server unreachable: ${stderr || `exit ${code}`}` };
  }
  const panes = await herdrPaneList();
  if (panes.length === 0) {
    return { ok: false, reason: "herdr server reachable but has zero panes; open at least one pane to run this suite" };
  }
  return { ok: true };
}
