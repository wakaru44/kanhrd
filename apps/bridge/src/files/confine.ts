import { realpathSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, sep } from 'node:path';
import { RepoFileError } from './errors.js';

/** A client `path` proven to sit inside the checkout. */
export interface ConfinedPath {
  /** Checkout-relative, `/`-separated, normalized; `""` is the root. */
  rel: string;
  /** The lexical absolute path under the checkout's real path. */
  abs: string;
  /** The fully resolved real path, or `undefined` when nothing exists there. */
  real: string | undefined;
}

/** `true` when `real` is `root` or lies below it. Both must already be real paths. */
export function isInside(root: string, real: string): boolean {
  return real === root || real.startsWith(root.endsWith(sep) ? root : root + sep);
}

function outside(input: string): RepoFileError {
  return new RepoFileError('path_outside_checkout', `path "${input}" is outside the checkout`);
}

function touchesGitDir(rel: string): boolean {
  return rel.split(sep).includes('.git');
}

/**
 * Resolves a client-supplied `path` against `realRoot` (the checkout's REAL
 * path) and refuses anything that could leave it:
 *
 *   - absolute paths and NUL bytes, outright;
 *   - any `..` segment, outright — no lexical normalization that could be
 *     argued with;
 *   - any `.git` segment, before or after symlink resolution: git's own
 *     database is not a file the panel shows;
 *   - a real path (every symlink resolved) outside `realRoot`. When the
 *     path does not exist — a deleted file being diffed — its nearest
 *     existing ancestor is resolved and checked instead, so a symlinked
 *     directory cannot smuggle a nonexistent leaf outside either.
 *
 * Symlinks are resolved at check time; a process that swaps one between
 * this check and the read already runs with the operator's privileges.
 */
export function confinePath(realRoot: string, input: string): ConfinedPath {
  if (input.includes('\0') || isAbsolute(input) || input.startsWith('/')) throw outside(input);
  const segments = input.split('/').filter((segment) => segment !== '' && segment !== '.');
  if (segments.includes('..') || segments.includes('.git')) throw outside(input);

  const rel = segments.join('/');
  const abs = segments.length === 0 ? realRoot : join(realRoot, ...segments);

  let probe = abs;
  for (;;) {
    let real: string | undefined;
    try {
      real = realpathSync(probe);
    } catch {
      real = undefined;
    }
    if (real !== undefined) {
      if (!isInside(realRoot, real) || touchesGitDir(relative(realRoot, real))) {
        throw outside(input);
      }
      return { rel, abs, real: probe === abs ? real : undefined };
    }
    // `abs` is under `realRoot`, which exists, so this walk ends at the root.
    const parent = dirname(probe);
    if (parent === probe) throw outside(input);
    probe = parent;
  }
}
