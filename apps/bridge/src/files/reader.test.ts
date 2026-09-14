import { execFileSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  statSync,
  symlinkSync,
  truncateSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { RepoFileError } from './errors.js';
import { DEFAULT_REPO_FILE_LIMITS, RepoFileReader } from './reader.js';

// A real git repository, because what is under test IS git's porcelain and
// the real filesystem's symlink resolution. Created per run, removed after.
const sandbox = realpathSync(mkdtempSync(join(tmpdir(), 'kanhrd-files-')));
const repo = join(sandbox, 'repo');
const outsideDir = join(sandbox, 'outside');
const reader = new RepoFileReader();

function git(cwd: string, ...args: string[]): string {
  return execFileSync(
    'git',
    ['-c', 'user.name=kanhrd-test', '-c', 'user.email=test@kanhrd.invalid', ...args],
    { cwd, encoding: 'utf8' }
  );
}

async function refusal(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (err) {
    if (err instanceof RepoFileError) return err.code;
    throw err;
  }
  throw new Error('expected a RepoFileError, got success');
}

beforeAll(() => {
  mkdirSync(join(repo, 'src', 'nested'), { recursive: true });
  mkdirSync(join(repo, 'node_modules', 'left-pad'), { recursive: true });
  mkdirSync(outsideDir, { recursive: true });
  writeFileSync(join(outsideDir, 'secret.txt'), 'not yours\n');
  writeFileSync(join(sandbox, 'outside.txt'), 'not yours either\n');

  git(sandbox, 'init', '-q', '-b', 'main', repo);
  writeFileSync(join(repo, '.gitignore'), 'node_modules/\n*.log\n');
  writeFileSync(join(repo, 'README.md'), '# repo\n\nhello\n');
  writeFileSync(join(repo, 'src', 'app.ts'), 'export const a = 1;\n');
  writeFileSync(join(repo, 'src', 'gone.ts'), 'export const gone = true;\n');
  writeFileSync(join(repo, 'src', 'nested', 'deep.ts'), 'export {};\n');
  writeFileSync(join(repo, 'with space.txt'), 'spaced\n');
  writeFileSync(join(repo, 'image.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0x0d]));
  git(repo, 'add', '-A');
  git(repo, 'commit', '-q', '-m', 'init');

  // Working-tree changes the assertions read back.
  writeFileSync(join(repo, 'src', 'app.ts'), 'export const a = 2;\n');
  unlinkSync(join(repo, 'src', 'gone.ts'));
  writeFileSync(join(repo, 'new.txt'), 'brand\nnew\n');
  writeFileSync(join(repo, 'debug.log'), 'ignored\n');
  writeFileSync(join(repo, 'node_modules', 'left-pad', 'index.js'), 'module.exports = 1;\n');
  writeFileSync(join(repo, 'latin1.txt'), Buffer.from([0x63, 0x61, 0x66, 0xe9, 0x0a]));
  symlinkSync(outsideDir, join(repo, 'escape'));
  symlinkSync(join(sandbox, 'outside.txt'), join(repo, 'escape.txt'));
  symlinkSync('README.md', join(repo, 'alias.md'));
  symlinkSync('.git', join(repo, 'gitlink'));
});

afterAll(() => rmSync(sandbox, { recursive: true, force: true }));

describe('confinement', () => {
  it('refuses `..` traversal', async () => {
    expect(await refusal(reader.read(repo, '../outside.txt'))).toBe('path_outside_checkout');
    expect(await refusal(reader.read(repo, 'src/../../outside.txt'))).toBe('path_outside_checkout');
    expect(await refusal(reader.tree(repo, '..'))).toBe('path_outside_checkout');
  });

  it('refuses absolute paths, even ones inside the checkout', async () => {
    expect(await refusal(reader.read(repo, '/etc/hosts'))).toBe('path_outside_checkout');
    expect(await refusal(reader.read(repo, join(repo, 'README.md')))).toBe('path_outside_checkout');
    expect(await refusal(reader.tree(repo, '/'))).toBe('path_outside_checkout');
  });

  it('refuses a symlinked directory whose real path leaves the checkout', async () => {
    expect(await refusal(reader.read(repo, 'escape/secret.txt'))).toBe('path_outside_checkout');
    expect(await refusal(reader.tree(repo, 'escape'))).toBe('path_outside_checkout');
    // A leaf that does not exist under the escaping link is refused too, not `not_found`.
    expect(await refusal(reader.diff(repo, 'escape/nope.txt'))).toBe('path_outside_checkout');
  });

  it('refuses a symlinked file whose real path leaves the checkout', async () => {
    expect(await refusal(reader.read(repo, 'escape.txt'))).toBe('path_outside_checkout');
  });

  it('follows a symlink that stays inside the checkout', async () => {
    const result = await reader.read(repo, 'alias.md');
    expect(result).toMatchObject({ binary: false, content: '# repo\n\nhello\n' });
  });

  it('refuses .git by name and through a symlink', async () => {
    expect(await refusal(reader.read(repo, '.git/config'))).toBe('path_outside_checkout');
    expect(await refusal(reader.tree(repo, '.git'))).toBe('path_outside_checkout');
    expect(await refusal(reader.read(repo, 'gitlink/config'))).toBe('path_outside_checkout');
  });

  it('refuses a NUL byte', async () => {
    expect(await refusal(reader.read(repo, 'README.md\0.png'))).toBe('path_outside_checkout');
  });
});

describe('file.read', () => {
  it('reads UTF-8 text with its size and mtime', async () => {
    const result = await reader.read(repo, 'src/app.ts');
    expect(result).toEqual({
      path: 'src/app.ts',
      size: 20,
      mtime_ms: expect.any(Number),
      binary: false,
      encoding: 'utf-8',
      content: 'export const a = 2;\n',
    });
  });

  it('says binary for a NUL-bearing file and carries no content', async () => {
    const result = await reader.read(repo, 'image.png');
    expect(result).toEqual({
      path: 'image.png',
      size: 8,
      mtime_ms: expect.any(Number),
      binary: true,
    });
  });

  it('says binary for invalid UTF-8 rather than returning mojibake', async () => {
    expect(await reader.read(repo, 'latin1.txt')).toMatchObject({ binary: true });
  });

  it('refuses an oversized file without reading it', async () => {
    const big = join(repo, 'big.bin');
    writeFileSync(big, '');
    truncateSync(big, 2 * 1024 * 1024 * 1024); // sparse 2 GiB
    try {
      expect(await refusal(reader.read(repo, 'big.bin'))).toBe('file_too_large');
    } finally {
      unlinkSync(big);
    }
  });

  it('distinguishes not_found and not_a_file', async () => {
    expect(await refusal(reader.read(repo, 'missing.txt'))).toBe('not_found');
    expect(await refusal(reader.read(repo, 'src'))).toBe('not_a_file');
  });
});

describe('repo.tree', () => {
  it('lists one level, directories first, without .git, with ignore flags', async () => {
    const result = await reader.tree(repo, undefined);
    expect(result.path).toBe('');
    expect(result.truncated).toBe(false);
    const names = result.entries.map((entry) => entry.name);
    expect(names).not.toContain('.git');
    expect(names.slice(0, 2)).toEqual(['node_modules', 'src']);
    expect(result.entries.find((e) => e.name === 'node_modules')).toEqual({
      name: 'node_modules',
      path: 'node_modules',
      type: 'directory',
      ignored: true,
    });
    expect(result.entries.find((e) => e.name === 'debug.log')).toMatchObject({ ignored: true });
    expect(result.entries.find((e) => e.name === 'README.md')).toEqual({
      name: 'README.md',
      path: 'README.md',
      type: 'file',
      size: 14,
      ignored: false,
    });
    expect(result.entries.find((e) => e.name === 'escape')).toMatchObject({ type: 'symlink' });
  });

  it('never descends: a subdirectory is its own call', async () => {
    const root = await reader.tree(repo, '');
    expect(root.entries.some((e) => e.path.includes('/'))).toBe(false);
    const src = await reader.tree(repo, 'src');
    expect(src.entries.map((e) => e.path)).toEqual(['src/nested', 'src/app.ts']);
  });

  it('stops at the entry cap', async () => {
    const capped = new RepoFileReader('git', { ...DEFAULT_REPO_FILE_LIMITS, treeMaxEntries: 3 });
    const result = await capped.tree(repo, '');
    expect(result.entries).toHaveLength(3);
    expect(result.truncated).toBe(true);
  });

  it('refuses a file as a directory', async () => {
    expect(await refusal(reader.tree(repo, 'README.md'))).toBe('not_a_directory');
  });
});

describe('repo.status', () => {
  it('reports branch, head and porcelain v2 entries', async () => {
    const result = await reader.status(repo);
    expect(result.checkout_path).toBe(repo);
    expect(result.branch).toBe('main');
    expect(result.head).toMatch(/^[0-9a-f]{40,64}$/);
    expect(result.upstream).toBeUndefined();
    expect(result.entries).toContainEqual({
      path: 'src/app.ts',
      kind: 'changed',
      index: '.',
      worktree: 'M',
    });
    expect(result.entries).toContainEqual({
      path: 'src/gone.ts',
      kind: 'changed',
      index: '.',
      worktree: 'D',
    });
    expect(result.entries).toContainEqual({
      path: 'new.txt',
      kind: 'untracked',
      index: '?',
      worktree: '?',
    });
    expect(result.entries.some((e) => e.path.startsWith('node_modules'))).toBe(false);
  });

  it('reports a staged rename with its original path', async () => {
    const renameRepo = join(sandbox, 'rename');
    git(sandbox, 'init', '-q', '-b', 'main', renameRepo);
    writeFileSync(join(renameRepo, 'old name.txt'), 'same content for rename detection\n');
    git(renameRepo, 'add', '-A');
    git(renameRepo, 'commit', '-q', '-m', 'init');
    git(renameRepo, 'mv', 'old name.txt', 'new name.txt');
    const result = await reader.status(renameRepo);
    expect(result.entries).toEqual([
      {
        path: 'new name.txt',
        kind: 'renamed',
        index: 'R',
        worktree: '.',
        orig_path: 'old name.txt',
      },
    ]);
  });

  it('does not rewrite the index', async () => {
    // Touching a tracked file makes the index stale; a status that refreshed
    // it would write `.git/index`.
    writeFileSync(join(repo, 'with space.txt'), 'spaced\n');
    const before = statSync(join(repo, '.git', 'index')).mtimeMs;
    await new Promise((r) => setTimeout(r, 20));
    await reader.status(repo);
    await reader.diff(repo, 'with space.txt');
    await reader.tree(repo, '');
    expect(statSync(join(repo, '.git', 'index')).mtimeMs).toBe(before);
  });

  it('says not_a_repository outside git', async () => {
    const plain = join(sandbox, 'plain');
    mkdirSync(plain, { recursive: true });
    // GIT_CEILING_DIRECTORIES keeps git from finding a repository above the sandbox.
    process.env.GIT_CEILING_DIRECTORIES = sandbox;
    try {
      expect(await refusal(reader.status(plain))).toBe('not_a_repository');
    } finally {
      delete process.env.GIT_CEILING_DIRECTORIES;
    }
  });

  it('says git_unavailable when git is missing', async () => {
    const noGit = new RepoFileReader(join(sandbox, 'no-such-git'));
    expect(await refusal(noGit.status(repo))).toBe('git_unavailable');
  });
});

describe('repo.diff', () => {
  it('diffs a modified file against HEAD', async () => {
    const result = await reader.diff(repo, 'src/app.ts');
    expect(result).toMatchObject({
      path: 'src/app.ts',
      change: 'modified',
      binary: false,
      truncated: false,
    });
    expect(result.diff).toContain('-export const a = 1;');
    expect(result.diff).toContain('+export const a = 2;');
  });

  it('diffs a deleted file that no longer exists on disk', async () => {
    const result = await reader.diff(repo, 'src/gone.ts');
    expect(result.change).toBe('deleted');
    expect(result.diff).toContain('-export const gone = true;');
  });

  it('diffs an untracked file against the empty file', async () => {
    const result = await reader.diff(repo, 'new.txt');
    expect(result.change).toBe('untracked');
    expect(result.diff).toContain('+brand');
    expect(result.diff).toContain('+new');
  });

  it('reports ignored and unchanged paths with an empty diff', async () => {
    expect(await reader.diff(repo, 'debug.log')).toMatchObject({ change: 'ignored', diff: '' });
    expect(await reader.diff(repo, 'README.md')).toMatchObject({ change: 'unchanged', diff: '' });
  });

  it('marks a binary change binary with no diff text', async () => {
    writeFileSync(join(repo, 'image.png'), Buffer.from([0x89, 0, 1, 2, 3]));
    try {
      expect(await reader.diff(repo, 'image.png')).toMatchObject({
        change: 'modified',
        binary: true,
        diff: '',
      });
    } finally {
      writeFileSync(join(repo, 'image.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0x0d]));
    }
  });

  it('cuts a long diff at a line boundary', async () => {
    const capped = new RepoFileReader('git', { ...DEFAULT_REPO_FILE_LIMITS, diffMaxBytes: 64 });
    const result = await capped.diff(repo, 'new.txt');
    expect(result.truncated).toBe(true);
    expect(result.diff.length).toBeLessThanOrEqual(64);
    expect(result.diff.endsWith('\n')).toBe(true);
  });

  it('diffs against the empty tree before the first commit', async () => {
    const unborn = join(sandbox, 'unborn');
    git(sandbox, 'init', '-q', '-b', 'main', unborn);
    writeFileSync(join(unborn, 'first.txt'), 'first\n');
    git(unborn, 'add', 'first.txt');
    expect(await reader.status(unborn)).toMatchObject({ branch: 'main', head: null });
    const result = await reader.diff(unborn, 'first.txt');
    expect(result.change).toBe('added');
    expect(result.diff).toContain('+first');
  });

  it('refuses a missing path and a directory', async () => {
    expect(await refusal(reader.diff(repo, 'never-existed.txt'))).toBe('not_found');
    expect(await refusal(reader.diff(repo, 'src'))).toBe('not_a_file');
  });
});
