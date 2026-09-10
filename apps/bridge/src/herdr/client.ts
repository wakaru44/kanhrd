import { randomUUID } from 'node:crypto';
import { createConnection, type Socket } from 'node:net';
import { EventEmitter } from 'node:events';
import type { EventKind } from '@kanhrd/schema';
import type { RawHerdrLine } from '../types.js';

/** One event frame herdr pushed on a subscribed socket. `event` is already normalized to the bridge/`EventKind` dot form — see `herdrEventKindToDotName`. */
export interface HerdrPushedEvent {
  event: string;
  data: unknown;
}

/**
 * Verified against a live herdr socket (not just the schema): herdr's
 * OUTGOING `EventEnvelope.event` field serializes via `EventKind`'s own
 * `#[serde(rename_all = "snake_case")]` derive (src/api/schema/events.rs:192-221)
 * — e.g. `"tab_created"`, `"pane_agent_status_changed"` — which is a
 * DIFFERENT enum from the dot-named `Subscription` request enum
 * (`#[serde(tag = "type")]` with per-variant `#[serde(rename = "tab.created")]`,
 * same file, ~lines 17-88) used to build `events.subscribe`'s request
 * payload. herdr also defines a manual `EventKind::dot_name()` helper
 * (~events.rs:224) that produces the dot form, but it is NOT wired into
 * `EventEnvelope`'s actual `Serialize` impl — only used internally
 * (schema introspection), confirmed by reading the broadcast call sites in
 * `src/api/subscriptions.rs`, which construct `EventEnvelope` directly with
 * the derived (non-dot) serialization.
 *
 * herdr.ts's `HerdrEventEnvelope`/`EventKind` types (mirrored from the
 * `Subscription` enum's dot names, matching the bridge's own `EventKind`)
 * assume the dot form throughout — so incoming events are normalized here,
 * once, at the only place raw herdr JSON is parsed. Every noun (`workspace`/
 * `worktree`/`tab`/`pane`/`layout`) is a single word, so "replace the FIRST
 * underscore with a dot" round-trips `dot_name()` exactly for every variant
 * (verified line-by-line against `dot_name()`'s full match arm list) —
 * including multi-word suffixes like `pane_agent_status_changed` ->
 * `pane.agent_status_changed`.
 */
export function herdrEventKindToDotName(raw: string): string {
  const underscoreIndex = raw.indexOf('_');
  if (underscoreIndex === -1) return raw;
  return `${raw.slice(0, underscoreIndex)}.${raw.slice(underscoreIndex + 1)}`;
}

/**
 * One entry of herdr's `Subscription` union (`src/api/schema/events.rs`).
 * Most kinds are global (`{ type }` alone); `pane.agent_status_changed` is
 * the one tier-1 kind that is per-pane only — herdr's server resolves
 * `pane_id` at subscribe time and filters by exact match, there is no
 * wildcard (`src/api/subscriptions.rs:205-236,362`). A single invalid entry
 * fails to deserialize the whole `subscriptions` array, so callers must only
 * include `pane_id` for kinds that require it and must know the id already.
 */
export interface HerdrSubscriptionSpec {
  type: EventKind;
  pane_id?: string;
}

/**
 * Handle to an open `events.subscribe` connection. herdr never accepts a
 * second request on this socket once subscribed — it just streams
 * `EventEnvelope` lines until the bridge closes it or herdr does.
 */
export interface HerdrSubscription {
  close(): void;
  on(event: 'disconnect', listener: (err?: Error) => void): this;
}

/**
 * A herdr `ErrorBody` (`{code, message}`) surfaced as a JS `Error` that keeps
 * `code` around. Tier-1/2 only ever needed the message (herdr errors were
 * all "just fail the call" cases); tier-3's `workspace.close` needs the
 * caller to distinguish `workspace_group_close_required` from any other
 * failure (CONTRACT-TIER3.md section 5.4/6), so `request()` now preserves
 * the code instead of discarding it.
 */
export class HerdrRequestError extends Error {
  constructor(
    readonly code: string,
    message: string
  ) {
    super(message);
    this.name = 'HerdrRequestError';
  }
}

class HerdrSubscriptionHandle extends EventEmitter implements HerdrSubscription {
  constructor(private readonly socket: Socket) {
    super();
  }

  close(): void {
    this.socket.end();
  }
}

/**
 * Client for herdr's newline-delimited JSON API over unix sockets (mirrors
 * `ApiClient` in the herdr repo's `src/api/client.rs`, imitated not copied).
 *
 * herdr's socket is **one request per connection**: it reads one line,
 * writes one response line, and closes — except `events.subscribe`, which
 * commandeers the connection into a permanent push stream instead of ever
 * accepting a second request. So `request()` opens and tears down its own
 * socket per call, and `subscribe()` opens a separate, dedicated connection
 * that stays open for the life of the subscription.
 */
export class HerdrClient {
  constructor(private readonly socketPath: string) {}

  /** Opens a fresh connection, writes one request line, resolves with the single response's `result`. */
  request<T = unknown>(method: string, params: Record<string, unknown> = {}): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const socket = createConnection(this.socketPath);
      let buffer = '';
      let settled = false;

      socket.setEncoding('utf8');

      socket.once('connect', () => {
        const line = JSON.stringify({ id: randomUUID(), method, params });
        socket.write(`${line}\n`);
      });

      socket.on('data', (chunk: string) => {
        if (settled) return;
        buffer += chunk;
        const newlineIndex = buffer.indexOf('\n');
        if (newlineIndex === -1) return;

        settled = true;
        const line = buffer.slice(0, newlineIndex);
        socket.end();

        let parsed: RawHerdrLine;
        try {
          parsed = JSON.parse(line) as RawHerdrLine;
        } catch (err) {
          reject(err instanceof Error ? err : new Error(String(err)));
          return;
        }

        if (parsed.ok === false) {
          reject(
            new HerdrRequestError(
              parsed.error?.code ?? 'herdr_error',
              parsed.error?.message ?? 'herdr request failed'
            )
          );
        } else {
          resolve(parsed.result as T);
        }
      });

      socket.once('error', (err) => {
        if (settled) return;
        settled = true;
        reject(err);
      });

      socket.once('close', () => {
        if (settled) return;
        settled = true;
        reject(new Error('herdr connection closed before a response arrived'));
      });
    });
  }

  /**
   * Opens a dedicated connection, sends `events.subscribe`, and keeps it
   * open. Waits for herdr's first reply line to decide success/failure (an
   * invalid `subscriptions` entry — e.g. a missing per-pane `pane_id` — comes
   * back as an error on that first line, not a thrown connect error).
   * `onEvent` fires for every pushed `EventEnvelope` after that; the returned
   * handle emits "disconnect" when the socket closes and exposes `close()`.
   */
  subscribe(
    specs: HerdrSubscriptionSpec[],
    onEvent: (event: HerdrPushedEvent) => void
  ): Promise<HerdrSubscription> {
    return new Promise<HerdrSubscription>((resolve, reject) => {
      const socket = createConnection(this.socketPath);
      const handle = new HerdrSubscriptionHandle(socket);
      let buffer = '';
      let settled = false;
      let sawAck = false;

      socket.setEncoding('utf8');

      socket.once('connect', () => {
        const line = JSON.stringify({
          id: randomUUID(),
          method: 'events.subscribe',
          params: { subscriptions: specs },
        });
        socket.write(`${line}\n`);
      });

      socket.on('data', (chunk: string) => {
        buffer += chunk;
        let newlineIndex = buffer.indexOf('\n');
        while (newlineIndex !== -1) {
          const rawLine = buffer.slice(0, newlineIndex);
          buffer = buffer.slice(newlineIndex + 1);
          newlineIndex = buffer.indexOf('\n');
          if (rawLine.trim().length === 0) continue;

          let parsed: RawHerdrLine;
          try {
            parsed = JSON.parse(rawLine) as RawHerdrLine;
          } catch {
            continue; // ponytail: malformed line from herdr — drop it, not our contract to enforce
          }

          if (!sawAck) {
            sawAck = true;
            if (parsed.error) {
              settled = true;
              socket.end();
              // Preserve `code` (not just `message`) same as `request()` —
              // `HostRuntime` needs to distinguish a recoverable
              // `pane_not_found` (one stale per-pane subscription spec,
              // herdr rejects the WHOLE subscribe call) from a real
              // connection failure. See `HostRuntime.subscribeWithPaneRecovery`.
              reject(
                new HerdrRequestError(
                  parsed.error.code ?? 'herdr_error',
                  parsed.error.message ?? 'events.subscribe failed'
                )
              );
              return;
            }
            settled = true;
            resolve(handle);
            continue; // the ack itself (`SubscriptionStarted {}`) carries no event
          }

          if (typeof parsed.event === 'string') {
            onEvent({ event: herdrEventKindToDotName(parsed.event), data: parsed.data });
          }
        }
      });

      socket.once('error', (err) => {
        if (!settled) {
          settled = true;
          reject(err);
          return;
        }
        handle.emit('disconnect', err);
      });

      socket.once('close', () => {
        if (!settled) {
          settled = true;
          reject(new Error('herdr connection closed before subscribing'));
          return;
        }
        handle.emit('disconnect');
      });
    });
  }
}
