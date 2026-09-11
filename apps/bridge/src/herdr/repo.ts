import { statSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';

/** What the bridge can vouch for about the repository a directory sits in. */
export interface RepoProvenance {
  repo_name: string;
  checkout_path: string;
  is_linked_worktree: boolean;
}

/**
 * Bounded so a long-lived bridge on a host that churns through directories
 * cannot grow this map without limit. Eviction is oldest-inserted-first
 * (`Map` preserves insertion order), which is close enough to LRU for a
 * lookup this cheap to recompute.
 */
const CACHE_LIMIT = 512;

/**
 * `undefined` is "never resolved"; `null` is a cached negative — a directory
 * the walk already proved sits outside any repository. Both must be
 * distinguishable, or every non-repo pane re-walks to the filesystem root on
 * every `pane.list` poll.
 */
const cache = new Map<string, RepoProvenance | null>();

/**
 * Resolve the repository a working directory belongs to by walking up for a
 * `.git` entry — a directory for a normal checkout, a file (`gitdir: ...`)
 * for a linked worktree. Returns `undefined` when the walk reaches the
 * filesystem root without finding one: the directory is outside any
 * repository, and the honest answer is no provenance at all.
 *
 * Synchronous and cached per directory. `projectPane` and all its callers
 * are synchronous, and `pane.list` is polled, so an uncached async walk would
 * either ripple `async` through the whole projection path or stat once per
 * pane per poll. The cache turns the steady state into a `Map` hit.
 *
 * The filesystem walked is the BRIDGE's. For a herdr on the same machine
 * that is the right one; for a herdr reached over a socket from elsewhere it
 * is not, and the walk simply finds nothing (the workspace `worktree`
 * fallback in `projectPane` then applies). Herdr-side provenance per pane
 * would remove that caveat.
 */
export function resolveRepo(cwd: string): RepoProvenance | undefined {
  const start = resolve(cwd);
  const cached = cache.get(start);
  if (cached !== undefined) return cached ?? undefined;

  const found = walkForGit(start);
  if (cache.size >= CACHE_LIMIT) {
    const oldest = cache.keys().next();
    if (!oldest.done) cache.delete(oldest.value);
  }
  cache.set(start, found ?? null);
  return found;
}

/**
 * Drops every cached resolution. Called on host connect/reconnect, so a
 * checkout that was moved, deleted or converted to a linked worktree while
 * the bridge was away is re-resolved rather than served stale forever.
 */
export function clearRepoCache(): void {
  cache.clear();
}

function walkForGit(from: string): RepoProvenance | undefined {
  let dir = from;
  for (;;) {
    const stat = statSync(join(dir, '.git'), { throwIfNoEntry: false });
    if (stat !== undefined) {
      return {
        repo_name: basename(dir),
        checkout_path: dir,
        // A linked worktree's `.git` is a FILE holding `gitdir: ...`; a
        // normal checkout's is a directory.
        is_linked_worktree: stat.isFile(),
      };
    }
    const parent = dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
}
