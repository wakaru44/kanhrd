/**
 * Per-`(host, pane_id)` FIFO queue for herdr requests that mutate a pane
 * (`pane.send_text`, `pane.send_keys`). herdr's socket is one connection per
 * request, dispatched on its own thread — concurrent writes to the same pane
 * race and can land out of order (bug: browser fires several `send_text`
 * calls back-to-back, herdr scrambles the resulting keystrokes). Reads
 * (`pane.read`) don't mutate pane state and are NOT queued here — they keep
 * fanning out in parallel.
 */
export class PaneWriteQueue {
  private readonly tails = new Map<string, Promise<void>>();

  /** Runs `task` after every previously enqueued task for the same `(host, pane_id)` has settled. */
  enqueue<T>(host: string, paneId: string, task: () => Promise<T>): Promise<T> {
    const key = `${host}::${paneId}`;
    const prior = this.tails.get(key) ?? Promise.resolve();
    const result = prior.then(task);
    const settled = result.then(
      () => undefined,
      () => undefined,
    );
    this.tails.set(key, settled);
    void settled.then(() => {
      if (this.tails.get(key) === settled) this.tails.delete(key); // idle — drop it, don't leak
    });
    return result;
  }
}

/**
 * Tier-3 (lane LC3): one FIFO per HOST (not per pane/tab/workspace) for the
 * ten lifecycle-mutating methods (`pane.split`, `pane.close`, `pane.move`,
 * `tab.*`, `workspace.*`). CONTRACT-TIER3.md section 6 flags these as
 * non-transactional across resources and calls out racing lifecycle ops
 * (e.g. `tab.close` racing a `pane.move` into that same tab) as worse than a
 * little extra latency.
 *
 * Deliberately coarser than `PaneWriteQueue`: lifecycle ops don't nest
 * cleanly under a single pane/tab/workspace id the way `pane.send_text` does
 * under a pane id — `pane.move` alone can touch a pane, its source tab, its
 * destination tab, and both workspaces in one call. herdr is one request per
 * connection per host socket anyway, so serializing per-host trades a small
 * amount of parallelism for never having to reason about cross-resource
 * mutation races. Read-only tier-3 calls don't exist (there are none in this
 * tier — `pane.list`/`workspace.list`/`tab.list` are tier-1/2 and stay
 * unqueued), so there's no separate "reads bypass the queue" carve-out to
 * make here the way `PaneWriteQueue`'s doc comment does for `pane.read`.
 *
 * ponytail: global-per-host lock, not per-resource — fine at kanhrd's scale
 * (a handful of lifecycle ops per host per second, not a hot path); revisit
 * with a real per-resource dependency graph only if that changes.
 */
export class HostMutationQueue {
  private readonly tails = new Map<string, Promise<void>>();

  enqueue<T>(host: string, task: () => Promise<T>): Promise<T> {
    const prior = this.tails.get(host) ?? Promise.resolve();
    const result = prior.then(task);
    const settled = result.then(
      () => undefined,
      () => undefined,
    );
    this.tails.set(host, settled);
    void settled.then(() => {
      if (this.tails.get(host) === settled) this.tails.delete(host); // idle — drop it, don't leak
    });
    return result;
  }
}
