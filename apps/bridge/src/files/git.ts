import { spawn } from 'node:child_process';
import { RepoFileError } from './errors.js';

export interface GitResult {
  stdout: Buffer;
  stderr: string;
  code: number;
  /** `stdout` stopped at `maxBytes` and the process was killed. */
  truncated: boolean;
}

export interface GitRunOptions {
  /** Stop reading (and kill git) past this many stdout bytes. */
  maxBytes: number;
  /** Written to stdin, then closed. Omitted, stdin is closed immediately. */
  input?: string;
  /** Exit codes that are answers rather than failures. Default `[0]`. */
  okCodes?: number[];
  /**
   * Default `true`. `check-ignore` refuses `--literal-pathspecs` outright, so
   * its caller turns it off and neutralizes magic itself (a `./` prefix).
   */
  literalPathspecs?: boolean;
}

const TIMEOUT_MS = 15_000;

/**
 * Global options on every invocation. Each one exists to keep a READ a read:
 *
 *   - `--no-optional-locks` (plus `GIT_OPTIONAL_LOCKS=0`): `git status`
 *     otherwise refreshes and rewrites the index. It does NOT cover every
 *     command: `git diff` refreshes the index behind its own back and never
 *     consults the flag, so the diff path uses the `diff-index` plumbing
 *     instead — see `RepoFileReader.diff`;
 *   - `--literal-pathspecs` (added per call, see `literalPathspecs`): a file
 *     named `:(glob)*` is that file, not magic;
 *   - `core.fsmonitor=false`: a repository's own config can name an fsmonitor
 *     COMMAND, which status would execute;
 *   - `-c diff.external=` alongside `--no-ext-diff` / `--no-textconv` on the
 *     diff calls, for the same reason.
 */
const GLOBAL_ARGS = [
  '--no-optional-locks',
  '-c',
  'core.fsmonitor=false',
  '-c',
  'diff.external=',
  '-c',
  'core.quotepath=false',
];

/**
 * Runs `git` with an argv array — never a shell, never an interpolated
 * command line — in `cwd`. A missing binary is `git_unavailable`; git's
 * "not a git repository" is `not_a_repository`; any other exit outside
 * `okCodes` is `git_failed` with git's own stderr.
 */
export function runGit(
  gitBinary: string,
  cwd: string,
  args: string[],
  options: GitRunOptions
): Promise<GitResult> {
  return new Promise((resolve, reject) => {
    const literal = options.literalPathspecs === false ? [] : ['--literal-pathspecs'];
    const child = spawn(gitBinary, [...GLOBAL_ARGS, ...literal, ...args], {
      cwd,
      env: { ...process.env, GIT_OPTIONAL_LOCKS: '0', GIT_TERMINAL_PROMPT: '0', LC_ALL: 'C' },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const chunks: Buffer[] = [];
    let bytes = 0;
    let truncated = false;
    let stderr = '';
    let spawnError: NodeJS.ErrnoException | undefined;

    const timer = setTimeout(() => child.kill('SIGKILL'), TIMEOUT_MS);

    child.stdout.on('data', (chunk: Buffer) => {
      if (truncated) return;
      const room = options.maxBytes - bytes;
      if (chunk.length > room) {
        chunks.push(chunk.subarray(0, room));
        bytes = options.maxBytes;
        truncated = true;
        child.kill('SIGKILL');
        return;
      }
      chunks.push(chunk);
      bytes += chunk.length;
    });
    child.stderr.on('data', (chunk: Buffer) => {
      if (stderr.length < 16_384) stderr += chunk.toString('utf8');
    });
    child.stdin.on('error', () => undefined);
    child.stdin.end(options.input ?? '');
    child.on('error', (err: NodeJS.ErrnoException) => {
      spawnError = err;
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (spawnError !== undefined) {
        reject(
          spawnError.code === 'ENOENT'
            ? new RepoFileError(
                'git_unavailable',
                `git is not available on the bridge: ${spawnError.message}`
              )
            : new RepoFileError('git_failed', spawnError.message)
        );
        return;
      }
      const result: GitResult = {
        stdout: Buffer.concat(chunks),
        stderr,
        code: code ?? -1,
        truncated,
      };
      if (truncated) {
        resolve(result);
        return;
      }
      if (/not a git repository/i.test(stderr)) {
        reject(new RepoFileError('not_a_repository', 'the checkout is not a git repository'));
        return;
      }
      if (!(options.okCodes ?? [0]).includes(result.code)) {
        reject(
          new RepoFileError(
            'git_failed',
            `git ${args[0] ?? ''} exited ${result.code}: ${stderr.trim() || 'no output'}`
          )
        );
        return;
      }
      resolve(result);
    });
  });
}
