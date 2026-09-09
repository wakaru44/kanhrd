import { EventEmitter } from "node:events";
import type {
  BridgeEventPayload,
  BridgeMethodParams,
  BridgeMethodResult,
  EventKind,
  HerdrOkResult,
  HerdrPaneInfo,
  HerdrPaneMoveResult,
  HerdrPaneReadResult,
  HerdrTabCreateResult,
  HerdrTabDetail,
  HerdrTabMoveResult,
  HerdrTabRenameResult,
  HerdrWorkspaceCreateResult,
  HerdrWorkspaceDetail,
  HerdrWorkspaceRenameResult,
  HostSummary,
  Pane,
  ReadFormat,
  ReadSource,
  WorkspaceSummary,
  WsEvent,
} from "@kanhrd/schema";
import type { HostConfig } from "../config.js";
import {
  HerdrClient,
  HerdrRequestError,
  type HerdrPushedEvent,
  type HerdrSubscription,
  type HerdrSubscriptionSpec,
} from "./client.js";
import { WorkspaceTabNameCache } from "./names.js";
import { projectPane, projectTab, projectWorkspace } from "./project.js";
import { HostMutationQueue, PaneWriteQueue } from "./write-queue.js";

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
 * Extracts the offending `pane_id` from a herdr `pane_not_found` error
 * raised while validating an `events.subscribe` request (message format
 * `"pane <id> not found"`, verified live). Returns `undefined` for anything
 * else — including a `pane_not_found` from some other subscription kind
 * this bridge doesn't build with a `pane_id`, since the regex just won't
 * match a message this parser doesn't expect, which is the safe failure
 * mode (falls through to "not recoverable").
 */
function stalePaneIdFromError(err: unknown): string | undefined {
  if (!(err instanceof HerdrRequestError) || err.code !== "pane_not_found") return undefined;
  return /^pane (\S+) not found$/.exec(err.message)?.[1];
}

/**
 * Tier-3's eight lifecycle event kinds. `Subscription::X {}` — all global
 * (no `pane_id`), unlike `pane.agent_status_changed`. See
 * CONTRACT-TIER3.md section 4.
 */
const LIFECYCLE_EVENT_KINDS: EventKind[] = [
  "workspace.created",
  "workspace.closed",
  "workspace.renamed",
  "tab.created",
  "tab.closed",
  "tab.renamed",
  "tab.moved",
  "pane.moved",
];

/**
 * Owns one herdr socket connection for one configured host: connect, seed
 * the workspace/tab name cache, subscribe to the tier-1/tier-3 event kinds,
 * reconnect with backoff on drop, and translate pushed `EventEnvelope`s into
 * bridge `WsEvent` frames (emitted as "bridge-event" for `ws/server.ts` to
 * fan out to subscribed browser connections).
 */
export class HostRuntime extends EventEmitter {
  readonly name: string;
  private readonly names = new WorkspaceTabNameCache();
  private readonly client: HerdrClient;
  private readonly writeQueue = new PaneWriteQueue();
  /** Tier-3: one FIFO per host for pane/tab/workspace lifecycle mutations — see `HostMutationQueue` doc. */
  private readonly mutationQueue = new HostMutationQueue();
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
    for (const pane of result.panes) this.trackPane(pane);
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

  // --- Tier-3 (pane/tab/workspace lifecycle), lane LC3 -----------------
  //
  // All ten proxy straight to the matching herdr `Method::` (dot-name
  // identical, verified against src/api/schema.rs), serialized through
  // `mutationQueue` (one FIFO per host — see that class's doc for why),
  // and project any returned pane/tab/workspace the same way tier-1/2
  // already does. herdr's success-result enum is `#[serde(tag = "type")]`
  // with the payload under a named field (verified against
  // src/api/schema/response.rs) — `pane.move`'s is nested under
  // `move_result`, unlike every other tier-3 result, which nests under the
  // resource's own name (`pane`/`tab`/`workspace`) or is flat (`tabs`).

  async paneSplit(params: BridgeMethodParams["pane.split"]): Promise<BridgeMethodResult["pane.split"]> {
    if (!this.connected) throw new HostUnavailableError(this.name);
    return this.mutationQueue.enqueue(this.name, async () => {
      const requestParams: Record<string, unknown> = { direction: params.direction };
      if (params.workspace_id !== undefined) requestParams.workspace_id = params.workspace_id;
      if (params.target_pane_id !== undefined) requestParams.target_pane_id = params.target_pane_id;
      if (params.ratio !== undefined) requestParams.ratio = params.ratio;
      if (params.cwd !== undefined) requestParams.cwd = params.cwd;
      if (params.focus !== undefined) requestParams.focus = params.focus;
      if (params.env !== undefined) requestParams.env = params.env;
      const result = await this.client.request<{ pane: HerdrPaneInfo }>("pane.split", requestParams);
      this.trackPane(result.pane);
      return { pane: projectPane(this.name, result.pane, this.names) };
    });
  }

  async paneClose(params: { pane_id: string }): Promise<void> {
    if (!this.connected) throw new HostUnavailableError(this.name);
    await this.mutationQueue.enqueue(this.name, () =>
      this.client.request<HerdrOkResult>("pane.close", { pane_id: params.pane_id }),
    );
    // Belt-and-suspenders alongside the `pane.closed` event handler — see
    // that handler's doc for why closing is otherwise event-driven.
    this.untrackPane(params.pane_id);
  }

  async paneMove(params: BridgeMethodParams["pane.move"]): Promise<BridgeMethodResult["pane.move"]> {
    if (!this.connected) throw new HostUnavailableError(this.name);
    return this.mutationQueue.enqueue(this.name, async () => {
      const requestParams: Record<string, unknown> = { pane_id: params.pane_id, destination: params.destination };
      if (params.focus !== undefined) requestParams.focus = params.focus;
      const result = await this.client.request<{ move_result: HerdrPaneMoveResult }>("pane.move", requestParams);
      const move = result.move_result;
      this.applyPaneMoveCache(move);
      const projected: BridgeMethodResult["pane.move"] = {
        changed: move.changed,
        pane: projectPane(this.name, move.pane, this.names),
        previous_workspace_id: move.previous_workspace_id,
        previous_tab_id: move.previous_tab_id,
      };
      if (move.reason !== undefined) projected.reason = move.reason;
      if (move.created_workspace !== undefined)
        projected.created_workspace = projectWorkspace(this.name, move.created_workspace);
      if (move.created_tab !== undefined) projected.created_tab = projectTab(this.name, move.created_tab);
      if (move.closed_workspace_id !== undefined) projected.closed_workspace_id = move.closed_workspace_id;
      if (move.closed_tab_id !== undefined) projected.closed_tab_id = move.closed_tab_id;
      return projected;
    });
  }

  async tabCreate(params: BridgeMethodParams["tab.create"]): Promise<BridgeMethodResult["tab.create"]> {
    if (!this.connected) throw new HostUnavailableError(this.name);
    return this.mutationQueue.enqueue(this.name, async () => {
      const requestParams: Record<string, unknown> = {};
      if (params.workspace_id !== undefined) requestParams.workspace_id = params.workspace_id;
      if (params.cwd !== undefined) requestParams.cwd = params.cwd;
      if (params.focus !== undefined) requestParams.focus = params.focus;
      if (params.label !== undefined) requestParams.label = params.label;
      if (params.env !== undefined) requestParams.env = params.env;
      const result = await this.client.request<HerdrTabCreateResult>("tab.create", requestParams);
      this.trackTab(result.tab);
      this.trackPane(result.root_pane);
      return { tab: projectTab(this.name, result.tab), pane: projectPane(this.name, result.root_pane, this.names) };
    });
  }

  async tabRename(params: BridgeMethodParams["tab.rename"]): Promise<BridgeMethodResult["tab.rename"]> {
    if (!this.connected) throw new HostUnavailableError(this.name);
    return this.mutationQueue.enqueue(this.name, async () => {
      const result = await this.client.request<HerdrTabRenameResult>("tab.rename", {
        tab_id: params.tab_id,
        label: params.label,
      });
      this.trackTab(result.tab);
      return { tab: projectTab(this.name, result.tab) };
    });
  }

  async tabClose(params: { tab_id: string }): Promise<void> {
    if (!this.connected) throw new HostUnavailableError(this.name);
    await this.mutationQueue.enqueue(this.name, () =>
      this.client.request<HerdrOkResult>("tab.close", { tab_id: params.tab_id }),
    );
    // Belt-and-suspenders alongside the `tab.closed` event handler — purge
    // nested panes now rather than wait for the event round trip.
    this.purgeCascade(this.names.purgeTab(params.tab_id).paneIds);
  }

  async tabMove(params: BridgeMethodParams["tab.move"]): Promise<BridgeMethodResult["tab.move"]> {
    if (!this.connected) throw new HostUnavailableError(this.name);
    return this.mutationQueue.enqueue(this.name, async () => {
      const result = await this.client.request<HerdrTabMoveResult>("tab.move", {
        tab_id: params.tab_id,
        insert_index: params.insert_index,
      });
      for (const tab of result.tabs) this.trackTab(tab);
      return { tabs: result.tabs.map((tab) => projectTab(this.name, tab)) };
    });
  }

  async workspaceCreate(
    params: BridgeMethodParams["workspace.create"],
  ): Promise<BridgeMethodResult["workspace.create"]> {
    if (!this.connected) throw new HostUnavailableError(this.name);
    return this.mutationQueue.enqueue(this.name, async () => {
      const requestParams: Record<string, unknown> = {};
      if (params.source_workspace_id !== undefined) requestParams.source_workspace_id = params.source_workspace_id;
      if (params.cwd !== undefined) requestParams.cwd = params.cwd;
      if (params.focus !== undefined) requestParams.focus = params.focus;
      if (params.label !== undefined) requestParams.label = params.label;
      if (params.env !== undefined) requestParams.env = params.env;
      const result = await this.client.request<HerdrWorkspaceCreateResult>("workspace.create", requestParams);
      this.trackWorkspace(result.workspace);
      this.trackTab(result.tab);
      this.trackPane(result.root_pane);
      return {
        workspace: projectWorkspace(this.name, result.workspace),
        tab: projectTab(this.name, result.tab),
        pane: projectPane(this.name, result.root_pane, this.names),
      };
    });
  }

  async workspaceRename(
    params: BridgeMethodParams["workspace.rename"],
  ): Promise<BridgeMethodResult["workspace.rename"]> {
    if (!this.connected) throw new HostUnavailableError(this.name);
    return this.mutationQueue.enqueue(this.name, async () => {
      const result = await this.client.request<HerdrWorkspaceRenameResult>("workspace.rename", {
        workspace_id: params.workspace_id,
        label: params.label,
      });
      this.trackWorkspace(result.workspace);
      return { workspace: projectWorkspace(this.name, result.workspace) };
    });
  }

  /**
   * `close_group` propagates verbatim; herdr's `workspace_group_close_required`
   * error (CONTRACT-TIER3.md section 5.4) surfaces to the caller as a
   * `HerdrRequestError` via `HerdrClient.request` and reaches the browser
   * through `dispatch.ts`'s generic error mapping — no special-casing needed
   * here.
   */
  async workspaceClose(params: { workspace_id: string; close_group?: boolean }): Promise<void> {
    if (!this.connected) throw new HostUnavailableError(this.name);
    const requestParams: Record<string, unknown> = { workspace_id: params.workspace_id };
    if (params.close_group !== undefined) requestParams.close_group = params.close_group;
    await this.mutationQueue.enqueue(this.name, () =>
      this.client.request<HerdrOkResult>("workspace.close", requestParams),
    );
    // Belt-and-suspenders alongside the `workspace.closed` event handler.
    const purged = this.names.purgeWorkspace(params.workspace_id);
    this.purgeCascade(purged.paneIds);
  }

  // --- pane/tab/workspace cache bookkeeping -----------------------------

  private trackPane(pane: HerdrPaneInfo): void {
    this.paneIds.add(pane.pane_id);
    this.names.setPanePlacement(pane.pane_id, pane.workspace_id, pane.tab_id);
  }

  private untrackPane(paneId: string): void {
    this.paneIds.delete(paneId);
    this.names.removePane(paneId);
  }

  private trackTab(tab: HerdrTabDetail): void {
    this.names.setTab(tab.tab_id, tab.label, tab.workspace_id);
  }

  private trackWorkspace(workspace: HerdrWorkspaceDetail): void {
    this.names.setWorkspace(workspace.workspace_id, workspace.label);
  }

  /** Drops a batch of pane ids from the subscription-relevant set, resubscribing only if any were actually present. */
  private purgeCascade(paneIds: string[]): void {
    let changed = false;
    for (const id of paneIds) {
      if (this.paneIds.delete(id)) changed = true;
    }
    if (changed) this.scheduleResubscribe();
  }

  private applyPaneMoveCache(move: HerdrPaneMoveResult): void {
    if (!move.changed) return;
    this.trackPane(move.pane);
    if (move.created_workspace !== undefined) this.trackWorkspace(move.created_workspace);
    if (move.created_tab !== undefined) this.trackTab(move.created_tab);
    if (move.closed_workspace_id !== undefined) {
      this.purgeCascade(this.names.purgeWorkspace(move.closed_workspace_id).paneIds);
    }
    if (move.closed_tab_id !== undefined) {
      this.purgeCascade(this.names.purgeTab(move.closed_tab_id).paneIds);
    }
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
      for (const pane of paneList.panes) this.trackPane(pane);

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
   * Tier-3's eight lifecycle kinds are all global (`Subscription::X {}`),
   * so they're added once, unconditionally. `includePaneAgentStatus: false`
   * builds the degraded fallback used by `subscribeWithPaneRecovery` when
   * per-pane specs can't be made to validate — see that method's doc.
   */
  private buildSubscriptionSpecs(includePaneAgentStatus = true): HerdrSubscriptionSpec[] {
    const specs: HerdrSubscriptionSpec[] = [{ type: "pane.created" }, { type: "pane.closed" }];
    for (const kind of LIFECYCLE_EVENT_KINDS) specs.push({ type: kind });
    if (includePaneAgentStatus) {
      for (const paneId of this.paneIds) {
        specs.push({ type: "pane.agent_status_changed", pane_id: paneId });
      }
    }
    return specs;
  }

  /**
   * `client.subscribe()` validates EVERY entry in the `subscriptions` array
   * and rejects the WHOLE request if any one is invalid (verified against
   * live herdr: `{"error":{"code":"pane_not_found","message":"pane <id> not
   * found"}}`) — so a single pane that closed between our last `pane.list`
   * and this subscribe attempt landing kills subscribe entirely, even
   * though every OTHER spec in the batch was fine and the socket itself is
   * healthy. On a busy shared herdr this happens routinely, not
   * exceptionally.
   *
   * This prunes the offending `pane_id` (from `paneIds` and the name cache)
   * and retries, up to once per currently-known pane — a real fix, not a
   * blind retry, since each failure identifies exactly which id to drop.
   * If pruning doesn't converge (or there's nothing left to prune), it
   * falls back to subscribing WITHOUT any per-pane
   * `pane.agent_status_changed` specs at all: agent-status pushes go stale
   * until the next `pane.created`-triggered debounced resubscribe (already
   * existing behavior) gets another chance, but the host stays subscribed
   * and connected instead of cycling.
   *
   * Only a non-`pane_not_found` failure (or the degraded attempt itself
   * failing) propagates to the caller — that's the actual "something is
   * wrong with this socket/host" signal `establishSubscription` should
   * treat as fatal.
   */
  private async subscribeWithPaneRecovery(): Promise<HerdrSubscription> {
    let attemptsLeft = this.paneIds.size + 1;
    for (;;) {
      try {
        return await this.client.subscribe(this.buildSubscriptionSpecs(), (pushed) =>
          this.handlePushedEvent(pushed),
        );
      } catch (err) {
        const staleId = stalePaneIdFromError(err);
        attemptsLeft--;
        if (staleId && this.paneIds.delete(staleId)) {
          this.names.removePane(staleId);
          if (attemptsLeft > 0) continue;
        }
        break; // not a recoverable stale-pane_id error, or retries exhausted
      }
    }
    return this.client.subscribe(this.buildSubscriptionSpecs(false), (pushed) => this.handlePushedEvent(pushed));
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

    const subscription = await this.subscribeWithPaneRecovery();

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
        this.trackPane(pane);
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
        this.untrackPane(paneId);
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

      // --- Tier-3 lifecycle events, lane LC3 ---------------------------
      // Cache invalidation per CONTRACT-TIER3.md section 6: renamed/created
      // update the name cache in place (no refetch); closed purges the
      // resource and everything nested under it, even though herdr's own
      // cascading closes don't emit a matching child `*.closed` event for
      // every torn-down resource (section 5.6) — the local purge is what
      // covers that gap, not a second event we'd otherwise wait for.

      case "workspace.created": {
        const workspace = (data as { workspace?: HerdrWorkspaceDetail } | undefined)?.workspace;
        if (!workspace) return;
        this.trackWorkspace(workspace);
        const event: WsEvent<"workspace.created"> = {
          host,
          event: "workspace.created",
          payload: { workspace: projectWorkspace(host, workspace) },
        };
        this.emit("bridge-event", event);
        return;
      }
      case "workspace.closed": {
        const info = data as { workspace_id?: string; workspace?: HerdrWorkspaceDetail } | undefined;
        if (!info?.workspace_id) return;
        this.purgeCascade(this.names.purgeWorkspace(info.workspace_id).paneIds);
        const payload: { id: string; host: string; workspace?: WorkspaceSummary } = {
          id: info.workspace_id,
          host,
        };
        if (info.workspace !== undefined) payload.workspace = projectWorkspace(host, info.workspace);
        const event: WsEvent<"workspace.closed"> = { host, event: "workspace.closed", payload };
        this.emit("bridge-event", event);
        return;
      }
      case "workspace.renamed": {
        const info = data as { workspace_id?: string; label?: string } | undefined;
        if (!info?.workspace_id || info.label === undefined) return;
        this.names.setWorkspace(info.workspace_id, info.label);
        const event: WsEvent<"workspace.renamed"> = {
          host,
          event: "workspace.renamed",
          payload: { id: info.workspace_id, host, name: info.label },
        };
        this.emit("bridge-event", event);
        return;
      }
      case "tab.created": {
        const tab = (data as { tab?: HerdrTabDetail } | undefined)?.tab;
        if (!tab) return;
        this.trackTab(tab);
        const event: WsEvent<"tab.created"> = {
          host,
          event: "tab.created",
          payload: { tab: projectTab(host, tab) },
        };
        this.emit("bridge-event", event);
        return;
      }
      case "tab.closed": {
        const info = data as { tab_id?: string; workspace_id?: string } | undefined;
        if (!info?.tab_id || !info.workspace_id) return;
        this.purgeCascade(this.names.purgeTab(info.tab_id).paneIds);
        const event: WsEvent<"tab.closed"> = {
          host,
          event: "tab.closed",
          payload: { id: info.tab_id, host, workspace: { id: info.workspace_id } },
        };
        this.emit("bridge-event", event);
        return;
      }
      case "tab.renamed": {
        const info = data as { tab_id?: string; workspace_id?: string; label?: string } | undefined;
        if (!info?.tab_id || !info.workspace_id || info.label === undefined) return;
        this.names.setTab(info.tab_id, info.label, info.workspace_id);
        const event: WsEvent<"tab.renamed"> = {
          host,
          event: "tab.renamed",
          payload: { id: info.tab_id, host, workspace: { id: info.workspace_id }, name: info.label },
        };
        this.emit("bridge-event", event);
        return;
      }
      case "tab.moved": {
        const info = data as { workspace_id?: string; tabs?: HerdrTabDetail[] } | undefined;
        if (!info?.workspace_id || !info.tabs) return;
        for (const tab of info.tabs) this.trackTab(tab);
        const event: WsEvent<"tab.moved"> = {
          host,
          event: "tab.moved",
          payload: {
            host,
            workspace: { id: info.workspace_id },
            tabs: info.tabs.map((tab) => projectTab(host, tab)),
          },
        };
        this.emit("bridge-event", event);
        return;
      }
      case "pane.moved": {
        const info = data as
          | {
              previous_workspace_id?: string;
              previous_tab_id?: string;
              pane?: HerdrPaneInfo;
              created_workspace?: HerdrWorkspaceDetail;
              created_tab?: HerdrTabDetail;
              closed_workspace_id?: string;
              closed_tab_id?: string;
            }
          | undefined;
        if (!info?.pane || !info.previous_workspace_id || !info.previous_tab_id) return;
        this.applyPaneMoveCache({
          changed: true,
          previous_pane_id: info.pane.pane_id,
          previous_workspace_id: info.previous_workspace_id,
          previous_tab_id: info.previous_tab_id,
          pane: info.pane,
          focused_pane_id: info.pane.pane_id,
          ...(info.created_workspace !== undefined ? { created_workspace: info.created_workspace } : {}),
          ...(info.created_tab !== undefined ? { created_tab: info.created_tab } : {}),
          ...(info.closed_workspace_id !== undefined ? { closed_workspace_id: info.closed_workspace_id } : {}),
          ...(info.closed_tab_id !== undefined ? { closed_tab_id: info.closed_tab_id } : {}),
        });
        const payload: BridgeEventPayload["pane.moved"] = {
          pane: projectPane(host, info.pane, this.names),
          previous_workspace_id: info.previous_workspace_id,
          previous_tab_id: info.previous_tab_id,
        };
        if (info.created_workspace !== undefined) payload.created_workspace = projectWorkspace(host, info.created_workspace);
        if (info.created_tab !== undefined) payload.created_tab = projectTab(host, info.created_tab);
        if (info.closed_workspace_id !== undefined) payload.closed_workspace_id = info.closed_workspace_id;
        if (info.closed_tab_id !== undefined) payload.closed_tab_id = info.closed_tab_id;
        const event: WsEvent<"pane.moved"> = { host, event: "pane.moved", payload };
        this.emit("bridge-event", event);
        return;
      }
      default:
        return; // not a tier-1/tier-3 kind — ignore
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
