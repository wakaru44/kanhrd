import { lstat, open, opendir, stat } from 'node:fs/promises';
import type {
  BridgeCapabilities,
  BridgeMethodResult,
  FileReadResult,
  RepoDiffChange,
  RepoStatusCode,
  RepoStatusEntry,
  RepoTreeEntry,
} from '@kanhrd/schema';
import { confinePath } from './confine.js';
import { RepoFileError } from './errors.js';
import { runGit } from './git.js';

export type RepoFileLimits = NonNullable<BridgeCapabilities['repoFiles']>;

export const DEFAULT_REPO_FILE_LIMITS: RepoFileLimits = {
  // The `pane.list` poll cadence (`AGENT_STATUS_POLL_INTERVAL_MS`): status is
  // polled the way the board already polls, not pushed.
  statusPollIntervalMs: 5000,
  fileReadMaxBytes: 1024 * 1024,
  diffMaxBytes: 1024 * 1024,
  treeMaxEntries: 2000,
  statusMaxEntries: 5000,
};

/** git's own binary heuristic: a NUL in the first 8000 bytes. */
const BINARY_SNIFF_BYTES = 8000;

/** Porcelain output is bounded by entry count, but a name can be long; this bounds the bytes. */
const STATUS_MAX_BYTES = 16 * 1024 * 1024;

const STATUS_CODES = new Set<string>(['.', 'M', 'T', 'A', 'D', 'R', 'C', 'U', '?']);

function code(letter: string | undefined): RepoStatusCode {
  return letter !== undefined && STATUS_CODES.has(letter) ? (letter as RepoStatusCode) : '.';
}

/** Splits `line` into `count` space-separated fields plus the remainder (a path may hold spaces). */
function fields(line: string, count: number): { head: string[]; rest: string } {
  const head: string[] = [];
  let at = 0;
  for (let i = 0; i < count; i++) {
    const next = line.indexOf(' ', at);
    if (next < 0) return { head, rest: '' };
    head.push(line.slice(at, next));
    at = next + 1;
  }
  return { head, rest: line.slice(at) };
}

/**
 * Every method takes the checkout's REAL path, already through
 * `resolveLocalCheckout` — this class never decides whether a checkout may
 * be read, only reads confined paths inside one.
 */
export class RepoFileReader {
  constructor(
    readonly gitBinary = 'git',
    readonly limits: RepoFileLimits = DEFAULT_REPO_FILE_LIMITS
  ) {}

  private git(cwd: string, args: string[], okCodes?: number[], maxBytes = STATUS_MAX_BYTES) {
    return runGit(this.gitBinary, cwd, args, { maxBytes, ...(okCodes ? { okCodes } : {}) });
  }

  async status(root: string): Promise<BridgeMethodResult['repo.status']> {
    const { stdout } = await this.git(root, [
      'status',
      '--porcelain=v2',
      '--branch',
      '-z',
      '--untracked-files=normal',
      '--ignore-submodules=dirty',
    ]);
    const records = stdout.toString('utf8').split('\0');
    const result: BridgeMethodResult['repo.status'] = {
      checkout_path: root,
      branch: null,
      head: null,
      entries: [],
      truncated: false,
    };

    for (let i = 0; i < records.length; i++) {
      const record = records[i];
      if (record === undefined || record === '') continue;
      if (record.startsWith('# ')) {
        const { head, rest } = fields(record, 2);
        const key = head[1];
        if (key === 'branch.oid') result.head = rest === '(initial)' ? null : rest;
        else if (key === 'branch.head') result.branch = rest === '(detached)' ? null : rest;
        else if (key === 'branch.upstream') result.upstream = rest;
        else if (key === 'branch.ab') {
          const match = /^\+(\d+) -(\d+)$/.exec(rest);
          if (match) {
            result.ahead = Number(match[1]);
            result.behind = Number(match[2]);
          }
        }
        continue;
      }

      let entry: RepoStatusEntry | undefined;
      switch (record[0]) {
        case '1': {
          const { head, rest } = fields(record, 8);
          entry = {
            path: rest,
            kind: 'changed',
            index: code(head[1]?.[0]),
            worktree: code(head[1]?.[1]),
          };
          break;
        }
        case '2': {
          const { head, rest } = fields(record, 9);
          // The original path is the NEXT NUL-separated record.
          const origPath = records[++i] ?? '';
          entry = {
            path: rest,
            kind: 'renamed',
            index: code(head[1]?.[0]),
            worktree: code(head[1]?.[1]),
            orig_path: origPath,
          };
          break;
        }
        case 'u': {
          const { head, rest } = fields(record, 10);
          entry = {
            path: rest,
            kind: 'unmerged',
            index: code(head[1]?.[0]),
            worktree: code(head[1]?.[1]),
          };
          break;
        }
        case '?':
          entry = { path: record.slice(2), kind: 'untracked', index: '?', worktree: '?' };
          break;
        default:
          continue;
      }
      if (result.entries.length >= this.limits.statusMaxEntries) {
        result.truncated = true;
        break;
      }
      result.entries.push(entry);
    }
    return result;
  }

  async tree(root: string, path: string | undefined): Promise<BridgeMethodResult['repo.tree']> {
    const target = confinePath(root, path ?? '');
    if (target.real === undefined) throw notFound(target.rel);
    if (!(await stat(target.real)).isDirectory()) {
      throw new RepoFileError('not_a_directory', `"${target.rel}" is not a directory`);
    }

    const entries: RepoTreeEntry[] = [];
    let truncated = false;
    const dir = await opendir(target.real);
    // Stops reading at the cap rather than listing everything and slicing: a
    // directory with a million entries is exactly the case the cap is for.
    for await (const dirent of dir) {
      if (dirent.name === '.git') continue;
      if (entries.length >= this.limits.treeMaxEntries) {
        truncated = true;
        break;
      }
      const childPath = target.rel === '' ? dirent.name : `${target.rel}/${dirent.name}`;
      const type: RepoTreeEntry['type'] = dirent.isSymbolicLink()
        ? 'symlink'
        : dirent.isDirectory()
          ? 'directory'
          : dirent.isFile()
            ? 'file'
            : 'other';
      const entry: RepoTreeEntry = { name: dirent.name, path: childPath, type, ignored: false };
      if (type === 'file') {
        entry.size = await lstat(`${target.real}/${dirent.name}`).then(
          (s) => s.size,
          () => 0
        );
      }
      entries.push(entry);
    }
    if (truncated) await dir.close().catch(() => undefined);

    await this.markIgnored(root, entries);
    entries.sort((a, b) => {
      const aDir = a.type === 'directory' ? 0 : 1;
      const bDir = b.type === 'directory' ? 0 : 1;
      if (aDir !== bDir) return aDir - bDir;
      return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
    });
    return { path: target.rel, entries, truncated };
  }

  /** One `git check-ignore --stdin` for the whole level, not one process per entry. */
  private async markIgnored(root: string, entries: RepoTreeEntry[]): Promise<void> {
    if (entries.length === 0) return;
    // A trailing `/` lets directory-only patterns (`node_modules/`) match.
    // The leading `./` keeps a name like `:(glob)x` from parsing as pathspec
    // magic, which `check-ignore` cannot be told to skip.
    const byQuery = new Map(
      entries.map((entry) => [`./${entry.path}${entry.type === 'directory' ? '/' : ''}`, entry])
    );
    const { stdout } = await runGit(this.gitBinary, root, ['check-ignore', '-z', '--stdin'], {
      maxBytes: STATUS_MAX_BYTES,
      input: [...byQuery.keys()].join('\0') + '\0',
      // 1 means "none of them are ignored".
      okCodes: [0, 1],
      literalPathspecs: false,
    });
    for (const matched of stdout.toString('utf8').split('\0')) {
      const entry = byQuery.get(matched);
      if (entry) entry.ignored = true;
    }
  }

  async read(root: string, path: string): Promise<FileReadResult> {
    const target = confinePath(root, path);
    if (target.real === undefined) throw notFound(target.rel);
    const info = await stat(target.real);
    if (!info.isFile()) throw new RepoFileError('not_a_file', `"${target.rel}" is not a file`);
    this.refuseLarge(target.rel, info.size);

    const common = { path: target.rel, size: info.size, mtime_ms: Math.floor(info.mtimeMs) };
    const handle = await open(target.real, 'r');
    let bytes: Buffer;
    try {
      // Read at most cap + 1: a file that grew since `stat` is still refused
      // rather than read unbounded.
      const buffer = Buffer.alloc(Math.min(info.size, this.limits.fileReadMaxBytes) + 1);
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
      bytes = buffer.subarray(0, bytesRead);
    } finally {
      await handle.close();
    }
    this.refuseLarge(target.rel, bytes.length);

    if (bytes.subarray(0, BINARY_SNIFF_BYTES).includes(0)) return { ...common, binary: true };
    let content: string;
    try {
      content = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch {
      return { ...common, binary: true };
    }
    return { ...common, size: bytes.length, binary: false, encoding: 'utf-8', content };
  }

  private refuseLarge(rel: string, size: number): void {
    if (size > this.limits.fileReadMaxBytes) {
      throw new RepoFileError(
        'file_too_large',
        `"${rel}" is ${size} bytes; the bridge reads at most ${this.limits.fileReadMaxBytes}`
      );
    }
  }

  /**
   * Tracked changes go through the `diff-index` PLUMBING, not `git diff`.
   *
   * `git diff` ends by refreshing the index's stat cache and writing
   * `.git/index` whenever a path's stat no longer matches but its content
   * does — a tracked file saved without a change is exactly that. That write
   * is not guarded by `--no-optional-locks` or `GIT_OPTIONAL_LOCKS=0`; git
   * never consults them there. `diff-index` produces byte-identical output
   * (porcelain `git diff <tree>` is a wrapper over it) and has no such step,
   * so a read stays a read on the operator's own checkout.
   *
   * The cost of dropping the porcelain is that `diff-index` answers a
   * stat-only difference as a modification instead of quietly refreshing it
   * away; this method resolves that from the patch itself (no hunks, same
   * content) rather than by writing to the repository.
   *
   * The untracked case uses `git diff --no-index`, which compares two paths
   * with no repository index in play at all.
   */
  async diff(root: string, path: string): Promise<BridgeMethodResult['repo.diff']> {
    const target = confinePath(root, path);
    if (target.rel === '') throw new RepoFileError('not_a_file', 'the checkout root is not a file');
    if (target.real !== undefined && (await stat(target.real)).isDirectory()) {
      throw new RepoFileError('not_a_file', `"${target.rel}" is not a file`);
    }

    const base = await this.baseTree(root);
    // `diff-index`, not `diff`: see this method's doc comment.
    const nameStatus = await this.git(root, [
      'diff-index',
      '--name-status',
      '-z',
      '--no-renames',
      '--no-ext-diff',
      '--no-textconv',
      base,
      '--',
      target.rel,
    ]);
    const letter = nameStatus.stdout.toString('utf8').split('\0')[0]?.[0];
    const tracked: Record<string, RepoDiffChange> = {
      M: 'modified',
      A: 'added',
      D: 'deleted',
      T: 'type_changed',
    };
    let change: RepoDiffChange | undefined = letter === undefined ? undefined : tracked[letter];
    if (letter !== undefined && change === undefined) change = 'modified';

    if (change === undefined) {
      if (target.real === undefined) throw notFound(target.rel);
      change = (await this.listsAs(root, target.rel, ['--others', '--exclude-standard']))
        ? 'untracked'
        : (await this.listsAs(root, target.rel, ['--others', '--ignored', '--exclude-standard']))
          ? 'ignored'
          : 'unchanged';
    }

    const result: BridgeMethodResult['repo.diff'] = {
      path: target.rel,
      change,
      binary: false,
      diff: '',
      truncated: false,
    };
    if (change === 'unchanged' || change === 'ignored') return result;

    const diffFlags = ['--no-color', '--no-ext-diff', '--no-textconv', '--no-renames'];
    let output;
    if (change === 'untracked') {
      this.refuseLarge(target.rel, (await stat(target.real as string)).size);
      // `--no-index` exits 1 when the files differ, which is the answer.
      output = await this.git(
        root,
        ['diff', '--no-index', ...diffFlags, '--', '/dev/null', target.rel],
        [0, 1],
        this.limits.diffMaxBytes
      );
    } else {
      output = await this.git(
        root,
        ['diff-index', '--patch', ...diffFlags, base, '--', target.rel],
        undefined,
        this.limits.diffMaxBytes
      );
    }

    let text = output.stdout.toString('utf8');
    if (output.truncated) {
      const cut = text.lastIndexOf('\n');
      text = cut >= 0 ? text.slice(0, cut + 1) : '';
      result.truncated = true;
    }
    if (!text.includes('\n@@ ') && /^Binary files .* differ$/m.test(text)) {
      result.binary = true;
      return result;
    }
    // `diff-index` answers from the index's STAT cache, so a tracked file
    // saved without an edit comes back as a modification with an empty patch.
    // Porcelain `git diff` hides that by refreshing the cache — which writes
    // `.git/index`. The patch is the honest answer: no hunks, same content.
    if (change === 'modified' && text === '' && !output.truncated) {
      result.change = 'unchanged';
      return result;
    }
    result.diff = text;
    return result;
  }

  /** `HEAD`, or the empty tree when the branch has no commit yet. Hashed, never written. */
  private async baseTree(root: string): Promise<string> {
    const head = await this.git(root, ['rev-parse', '--verify', '--quiet', 'HEAD'], [0, 1]);
    if (head.code === 0) return 'HEAD';
    const empty = await this.git(root, ['hash-object', '-t', 'tree', '--stdin']);
    return empty.stdout.toString('utf8').trim();
  }

  private async listsAs(root: string, rel: string, flags: string[]): Promise<boolean> {
    const { stdout } = await this.git(root, ['ls-files', '-z', ...flags, '--', rel]);
    return stdout.length > 0;
  }
}

function notFound(rel: string): RepoFileError {
  return new RepoFileError('not_found', `"${rel}" does not exist in the checkout`);
}
