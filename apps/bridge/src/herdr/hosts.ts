import { EventEmitter } from "node:events";
import type {
  EventKind,
  HerdrPaneInfo,
  HerdrPaneReadResult,
  HostSummary,
  Pane,
  ReadFormat,
  ReadSource,
  WsEvent,
} from "@kanhrd/schema";
import type { HostConfig } from "../config.js";
import {
  HerdrClient,
  type HerdrPushedEvent,
  type HerdrSubscription,
  type HerdrSubscriptionSpec,
} from "./client.js";
import { WorkspaceTabNameCache } from "./names.js";
import { projectPane } from "./project.js";
import { PaneWriteQueue } from "./write-queue.js";

const MIN_BACKOFF_MS = 1000;
const MAX_BACKOFF_MS = 30_000;

/**
 * How long to wait after a pane create/close before rebuilding the
 * subscription connection with the updated pane id set. herdr's
 * `pane.agent_status_changed` subscription is per-pane only (see
 * `HerdrSubscriptionSpec`), so covering "all panes" means resubscribing
 * whenever the pane set changes; this coalesces bursts (e.g. several panes
 * opening at once) into one resubscribe instead of one per event.
 */
const RESUBSCRIBE_DEBOUNCE_MS = 250;

export class HostUnavailableError extends Error {
  readonly code = "host_unavailable";
  constructor(host: string) {
    super(`host "${host}" is not connected`);
  }
}

/**
 * Owns one herdr socket connection for one configured host: connect, seed
 * the workspace/tab name cache, subscribe to the tier-1 event kinds,
 * reconnect with backoff on drop, and translate pushed `EventEnvelope`s into
 * bridge `WsEvent` frames (emitted as "bridge-event" for `ws/server.ts` to
 * fan out to subscribed browser connections).
 */
export class HostRuntime extends EventEmitter {
  readonly name: string;
  private readonly names = new WorkspaceTabNameCache();
  private readonly client: HerdrClient;
  private readonly writeQueue = new PaneWriteQueue();
  private readonly paneIds = new Set<string>();
  private subscription: HerdrSubscription | null = null;
  /** Guards against a superseded subscribe (resubscribe in flight) acting on stale disconnect/settle events. */
  private subscriptionGeneration = 0;
  private connected = false;
  private lastError: string | undefined;
  private backoffMs = MIN_BACKOFF_MS;
  private stopped = true;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private resubscribeTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly config: HostConfig) {
    super();
    this.name = config.name;
    this.client = new HerdrClient(config.socket);
  }

  state(): HostSummary {
    const summary: HostSummary = { name: this.name, connected: this.connected };
    if (this.lastError !== undefined) summary.last_error = this.lastError;
    return summary;
  }

  start(): void {
    this.stopped = false;
    void this.connectOnce();
  }

  stop(): void {
    this.stopped = true;
    this.subscriptionGeneration++; // orphan any in-flight/erroring subscribe attempts
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.resubscribeTimer) clearTimeout(this.resubscribeTimer);
    this.subscription?.close();
    this.subscription = null;
  }

  async listPanes(): Promise<Pane[]> {
    // `pane.list` is a one-shot request — it doesn't need the subscription
    // connection to be up, but we gate on `connected` anyway: a subscription
    // outage is our signal that this host's socket/server is unreachable.
    if (!this.connected) throw new HostUnavailableError(this.name);
    const result = await this.client.request<{ panes: HerdrPaneInfo[] }>("pane.list");
    return result.panes.map((pane) => projectPane(this.name, pane, this.names));
  }

  /** Tier-2: one-shot content fetch, proxied straight to herdr's `pane.read`. */
  async paneRead(params: {
    pane_id: string;
    source?: ReadSource;
    format?: ReadFormat;
    lines?: number;
    strip_ansi?: boolean;
  }): Promise<{ content: string; revision: number; truncated: boolean; format: ReadFormat; source: ReadSource }> {
    if (!this.connected) throw new HostUnavailableError(this.name);
    const source = params.source ?? "recent";
    const format = params.format ?? "ansi";
    const requestParams: Record<string, unknown> = { pane_id: params.pane_id, source, format };
    if (params.lines !== undefined) requestParams.lines = params.lines;
    if (params.strip_ansi !== undefined) requestParams.strip_ansi = params.strip_ansi;
    // herdr's `Method::PaneRead` response nests the actual `PaneReadResult` fields under a
    // `read` key (`{"type":"pane_read","read":{...}}`), unlike `pane.list`'s flat
    // `{"type":"pane_list","panes":[...]}` shape — confirmed against a live herdr socket.
    // herdr.ts's `HerdrPaneReadResult` doc cites a flat `ResponseResult::PaneRead`; the
    // wire reality is a struct variant with a `read` field, so unwrap it here.
    const result = await this.client.request<{ read: HerdrPaneReadResult }>("pane.read", requestParams);
    const read = result.read;
    return {
      content: read.text,
      revision: read.revision,
      truncated: read.truncated,
      format: read.format,
      source: read.source,
    };
  }

  /**
   * Tier-2: proxied to herdr's `pane.send_keys`, serialized through
   * `writeQueue` — herdr dispatches each socket connection on its own
   * thread, so concurrent writes to the same pane can land out of order.
   */
  async paneSendKeys(params: { pane_id: string; keys: string[] }): Promise<void> {
    if (!this.connected) throw new HostUnavailableError(this.name);
    await this.writeQueue.enqueue(this.name, params.pane_id, () =>
      this.client.request("pane.send_keys", { pane_id: params.pane_id, keys: params.keys }),
    );
  }

  /**
   * Tier-2: proxied to herdr's `pane.send_text`, serialized through
   * `writeQueue` — see `paneSendKeys` doc for why.
   */
  async paneSendText(params: { pane_id: string; text: string }): Promise<void> {
    if (!this.connected) throw new HostUnavailableError(this.name);
    await this.writeQueue.enqueue(this.name, params.pane_id, () =>
      this.client.request("pane.send_text", { pane_id: params.pane_id, text: params.text }),
    );
  }

  /**
   * Seeds the name cache and known pane ids (one-shot requests), then opens
   * the dedicated `events.subscribe` connection. `connected` tracks that
   * subscription connection's health, not the transient request sockets —
   * those are expected to close after every single call, that's normal.
   */
  private async connectOnce(): Promise<void> {
    try {
      await this.names.refresh(this.client);
      const paneList = await this.client.request<{ panes: HerdrPaneInfo[] }>("pane.list");
      this.paneIds.clear();
      for (const pane of paneList.panes) this.paneIds.add(pane.pane_id);

      await this.establishSubscription();
    } catch (err) {
      this.connected = false;
      this.lastError = err instanceof Error ? err.message : String(err);
      this.emit("state", this.state());
      this.scheduleReconnect();
    }
  }

  /**
   * herdr's `pane.agent_status_changed` subscription is per-pane, not
   * global (see `HerdrSubscriptionSpec`), so "subscribe to every pane's
   * status changes" means listing every currently-known pane id here.
   */
  private buildSubscriptionSpecs(): HerdrSubscriptionSpec[] {
    const specs: HerdrSubscriptionSpec[] = [{ type: "pane.created" }, { type: "pane.closed" }];
    for (const paneId of this.paneIds) {
      specs.push({ type: "pane.agent_status_changed", pane_id: paneId });
    }
    return specs;
  }

  /**
   * Opens a new subscription connection reflecting the current pane id set
   * and swaps it in for the old one (if any), using `subscriptionGeneration`
   * so a deliberate swap's `disconnect` on the OLD handle doesn't get
   * mistaken for a real outage and trigger a redundant full reconnect.
   */
  private async establishSubscription(): Promise<void> {
    const generation = ++this.subscriptionGeneration;
    const previousSubscription = this.subscription;

    const subscription = await this.client.subscribe(this.buildSubscriptionSpecs(), (pushed) =>
      this.handlePushedEvent(pushed),
    );

    if (generation !== this.subscriptionGeneration) {
      subscription.close(); // superseded while connecting (e.g. stop() during connect)
      return;
    }

    subscription.on("disconnect", (err?: Error) => {
      if (generation !== this.subscriptionGeneration) return; // stale — a newer subscription replaced this one
      this.subscription = null;
      this.connected = false;
      this.lastError = err?.message ?? "connection closed";
      this.emit("state", this.state());
      this.scheduleReconnect();
    });

    this.subscription = subscription;
    this.connected = true;
    this.lastError = undefined;
    this.backoffMs = MIN_BACKOFF_MS;
    this.emit("state", this.state());

    previousSubscription?.close();
  }

  private scheduleReconnect(): void {
    if (this.stopped) return;
    const delay = this.backoffMs;
    this.backoffMs = Math.min(this.backoffMs * 2, MAX_BACKOFF_MS);
    this.reconnectTimer = setTimeout(() => void this.connectOnce(), delay);
  }

  /** Coalesces pane create/close bursts into one resubscribe instead of one per event. */
  private scheduleResubscribe(): void {
    if (this.stopped || this.resubscribeTimer) return;
    this.resubscribeTimer = setTimeout(() => {
      this.resubscribeTimer = null;
      this.establishSubscription().catch((err: unknown) => {
        this.connected = false;
        this.lastError = err instanceof Error ? err.message : String(err);
        this.emit("state", this.state());
        this.scheduleReconnect();
      });
    }, RESUBSCRIBE_DEBOUNCE_MS);
  }

  private handlePushedEvent(pushed: HerdrPushedEvent): void {
    const host = this.name;
    const data = pushed.data as Record<string, unknown> | undefined;

    switch (pushed.event as EventKind) {
      case "pane.created": {
        const pane = (data as { pane?: HerdrPaneInfo } | undefined)?.pane;
        if (!pane) return;
        this.paneIds.add(pane.pane_id);
        this.scheduleResubscribe(); // pick up this pane's agent_status_changed events
        const event: WsEvent<"pane.created"> = {
          host,
          event: "pane.created",
          payload: { pane: projectPane(host, pane, this.names) },
        };
        this.emit("bridge-event", event);
        return;
      }
      case "pane.closed": {
        const paneId = (data as { pane_id?: string } | undefined)?.pane_id;
        const workspaceId = (data as { workspace_id?: string } | undefined)?.workspace_id;
        if (!paneId || !workspaceId) return;
        // Must drop the id before the next resubscribe: a stale pane_id in
        // the subscription list fails to resolve on herdr's side and breaks
        // the whole events.subscribe call, same as a missing pane_id does.
        this.paneIds.delete(paneId);
        this.scheduleResubscribe();
        const event: WsEvent<"pane.closed"> = {
          host,
          event: "pane.closed",
          payload: { id: paneId, host, workspace: { id: workspaceId } },
        };
        this.emit("bridge-event", event);
        return;
      }
      case "pane.agent_status_changed": {
        const info = data as
          | { pane_id?: string; agent_status?: Pane["agent_status"] }
          | undefined;
        if (!info?.pane_id || !info.agent_status) return;
        const event: WsEvent<"pane.agent_status_changed"> = {
          host,
          event: "pane.agent_status_changed",
          payload: { id: info.pane_id, host, agent_status: info.agent_status },
        };
        this.emit("bridge-event", event);
        return;
      }
      default:
        return; // not a tier-1 kind — ignore
    }
  }
}

/** Holds one `HostRuntime` per configured host, keyed by host name. */
export class HostRegistry {
  private readonly hosts = new Map<string, HostRuntime>();

  constructor(configs: HostConfig[]) {
    for (const config of configs) {
      this.hosts.set(config.name, new HostRuntime(config));
    }
  }

  startAll(): void {
    for (const host of this.hosts.values()) host.start();
  }

  get(name: string): HostRuntime | undefined {
    return this.hosts.get(name);
  }

  list(): HostRuntime[] {
    return [...this.hosts.values()];
  }

  summaries(): HostSummary[] {
    return this.list().map((host) => host.state());
  }
}
