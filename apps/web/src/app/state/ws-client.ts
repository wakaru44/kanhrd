import { Injectable, inject, signal } from '@angular/core';
import { Subject } from 'rxjs';
import type {
  BridgeMethod,
  BridgeMethodParams,
  BridgeMethodResult,
  WsEvent,
  WsRequest,
  WsServerMessage,
} from '@kanhrd/schema';
import { COPY } from '../shared/copy';
import { ToastService } from './toast.service';

const INITIAL_BACKOFF_MS = 500;
const MAX_BACKOFF_MS = 30_000;

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
}

/**
 * Thin client for the bridge's single multi-host `/ws` endpoint (see
 * CONTRACT.md and packages/schema/src/wire.ts). Multiplexes request/response
 * (id-correlated, Promise-based) and unsolicited events (Observable) over
 * one socket, and auto-reconnects with exponential backoff.
 */
@Injectable({ providedIn: 'root' })
export class WsClient {
  private readonly toast = inject(ToastService);

  /** True while the socket is open and usable for `request()`. */
  readonly connected = signal(false);
  /** Human-readable reason the socket is currently down, if any. */
  readonly lastError = signal<string | null>(null);

  /**
   * Dedup identity of the bridge's connection notice. One key for the whole
   * app: a retry loop that keeps failing updates this notice rather than
   * stacking another (docs/UX-GUIDELINES.md, "quiet under load"), and
   * reconnecting removes it by this key.
   */
  private static readonly CONNECTION_NOTICE_KEY = 'bridge:connection';

  /** Whether the connection notice is currently showing, so reconnect only announces a real outage. */
  private connectionLost = false;

  private readonly eventsSubject = new Subject<WsEvent>();
  /** Every event frame pushed by the bridge, across all hosts. */
  readonly events$ = this.eventsSubject.asObservable();

  private socket: WebSocket | null = null;
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  private readonly pending = new Map<string, PendingRequest>();
  private started = false;

  /** Idempotent: safe to call more than once. */
  connect(): void {
    if (this.started) {
      return;
    }
    this.started = true;
    this.open();
  }

  /**
   * Issue one request and resolve/reject when the matching response frame
   * (same `id`) arrives. Rejects immediately if the socket isn't open —
   * callers should wait on `connected()` (e.g. via an `effect`) before
   * calling this on (re)connect.
   */
  request<M extends BridgeMethod>(
    host: string,
    method: M,
    params?: BridgeMethodParams[M]
  ): Promise<BridgeMethodResult[M] | undefined> {
    return new Promise((resolve, reject) => {
      if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
        reject(new Error(`ws not connected: cannot send ${method} to ${host}`));
        return;
      }
      const id = crypto.randomUUID();
      this.pending.set(id, {
        resolve: resolve as (value: unknown) => void,
        reject,
      });
      const req: WsRequest<M> = { id, host, method, params };
      this.socket.send(JSON.stringify(req));
    });
  }

  private open(): void {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const socket = new WebSocket(`${proto}://${location.host}/ws`);
    this.socket = socket;

    socket.addEventListener('open', () => {
      this.reconnectAttempt = 0;
      this.lastError.set(null);
      this.connected.set(true);
      if (this.connectionLost) {
        this.connectionLost = false;
        this.toast.dismissByKey(WsClient.CONNECTION_NOTICE_KEY);
        this.toast.push({ level: 'info', message: COPY.toast.bridgeReconnected });
      }
    });

    socket.addEventListener('message', (ev) => {
      this.handleMessage(ev.data as string);
    });

    socket.addEventListener('close', () => {
      const wasConnected = this.connected();
      this.connected.set(false);
      this.rejectAllPending(new Error('ws connection closed'));
      this.scheduleReconnect();
      // Only surface the "connection lost" notice once per outage, not on
      // every retry that also fails to connect. The key makes that true
      // even if this guard is ever relaxed.
      if (wasConnected && !this.connectionLost) {
        this.connectionLost = true;
        this.toast.push({
          level: 'warn',
          message: COPY.toast.bridgeDisconnected,
          persistent: true,
          key: WsClient.CONNECTION_NOTICE_KEY,
        });
      }
    });

    socket.addEventListener('error', () => {
      this.lastError.set('websocket error');
    });
  }

  private scheduleReconnect(): void {
    clearTimeout(this.reconnectTimer);
    const delay = Math.min(MAX_BACKOFF_MS, INITIAL_BACKOFF_MS * 2 ** this.reconnectAttempt);
    this.reconnectAttempt += 1;
    this.reconnectTimer = setTimeout(() => this.open(), delay);
  }

  private handleMessage(raw: string): void {
    let msg: WsServerMessage;
    try {
      msg = JSON.parse(raw) as WsServerMessage;
    } catch {
      return;
    }
    if ('id' in msg) {
      const pending = this.pending.get(msg.id);
      if (!pending) {
        return;
      }
      this.pending.delete(msg.id);
      if (msg.ok) {
        pending.resolve(msg.data);
      } else {
        pending.reject(new Error(`${msg.error.code}: ${msg.error.message}`));
      }
      return;
    }
    this.eventsSubject.next(msg);
  }

  private rejectAllPending(reason: Error): void {
    for (const pending of this.pending.values()) {
      pending.reject(reason);
    }
    this.pending.clear();
  }
}
