import WebSocket from 'ws';
import type {
  BridgeMethod,
  BridgeMethodParams,
  BridgeMethodResult,
  WsEvent,
  WsRequest,
  WsResponse,
} from '@kanhrd/schema';

let nextId = 0;

/**
 * Thin `ws`-backed client for the bridge's `/ws` endpoint, matching the
 * envelope frozen in `packages/schema/src/wire.ts`. Wraps request/response
 * correlation (by `id`) and buffers unsolicited event frames so tests can
 * either poll a snapshot (`eventsFor`) or wait for the next matching one
 * (`waitForEvent`) without racing the moment a request resolves.
 */
export class IntegrationClient {
  private readonly socket: WebSocket;
  private readonly pending = new Map<
    string,
    { resolve: (r: WsResponse) => void; reject: (e: Error) => void }
  >();
  private readonly received: WsEvent[] = [];
  private readonly waiters: Array<{
    match: (e: WsEvent) => boolean;
    resolve: (e: WsEvent) => void;
  }> = [];
  private closed = false;

  private constructor(socket: WebSocket) {
    this.socket = socket;
    socket.on('message', (raw: Buffer) => {
      const msg = JSON.parse(raw.toString('utf8')) as WsResponse | WsEvent;
      if ('id' in msg) {
        const waiter = this.pending.get(msg.id);
        if (waiter) {
          this.pending.delete(msg.id);
          waiter.resolve(msg);
        }
        return;
      }
      this.received.push(msg);
      for (let i = this.waiters.length - 1; i >= 0; i--) {
        if (this.waiters[i].match(msg)) {
          const [waiter] = this.waiters.splice(i, 1);
          waiter.resolve(msg);
        }
      }
    });
    socket.on('close', () => {
      this.closed = true;
      for (const [, waiter] of this.pending)
        waiter.reject(new Error('WebSocket closed while a request was pending'));
      this.pending.clear();
    });
  }

  static async connect(url: string): Promise<IntegrationClient> {
    const socket = new WebSocket(url);
    await new Promise<void>((resolvePromise, reject) => {
      socket.once('open', () => resolvePromise());
      socket.once('error', reject);
    });
    return new IntegrationClient(socket);
  }

  /** Sends one `WsRequest` and resolves with its correlated `WsResponse` (success or error — callers assert `ok`). */
  request<M extends BridgeMethod>(
    host: string,
    method: M,
    params?: BridgeMethodParams[M],
    timeoutMs = 5_000
  ): Promise<WsResponse<M>> {
    if (this.closed) return Promise.reject(new Error('IntegrationClient is closed'));
    const id = `int-${++nextId}`;
    const req: WsRequest<M> = { id, host, method, params };
    return new Promise<WsResponse<M>>((resolvePromise, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`request "${method}" timed out after ${timeoutMs}ms`));
      }, timeoutMs);
      this.pending.set(id, {
        resolve: (r) => {
          clearTimeout(timer);
          resolvePromise(r as WsResponse<M>);
        },
        reject: (e) => {
          clearTimeout(timer);
          reject(e);
        },
      });
      this.socket.send(JSON.stringify(req));
    });
  }

  /** Convenience: like `request`, but throws if the response is `ok: false`, and returns just `data`. */
  async call<M extends BridgeMethod>(
    host: string,
    method: M,
    params?: BridgeMethodParams[M],
    timeoutMs?: number
  ): Promise<BridgeMethodResult[M]> {
    const res = await this.request(host, method, params, timeoutMs);
    if (!res.ok) throw new Error(`"${method}" failed: ${res.error.code} — ${res.error.message}`);
    return res.data as BridgeMethodResult[M];
  }

  /** All event frames matching `match` received so far (buffered from connect time onward). */
  eventsFor(match: (e: WsEvent) => boolean): WsEvent[] {
    return this.received.filter(match);
  }

  /** Resolves with the next event frame (already-buffered or future) matching `match`, or rejects on timeout. */
  waitForEvent(match: (e: WsEvent) => boolean, timeoutMs = 3_000): Promise<WsEvent> {
    const already = this.received.find(match);
    if (already) return Promise.resolve(already);
    return new Promise<WsEvent>((resolvePromise, reject) => {
      const timer = setTimeout(() => {
        const idx = this.waiters.findIndex((w) => w.resolve === resolvePromise);
        if (idx >= 0) this.waiters.splice(idx, 1);
        reject(new Error(`timed out after ${timeoutMs}ms waiting for a matching event`));
      }, timeoutMs);
      this.waiters.push({
        match,
        resolve: (e) => {
          clearTimeout(timer);
          resolvePromise(e);
        },
      });
    });
  }

  close(): void {
    if (!this.closed) this.socket.close();
  }
}
