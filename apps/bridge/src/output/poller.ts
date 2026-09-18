/**
 * Bridge-side polling engine backing `pane.subscribe_output`. See
 * CONTRACT-TIER2.md section 5.1: herdr has no push primitive for raw pane
 * output, so the bridge polls `pane.read` per `(host, pane_id)` at a fixed
 * cadence and synthesizes `pane.output` events on revision change.
 *
 * One poll loop per `(host, pane_id, source, format, lines)` — per thing
 * polled — shared across every browser subscription that asks for it
 * (including across multiple WS connections), never one loop per
 * subscription. Loops share a snapshot, not an encoding: a subscriber that
 * opted in to deltas and has already received the loop's last snapshot gets
 * a line delta against it, everyone else the full snapshot. See
 * openspec/changes/add-delta-pane-output/design.md and ADR-0004.
 */
import { randomUUID } from 'node:crypto';
import type { ReadFormat, ReadSource, WsEvent } from '@kanhrd/schema';
import { lineDelta, type LineDelta } from './delta.js';

/** Just enough of `DispatchHost` for the poller to fetch pane content. */
export interface PaneReader {
  paneRead(params: {
    pane_id: string;
    source?: ReadSource;
    format?: ReadFormat;
    lines?: number;
  }): Promise<{
    content: string;
    revision: number;
    truncated: boolean;
    format: ReadFormat;
    source: ReadSource;
  }>;
}

export interface PaneReaderSource {
  get(host: string): PaneReader | undefined;
}

interface Subscriber {
  subscriptionId: string;
  connectionId: string;
  emit: (event: WsEvent<'pane.output'>) => void;
  /** Asked for line-delta frames. */
  delta: boolean;
  /**
   * Has received the loop's `lastContent`. Every change goes to every
   * subscriber, so a primed subscriber holds exactly that snapshot — which
   * is what makes a delta against it safe, and why one bit is enough. A
   * subscriber that joins a running loop starts unprimed and gets a full
   * frame first.
   */
  primed: boolean;
}

interface PollEntry {
  key: string;
  host: string;
  paneId: string;
  source: ReadSource;
  format: ReadFormat;
  /** Forwarded to every `pane.read`; `undefined` leaves the depth to herdr (80 lines on 0.8.2). */
  lines: number | undefined;
  lastRevision: number;
  /** The snapshot last sent to every subscriber; deltas are computed against it. */
  lastContent: string | null;
  inFlight: boolean;
  timer: ReturnType<typeof setInterval>;
  subscribers: Map<string, Subscriber>;
}

/** What a subscriber asks for. `source`/`format`/`lines` decide the loop; `delta` only the encoding. */
export interface OutputShape {
  source?: ReadSource;
  format?: ReadFormat;
  lines?: number;
  delta?: boolean;
}

function entryKey(
  host: string,
  paneId: string,
  source: ReadSource,
  format: ReadFormat,
  lines?: number
): string {
  return `${host}::${paneId}::${source}::${format}::${lines ?? 'default'}`;
}

export class OutputPoller {
  private readonly entries = new Map<string, PollEntry>();
  /** subscriptionId -> entry key, so unsubscribe/dropConnection can find the right entry without scanning. */
  private readonly bySubscription = new Map<string, string>();

  constructor(
    private readonly hosts: PaneReaderSource,
    private readonly intervalMs: number
  ) {}

  /** Starts (or attaches to an existing) poll loop for the shape asked for and registers a new subscriber. */
  subscribe(
    host: string,
    paneId: string,
    shape: OutputShape,
    connectionId: string,
    emit: (event: WsEvent<'pane.output'>) => void
  ): string {
    // `recent` (viewport + scrollback), NOT `visible` (viewport only), and the same
    // default `HerdrHost.paneRead` already applies to a one-shot read. `pane.output`
    // describes the whole snapshot the client paints over the terminal (ADR-0004), so
    // a `visible` poll behind a `recent` initial read silently deletes the pane's
    // scrollback on the first tick. A caller that wants the cheap viewport-only
    // stream asks for `source: "visible"` explicitly.
    const source = shape.source ?? 'recent';
    const format = shape.format ?? 'ansi';
    // Keyed by everything polled, so a second browser at a different depth gets its
    // own depth rather than the first subscriber's. Two depths on one pane cost two
    // loops against herdr; ADR-0004's amendment records that trade.
    const key = entryKey(host, paneId, source, format, shape.lines);
    let entry = this.entries.get(key);
    if (!entry) {
      const created: PollEntry = {
        key,
        host,
        paneId,
        source,
        format,
        lines: shape.lines,
        lastRevision: -1,
        lastContent: null,
        inFlight: false,
        subscribers: new Map(),
        timer: setInterval(() => void this.poll(key), this.intervalMs),
      };
      this.entries.set(key, created);
      entry = created;
    }

    const subscriptionId = randomUUID();
    entry.subscribers.set(subscriptionId, {
      subscriptionId,
      connectionId,
      emit,
      delta: shape.delta === true,
      primed: false,
    });
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
      const result = await reader.paneRead({
        pane_id: entry.paneId,
        source: entry.source,
        format: entry.format,
        ...(entry.lines !== undefined ? { lines: entry.lines } : {}),
      });

      // ponytail: herdr 0.8.2 hardcodes `revision: 0` on every `pane.read` response
      // (herdr src/app/api/panes.rs:1524), so revision-only dedup never fires past the
      // first push. Fall back to comparing content so live updates still work against
      // that build; drop the content path once herdr's revision fix ships and dedup can
      // be revision-only again. The loop keeps the content itself anyway, for deltas.
      const revisionAdvanced = result.revision > entry.lastRevision;
      const contentChanged = result.content !== entry.lastContent;
      if (!revisionAdvanced && !contentChanged) return; // no change — dedup on revision or content
      const previous = entry.lastContent;
      entry.lastRevision = Math.max(entry.lastRevision, result.revision);
      entry.lastContent = result.content;

      // Computed at most once per change, and only if someone can use it.
      let delta: LineDelta | null | undefined;
      for (const subscriber of entry.subscribers.values()) {
        if (subscriber.delta && subscriber.primed && previous !== null && delta === undefined) {
          delta = lineDelta(previous, result.content);
        }
        const useDelta = subscriber.delta && subscriber.primed && delta;
        subscriber.emit({
          host: entry.host,
          event: 'pane.output',
          payload: {
            subscription_id: subscriber.subscriptionId,
            pane_id: entry.paneId,
            revision: result.revision,
            content: useDelta ? useDelta.tail : result.content,
            format: result.format,
            truncated: result.truncated,
            ...(useDelta
              ? { delta: { drop: useDelta.drop, keep: useDelta.keep, length: useDelta.length } }
              : {}),
          },
        });
        subscriber.primed = true;
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
