import { spawn, type ChildProcessByStdio } from 'node:child_process';
import type { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const FIXTURES_DIR = dirname(fileURLToPath(import.meta.url));
const BRIDGE_DIR = resolve(FIXTURES_DIR, '../..'); // apps/bridge

const LISTEN_LINE_RE = /Server listening at http:\/\/[^:]+:(\d+)/;
const START_TIMEOUT_MS = 3_000;

export interface RunningBridge {
  baseUrl: string;
  wsUrl: string;
  port: number;
  /** Full stdout captured so far, for tests that want to assert on the log (e.g. A1). */
  log: string;
  stop: () => Promise<void>;
}

/**
 * Spawns the real bridge as a subprocess via `node --import tsx src/main.ts`
 * (the same dev-mode invocation documented in `apps/bridge/README.md` and
 * used throughout the tier-2/tier-3 validation rounds), on an OS-assigned
 * free port (`--port 0`), and resolves once the "Server listening at
 * http://127.0.0.1:<port>" log line has been observed — the exact signal
 * A1 asserts on.
 *
 * Deviation from the brief's literal `node dist/main.js` suggestion: running
 * through `tsx` instead of a pre-built `dist/` means `pnpm test:int` never
 * silently exercises a stale build left over from a previous `pnpm build`,
 * and doesn't require a build step to be run first — `pnpm install` followed
 * directly by `pnpm test:int` just works, matching the acceptance criteria.
 * `tsx` is already a devDependency used by the bridge's own `dev` script for
 * the same reason.
 *
 * Uses the bridge's built-in default config (no `--config` flag): one host
 * named `local` at `~/.config/herdr/herdr.sock` — the same default a fresh
 * checkout gets, and the thing this whole suite is meant to exercise against
 * a real local herdr install.
 */
export async function startBridge(extraArgs: string[] = []): Promise<RunningBridge> {
  const proc: ChildProcessByStdio<null, Readable, Readable> = spawn(
    'node',
    ['--import', 'tsx', 'src/main.ts', '--port', '0', ...extraArgs],
    { cwd: BRIDGE_DIR, stdio: ['ignore', 'pipe', 'pipe'] }
  );

  let log = '';
  let stderr = '';
  proc.stdout.on('data', (chunk: Buffer) => (log += chunk.toString('utf8')));
  proc.stderr.on('data', (chunk: Buffer) => (stderr += chunk.toString('utf8')));

  const exitedEarly = new Promise<never>((_resolvePromise, reject) => {
    proc.once('exit', (code, signal) => {
      reject(
        new Error(
          `bridge process exited early (code=${code}, signal=${signal})\nstdout:\n${log}\nstderr:\n${stderr}`
        )
      );
    });
    proc.once('error', (err) => reject(err));
  });

  const waitForListen = new Promise<number>((resolvePromise, reject) => {
    const timer = setTimeout(() => {
      reject(
        new Error(
          `bridge did not log "Server listening" within ${START_TIMEOUT_MS}ms\nstdout:\n${log}\nstderr:\n${stderr}`
        )
      );
    }, START_TIMEOUT_MS);

    const check = (): void => {
      const match = LISTEN_LINE_RE.exec(log);
      if (match) {
        clearTimeout(timer);
        resolvePromise(Number(match[1]));
      }
    };
    proc.stdout.on('data', check);
    check(); // in case it already arrived before this listener attached
  });

  const port = await Promise.race([waitForListen, exitedEarly]);

  const stop = async (): Promise<void> => {
    if (proc.exitCode !== null || proc.signalCode !== null) return;
    proc.kill('SIGTERM');
    await new Promise<void>((resolvePromise) => {
      const forceKill = setTimeout(() => proc.kill('SIGKILL'), 2_000);
      proc.once('exit', () => {
        clearTimeout(forceKill);
        resolvePromise();
      });
    });
  };

  return {
    baseUrl: `http://127.0.0.1:${port}`,
    wsUrl: `ws://127.0.0.1:${port}/ws`,
    port,
    get log() {
      return log;
    },
    stop,
  };
}

/**
 * `hosts.startAll()` (main.ts) kicks off each `HostRuntime`'s herdr-socket
 * connect + `events.subscribe` round trip without awaiting it before the
 * HTTP server starts listening — so the "Server listening" log line (what
 * `startBridge()` waits for) can appear a handful of milliseconds before
 * `GET /api/hosts` first reports `connected: true`. This is a real, benign
 * startup race in the app (not a bug worth chasing — the REST/WS surface is
 * correctly available and correctly reports `connected: false` in the
 * meantime, exactly per the wire contract), not something this suite should
 * paper over by pretending "listening" means "every configured host is
 * live." Every test file that needs a connected host calls this once in
 * `beforeAll`, right after `startBridge()`, instead of hammering
 * `/api/hosts` on the very first tick.
 */
export async function waitForHostConnected(
  bridge: RunningBridge,
  host = 'local',
  timeoutMs = 3_000
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let last: { connected: boolean; last_error?: string } | undefined;
  while (Date.now() < deadline) {
    const res = await fetch(`${bridge.baseUrl}/api/hosts`);
    if (res.ok) {
      const body = (await res.json()) as {
        hosts: Array<{ name: string; connected: boolean; last_error?: string }>;
      };
      last = body.hosts.find((h) => h.name === host);
      if (last?.connected) return;
    }
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error(
    `host "${host}" did not report connected: true within ${timeoutMs}ms (last seen: ${JSON.stringify(last)})`
  );
}
