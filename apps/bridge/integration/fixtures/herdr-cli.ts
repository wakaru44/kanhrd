import { spawn } from "node:child_process";

/**
 * Thin wrapper around the local `herdr` CLI, used so integration tests can
 * drive/verify real herdr state independently of the bridge under test
 * (e.g. "did the bridge actually reach herdr", "did the pane really receive
 * this text", "did the tab really get created/renamed/closed").
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
  const { stdout, code } = await herdr(["pane", "list"]);
  if (code !== 0) return [];
  const parsed = JSON.parse(stdout) as { result?: { panes?: HerdrPaneSummary[] } };
  return parsed.result?.panes ?? [];
}

/** `herdr tab list`. */
export async function herdrTabList(): Promise<HerdrTabSummary[]> {
  const { stdout, code } = await herdr(["tab", "list"]);
  if (code !== 0) return [];
  const parsed = JSON.parse(stdout) as { result?: { tabs?: HerdrTabSummary[] } };
  return parsed.result?.tabs ?? [];
}

/** `herdr workspace list`. */
export async function herdrWorkspaceList(): Promise<HerdrWorkspaceSummary[]> {
  const { stdout, code } = await herdr(["workspace", "list"]);
  if (code !== 0) return [];
  const parsed = JSON.parse(stdout) as { result?: { workspaces?: HerdrWorkspaceSummary[] } };
  return parsed.result?.workspaces ?? [];
}

/** `herdr pane read <id>` — returns the raw text content of the pane (detection-friendly format). */
export async function herdrPaneRead(paneId: string): Promise<string> {
  const { stdout } = await herdr(["pane", "read", paneId, "--format", "text", "--source", "recent"]);
  return stdout;
}

/** `herdr pane send-text <id> <text>` — types text into the real pane, bypassing the bridge. */
export async function herdrPaneSendText(paneId: string, text: string): Promise<void> {
  await herdr(["pane", "send-text", paneId, text]);
}

/** `herdr pane send-keys <id> <key...>` — sends named keys (e.g. "Enter", "Backspace") to the real pane. */
export async function herdrPaneSendKeys(paneId: string, keys: string[]): Promise<void> {
  await herdr(["pane", "send-keys", paneId, ...keys]);
}

/** `herdr pane split <target-pane-id> --direction <right|down>` — returns the new pane's id, or undefined on failure. */
export async function herdrPaneSplit(targetPaneId: string, direction: "right" | "down" = "right"): Promise<string | undefined> {
  const { stdout, code } = await herdr(["pane", "split", targetPaneId, "--direction", direction, "--no-focus"]);
  if (code !== 0) return undefined;
  const parsed = JSON.parse(stdout) as { result?: { pane?: { pane_id?: string } } };
  return parsed.result?.pane?.pane_id;
}

/** `herdr pane close <id>` — best-effort, swallows failure (id may already be gone). */
export async function herdrPaneClose(paneId: string): Promise<void> {
  await herdr(["pane", "close", paneId]);
}

/** `herdr tab create --workspace <id> --label <label> --no-focus` — returns the new tab's id, or undefined on failure. */
export async function herdrTabCreate(workspaceId: string, label: string): Promise<string | undefined> {
  const { stdout, code } = await herdr(["tab", "create", "--workspace", workspaceId, "--label", label, "--no-focus"]);
  if (code !== 0) return undefined;
  const parsed = JSON.parse(stdout) as { result?: { tab?: { tab_id?: string } } };
  return parsed.result?.tab?.tab_id;
}

/** `herdr tab close <id>` — best-effort, swallows failure (id may already be gone). */
export async function herdrTabClose(tabId: string): Promise<void> {
  await herdr(["tab", "close", tabId]);
}

/**
 * Pre-flight guard: confirms a local herdr server is actually reachable and
 * has at least one pane, so an environment without herdr running gets a
 * clear skip message instead of confusing connection-refused errors deep in
 * a test body. Call once (e.g. in a `beforeAll`) and `describe.skip`/
 * `test.skip` the whole file when `ok` is false.
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
