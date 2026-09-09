/**
 * Bridge-side polling engine backing `pane.subscribe_output`. See
 * CONTRACT-TIER2.md section 5.1: herdr has no push primitive for raw pane
 * output, so the bridge polls `pane.read` per `(host, pane_id)` at a fixed
 * cadence and synthesizes `pane.output` events on revision change.
 *
 * One poll loop per `(host, pane_id)`, shared across every browser
 * subscription to that pane (including across multiple WS connections) —
 * never one loop per subscription.
 */
import { createHash, randomUUID } from "node:crypto";
import type { ReadFormat, ReadSource, WsEvent } from "@kanhrd/schema";

/** Just enough of `DispatchHost` for the poller to fetch pane content. */
export interface PaneReader {
  paneRead(params: {
    pane_id: string;
    source?: ReadSource;
    format?: ReadFormat;
  }): Promise<{ content: string; revision: number; truncated: boolean; format: ReadFormat; source: ReadSource }>;
}

export interface PaneReaderSource {
  get(host: string): PaneReader | undefined;
}

interface Subscriber {
  subscriptionId: string;
  connectionId: string;
  emit: (event: WsEvent<"pane.output">) => void;
}

interface PollEntry {
  key: string;
  host: string;
  paneId: string;
  source: ReadSource;
  format: ReadFormat;
  lastRevision: number;
  lastContentHash: string | null;
  inFlight: boolean;
  timer: ReturnType<typeof setInterval>;
  subscribers: Map<string, Subscriber>;
}

function entryKey(host: string, paneId: string): string {
  return `${host}::${paneId}`;
}

export class OutputPoller {
  private readonly entries = new Map<string, PollEntry>();
  /** subscriptionId -> entry key, so unsubscribe/dropConnection can find the right entry without scanning. */
  private readonly bySubscription = new Map<string, string>();

  constructor(
    private readonly hosts: PaneReaderSource,
    private readonly intervalMs: number,
  ) {}

  /** Starts (or attaches to an existing) poll loop for `(host, pane_id)` and registers a new subscriber. */
  subscribe(
    host: string,
    paneId: string,
    source: ReadSource | undefined,
    format: ReadFormat | undefined,
    connectionId: string,
    emit: (event: WsEvent<"pane.output">) => void,
  ): string {
    const key = entryKey(host, paneId);
    let entry = this.entries.get(key);
    if (!entry) {
      // ponytail: dedupe is keyed on (host, pane_id) only, per CONTRACT-TIER2 §5.1 — the
      // first subscriber's source/format wins for the whole shared poll loop. Fine in
      // practice since L3B always requests the same (visible, ansi) defaults; revisit
      // with per-(host,pane_id,source,format) keys if a caller ever needs a second shape.
      const created: PollEntry = {
        key,
        host,
        paneId,
        source: source ?? "visible",
        format: format ?? "ansi",
        lastRevision: -1,
        lastContentHash: null,
        inFlight: false,
        subscribers: new Map(),
        timer: setInterval(() => void this.poll(key), this.intervalMs),
      };
      this.entries.set(key, created);
      entry = created;
    }

    const subscriptionId = randomUUID();
    entry.subscribers.set(subscriptionId, { subscriptionId, connectionId, emit });
    this.bySubscription.set(subscriptionId, key);
    return subscriptionId;
  }

  unsubscribe(subscriptionId: string): void {
    const key = this.bySubscription.get(subscriptionId);
    if (!key) return;
    this.bySubscription.delete(subscriptionId);
    const entry = this.entries.get(key);
    if (!entry) return;
    entry.subscribers.delete(subscriptionId);
    if (entry.subscribers.size === 0) this.stopEntry(entry);
  }

  /** Drops every subscription owned by a closed WS connection and stops now-empty poll loops. */
  dropConnection(connectionId: string): void {
    for (const entry of this.entries.values()) {
      for (const [subscriptionId, subscriber] of entry.subscribers) {
        if (subscriber.connectionId !== connectionId) continue;
        entry.subscribers.delete(subscriptionId);
        this.bySubscription.delete(subscriptionId);
      }
      if (entry.subscribers.size === 0) this.stopEntry(entry);
    }
  }

  private stopEntry(entry: PollEntry): void {
    clearInterval(entry.timer);
    this.entries.delete(entry.key);
  }

  private async poll(key: string): Promise<void> {
    const entry = this.entries.get(key);
    if (!entry || entry.inFlight) return; // skip a tick if the previous poll hasn't returned — no queueing
    const reader = this.hosts.get(entry.host);
    if (!reader) return;

    entry.inFlight = true;
    try {
      const result = await reader.paneRead({ pane_id: entry.paneId, source: entry.source, format: entry.format });

      // ponytail: herdr 0.8.2 hardcodes `revision: 0` on every `pane.read` response
      // (herdr src/app/api/panes.rs:1524), so revision-only dedup never fires past the
      // first push. Fall back to a content hash so live updates still work against that
      // build; drop this hash path once herdr's revision fix ships and dedup can be
      // revision-only again.
      const contentHash = createHash("sha1").update(result.content).digest("hex");
      const revisionAdvanced = result.revision > entry.lastRevision;
      const contentChanged = contentHash !== entry.lastContentHash;
      if (!revisionAdvanced && !contentChanged) return; // no change — dedup on revision or content hash
      entry.lastRevision = Math.max(entry.lastRevision, result.revision);
      entry.lastContentHash = contentHash;
      for (const subscriber of entry.subscribers.values()) {
        subscriber.emit({
          host: entry.host,
          event: "pane.output",
          payload: {
            subscription_id: subscriber.subscriptionId,
            pane_id: entry.paneId,
            revision: result.revision,
            content: result.content,
            format: result.format,
            truncated: result.truncated,
          },
        });
      }
    } catch {
      // ponytail: a transient herdr read failure just skips this tick, same as an
      // in-flight skip — the next tick retries. No backoff/error surfacing needed;
      // pane.read failures are recoverable and per-poll, not connection-level.
    } finally {
      entry.inFlight = false;
    }
  }
}
