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
  type HerdrPushedEvent,
  type HerdrSubscription,
  type HerdrSubscriptionSpec,
} from "./client.js";
import { WorkspaceTabNameCache } from "./names.js";
import { herdrConfigDir, resolveHostKeybinds, type HostKeybinds } from "./keybinds.js";
import { projectPane, projectTab, projectWorkspace } from "./project.js";
import { HostMutationQueue, PaneWriteQueue } from "./write-queue.js";

const MIN_BACKOFF_MS = 1000;
const MAX_BACKOFF_MS = 30_000;

/**
 * How often the bridge polls `pane.list` per host to detect
 * `agent_status` changes and synthesize `pane.agent_status_changed`
 * events (same synthesis pattern as tier-2's `OutputPoller`). herdr's
 * `pane.agent_status_changed` subscription requires a `pane_id` per
 * `Subscription::PaneAgentStatusChanged` (`src/api/schema/events.rs` in
 * the herdr repo) — there is no wildcard/global form — so covering every
 * pane via herdr's own push subscription would mean rebuilding the
 * bridge's one persistent event subscription on every pane
 * create/close. That resubscribe-on-churn was the root cause of a
 * phantom-event storm on herdr builds that replay their event backlog
 * on a new subscription (fixed upstream in herdr commit `20a500a7`, not
 * yet in every deployed herdr). Polling instead keeps the lifecycle
 * event subscription connection static and long-lived.
 */
const AGENT_STATUS_POLL_INTERVAL_MS = 5000;

export class HostUnavailableError extends Error {
  readonly code = "host_unavailable";
  constructor(host: string) {
    super(`host "${host}" is not connected`);
  }
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
  /** Known panes' last-seen `agent_status`, used both as general pane bookkeeping (placement cache correctness) and as the diff baseline for `pollAgentStatus()` — see that method's doc. */
  private readonly paneAgentStatus = new Map<string, HerdrPaneInfo["agent_status"]>();
  private subscription: HerdrSubscription | null = null;
  /** Guards against a superseded subscribe (resubscribe in flight) acting on stale disconnect/settle events. */
  private subscriptionGeneration = 0;
  private connected = false;
  private lastError: string | undefined;
  private backoffMs = MIN_BACKOFF_MS;
  private stopped = true;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private agentStatusPollTimer: ReturnType<typeof setInterval> | null = null;
  /** Lazily resolved, cached for the life of this `HostRuntime` — see `getHostKeybinds()` doc. */
  private hostKeybindsCache: HostKeybinds | undefined;

  constructor(
    private readonly config: HostConfig,
    // ponytail: test-only override so unit tests don't have to wait out a
    // real 5s interval; production callers always use the default.
    private readonly agentStatusPollIntervalMs = AGENT_STATUS_POLL_INTERVAL_MS,
  ) {
    super();
    this.name = config.name;
    this.client = new HerdrClient(config.socket);
  }

  state(): HostSummary {
    const summary: HostSummary = { name: this.name, connected: this.connected };
    if (this.lastError !== undefined) summary.last_error = this.lastError;
    return summary;
  }

  /**
   * Reads this host's `[keys].prefix` off the bridge process's own
   * filesystem (herdr has no API/CLI surface for keybinds — see
   * `keybinds.ts` doc), normalized to a display string. Every host this
   * bridge supports today is a local Unix-domain-socket host, so "this
   * host's config" and "the bridge process's own `~/.config/herdr/config.toml`"
   * are the same file in practice; per-host resolution is kept here (rather
   * than a bridge-global constant) so a future non-local-filesystem host
   * has a natural place to instead return `undefined`.
   *
   * Cached after the first call for the life of this `HostRuntime` — a
   * `config.toml` prefix change made while the bridge is already running
   * is not picked up until restart (documented limitation).
   */
  getHostKeybinds(): HostKeybinds {
    if (!this.hostKeybindsCache) {
      this.hostKeybindsCache = resolveHostKeybinds(herdrConfigDir());
    }
    return this.hostKeybindsCache;
  }

  start(): void {
    this.stopped = false;
    // Runs for the lifetime of this runtime, not just while connected —
    // `pollAgentStatus()` itself no-ops while `connected` is false.
    this.agentStatusPollTimer = setInterval(() => void this.pollAgentStatus(), this.agentStatusPollIntervalMs);
    void this.connectOnce();
  }

  stop(): void {
    this.stopped = true;
    this.subscriptionGeneration++; // orphan any in-flight/erroring subscribe attempts
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.agentStatusPollTimer) clearInterval(this.agentStatusPollTimer);
    this.agentStatusPollTimer = null;
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
    this.paneAgentStatus.set(pane.pane_id, pane.agent_status);
    this.names.setPanePlacement(pane.pane_id, pane.workspace_id, pane.tab_id);
  }

  private untrackPane(paneId: string): void {
    this.paneAgentStatus.delete(paneId);
    this.names.removePane(paneId);
  }

  private trackTab(tab: HerdrTabDetail): void {
    this.names.setTab(tab.tab_id, tab.label, tab.workspace_id);
  }

  private trackWorkspace(workspace: HerdrWorkspaceDetail): void {
    this.names.setWorkspace(workspace.workspace_id, workspace.label);
  }

  /** Drops a batch of cascade-closed pane ids from the agent-status baseline (name cache is already purged by the caller). */
  private purgeCascade(paneIds: string[]): void {
    for (const id of paneIds) this.paneAgentStatus.delete(id);
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
      this.paneAgentStatus.clear();
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
   * Tier-1's `pane.created`/`pane.closed` and tier-3's eight lifecycle
   * kinds are all global (`Subscription::X {}`, no `pane_id`), so this
   * spec set is fixed — it does NOT depend on the live pane-id set, unlike
   * the old per-pane `pane.agent_status_changed` specs it used to also
   * carry (see `AGENT_STATUS_POLL_INTERVAL_MS`'s doc for why those moved
   * to polling instead). A fixed spec set means `establishSubscription()`
   * never needs to be rebuilt in response to pane/tab/workspace churn.
   */
  private buildSubscriptionSpecs(): HerdrSubscriptionSpec[] {
    const specs: HerdrSubscriptionSpec[] = [{ type: "pane.created" }, { type: "pane.closed" }];
    for (const kind of LIFECYCLE_EVENT_KINDS) specs.push({ type: kind });
    return specs;
  }

  /**
   * Polls `pane.list` and emits a synthetic `pane.agent_status_changed`
   * bridge-event for any pane whose `agent_status` differs from the last
   * seen value — see `AGENT_STATUS_POLL_INTERVAL_MS`'s doc for why this
   * replaces herdr's per-pane push subscription. A pane seen for the first
   * time (no baseline yet) is seeded silently, matching the old push
   * subscription's semantics: no event for the value already known at
   * subscribe time. `trackPane` updates the baseline for every pane on
   * every tick regardless, so this also keeps the name-cache placement
   * fresh as a side effect.
   */
  private async pollAgentStatus(): Promise<void> {
    if (!this.connected) return;
    let panes: HerdrPaneInfo[];
    try {
      const result = await this.client.request<{ panes: HerdrPaneInfo[] }>("pane.list");
      panes = result.panes;
    } catch {
      return; // ponytail: transient poll failure — next tick retries, same as OutputPoller's pane.read
    }
    for (const pane of panes) {
      const previous = this.paneAgentStatus.get(pane.pane_id);
      this.trackPane(pane);
      if (previous !== undefined && previous !== pane.agent_status) {
        const event: WsEvent<"pane.agent_status_changed"> = {
          host: this.name,
          event: "pane.agent_status_changed",
          payload: { id: pane.pane_id, host: this.name, agent_status: pane.agent_status },
        };
        this.emit("bridge-event", event);
      }
    }
  }

  /**
   * Opens the (static, pane-id-independent) subscription connection and
   * swaps it in for the old one (if any), using `subscriptionGeneration`
   * so a deliberate swap's `disconnect` on the OLD handle doesn't get
   * mistaken for a real outage and trigger a redundant full reconnect.
   * Only called from `connectOnce()` — never in response to a
   * pane/tab/workspace lifecycle event, since the spec set no longer
   * depends on any of that state.
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

  private handlePushedEvent(pushed: HerdrPushedEvent): void {
    const host = this.name;
    const data = pushed.data as Record<string, unknown> | undefined;

    switch (pushed.event as EventKind) {
      case "pane.created": {
        const pane = (data as { pane?: HerdrPaneInfo } | undefined)?.pane;
        if (!pane) return;
        this.trackPane(pane);
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
        this.untrackPane(paneId);
        const event: WsEvent<"pane.closed"> = {
          host,
          event: "pane.closed",
          payload: { id: paneId, host, workspace: { id: workspaceId } },
        };
        this.emit("bridge-event", event);
        return;
      }
      // "pane.agent_status_changed" is no longer a subscribed push kind —
      // `pollAgentStatus()` synthesizes it instead (see that method's doc)
      // — so it never reaches this switch; no case needed here.

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
