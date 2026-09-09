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
