import { computed, effect, inject, Injectable, signal, untracked } from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { httpResource } from "@angular/common/http";
import type {
  AgentStatus,
  BridgeCapabilities,
  BridgeEventPayload,
  BridgeMethodParams,
  GetHostsResponse,
  HostSummary,
  Pane,
  TabSummary,
  WorkspaceSummary,
  WsEvent,
} from "@kanhrd/schema";
import { WsClient } from "./ws-client";
import { SettingsService, type SwimlaneDimension } from "./settings.service";

/** What a bridge that never answers (or errors on) `bridge.capabilities` gets treated as: tier-1, no terminal. */
export function fallbackCapabilities(): BridgeCapabilities {
  return {
    tier: 1,
    terminal: false,
    paneResize: false,
    paneGraphics: false,
    outputPollIntervalMs: 0,
    paneCreate: false,
    paneClose: false,
    paneMove: false,
    paneRename: false,
    tabCrud: false,
    workspaceCrud: false,
  };
}

/** Column order per CONTRACT/brief: working first so live activity shows on load. */
export const STATUS_COLUMN_ORDER: readonly AgentStatus[] = [
  "working",
  "blocked",
  "idle",
  "done",
  "unknown",
];

export type PaneKey = `${string}:${string}`;

export function paneKey(host: string, id: string): PaneKey {
  return `${host}:${id}`;
}

export interface Filters {
  /** Hosts the user has explicitly hidden. Empty = show every host. */
  excludedHosts: ReadonlySet<string>;
  /** Status columns the user has explicitly hidden. Empty = show every column. */
  hiddenStatuses: ReadonlySet<AgentStatus>;
}

export function defaultFilters(): Filters {
  return { excludedHosts: new Set(), hiddenStatuses: new Set() };
}

const FILTERS_STORAGE_KEY = "kanhrd.filters";

interface StoredFilters {
  excludedHosts: string[];
  hiddenStatuses: AgentStatus[];
}

export function loadFilters(storage: Pick<Storage, "getItem"> = localStorage): Filters {
  try {
    const raw = storage.getItem(FILTERS_STORAGE_KEY);
    if (!raw) {
      return defaultFilters();
    }
    const parsed = JSON.parse(raw) as StoredFilters;
    return {
      excludedHosts: new Set(parsed.excludedHosts ?? []),
      hiddenStatuses: new Set(parsed.hiddenStatuses ?? []),
    };
  } catch {
    return defaultFilters();
  }
}

export function saveFilters(filters: Filters, storage: Pick<Storage, "setItem"> = localStorage): void {
  const stored: StoredFilters = {
    excludedHosts: [...filters.excludedHosts],
    hiddenStatuses: [...filters.hiddenStatuses],
  };
  storage.setItem(FILTERS_STORAGE_KEY, JSON.stringify(stored));
}

// --- pure pane-map reducers (unit-tested directly, no DI/WS needed) -------

export type PaneMap = ReadonlyMap<PaneKey, Pane>;

export function applyPaneCreated(panes: PaneMap, pane: Pane): PaneMap {
  const next = new Map(panes);
  next.set(paneKey(pane.host, pane.id), pane);
  return next;
}

export function applyPaneClosed(panes: PaneMap, evt: { id: string; host: string }): PaneMap {
  const key = paneKey(evt.host, evt.id);
  if (!panes.has(key)) {
    return panes;
  }
  const next = new Map(panes);
  next.delete(key);
  return next;
}

export function applyPaneAgentStatusChanged(
  panes: PaneMap,
  evt: { id: string; host: string; agent_status: AgentStatus; status_since?: number },
): PaneMap {
  const key = paneKey(evt.host, evt.id);
  const existing = panes.get(key);
  if (!existing) {
    return panes;
  }
  const next = new Map(panes);
  // The status and the bridge's observation time for it move together: the
  // cached pane's old `status_since` belongs to the status it just left, so
  // carrying it forward would age the new status by the previous one's
  // lifetime. An event without one (older bridge) clears it instead — no
  // duration beats the wrong duration.
  const updated: Pane = { ...existing, agent_status: evt.agent_status };
  if (evt.status_since === undefined) delete updated.status_since;
  else updated.status_since = evt.status_since;
  next.set(key, updated);
  return next;
}

/**
 * Apply one bridge event frame to a pane map. Used by both the store and
 * tests. Handles the tier-1 pane events plus tier-3's `pane.moved` (a plain
 * upsert at the same `host:id` key — the event's `pane` field already
 * carries the pane's updated `workspace`/`tab` refs, resolved by the
 * bridge). It does NOT purge panes on `workspace.closed`/`tab.closed`
 * cascades — that cross-map concern lives in `applyLifecycleEvent` below,
 * which has access to the workspace/tab maps needed to know what to purge.
 *
 * `WsEvent<K>` is a single generic interface (see wire.ts), not a
 * discriminated union of concrete per-event instantiations, so switching on
 * `evt.event` alone doesn't narrow `evt.payload` for the compiler. The casts
 * below are safe because the bridge guarantees `event`/`payload` pairing on
 * the wire; runtime shape is whatever the bridge actually sent.
 */
export function applyEvent(panes: PaneMap, evt: WsEvent): PaneMap {
  switch (evt.event) {
    case "pane.created":
      return applyPaneCreated(panes, (evt.payload as BridgeEventPayload["pane.created"]).pane);
    case "pane.closed":
      return applyPaneClosed(panes, evt.payload as BridgeEventPayload["pane.closed"]);
    case "pane.agent_status_changed":
      return applyPaneAgentStatusChanged(
        panes,
        evt.payload as BridgeEventPayload["pane.agent_status_changed"],
      );
    case "pane.moved":
      return applyPaneCreated(panes, (evt.payload as BridgeEventPayload["pane.moved"]).pane);
    // herdr broadcasts the WHOLE pane on `pane.updated` (a rename from this
    // board, from herdr's own interface, or from another client), so this is
    // the same plain upsert `pane.created` does.
    case "pane.updated":
      return applyPaneCreated(panes, (evt.payload as BridgeEventPayload["pane.updated"]).pane);
    default:
      return panes;
  }
}

// --- tier-3 workspace/tab reducers (pure, unit-tested directly) ----------

export type WorkspaceMap = ReadonlyMap<PaneKey, WorkspaceSummary>;
export type TabMap = ReadonlyMap<PaneKey, TabSummary>;

/** Combined lifecycle state the store keeps in sync as one unit per event. */
export interface LifecycleState {
  panes: PaneMap;
  workspaces: WorkspaceMap;
  tabs: TabMap;
}

export function applyWorkspaceCreated(workspaces: WorkspaceMap, workspace: WorkspaceSummary): WorkspaceMap {
  const next = new Map(workspaces);
  next.set(paneKey(workspace.host, workspace.id), workspace);
  return next;
}

export function applyWorkspaceRenamed(
  workspaces: WorkspaceMap,
  evt: { id: string; host: string; name: string },
): WorkspaceMap {
  const key = paneKey(evt.host, evt.id);
  const existing = workspaces.get(key);
  if (!existing) {
    return workspaces;
  }
  const next = new Map(workspaces);
  next.set(key, { ...existing, name: evt.name });
  return next;
}

export function applyTabCreated(tabs: TabMap, tab: TabSummary): TabMap {
  const next = new Map(tabs);
  next.set(paneKey(tab.host, tab.id), tab);
  return next;
}

export function applyTabRenamed(
  tabs: TabMap,
  evt: { id: string; host: string; name: string },
): TabMap {
  const key = paneKey(evt.host, evt.id);
  const existing = tabs.get(key);
  if (!existing) {
    return tabs;
  }
  const next = new Map(tabs);
  next.set(key, { ...existing, name: evt.name });
  return next;
}

/** `tab.moved` carries the WHOLE reordered tab list for one workspace — replace that workspace's slice wholesale. */
export function applyTabsReplaced(
  tabs: TabMap,
  host: string,
  workspaceId: string,
  newTabs: readonly TabSummary[],
): TabMap {
  const next = new Map(tabs);
  for (const [key, tab] of tabs) {
    if (tab.host === host && tab.workspace.id === workspaceId) {
      next.delete(key);
    }
  }
  for (const tab of newTabs) {
    next.set(paneKey(tab.host, tab.id), tab);
  }
  return next;
}

function removeByKey<T>(map: ReadonlyMap<PaneKey, T>, key: PaneKey): ReadonlyMap<PaneKey, T> {
  if (!map.has(key)) {
    return map;
  }
  const next = new Map(map);
  next.delete(key);
  return next;
}

function purgeWhere<T>(
  map: ReadonlyMap<PaneKey, T>,
  predicate: (value: T) => boolean,
): ReadonlyMap<PaneKey, T> {
  let changed = false;
  const next = new Map(map);
  for (const [key, value] of map) {
    if (predicate(value)) {
      next.delete(key);
      changed = true;
    }
  }
  return changed ? next : map;
}

/**
 * Updates every matching pane in place. `Pane.workspace.name`/`Pane.tab.name`
 * are denormalized copies (the card's `.path` display reads them directly,
 * not `workspacesSignal`/`tabsSignal`) — without this, renaming a workspace
 * or tab would update the rail but leave every pane card showing the old
 * name forever, since nothing else re-derives a pane's display name from
 * the tab/workspace maps.
 */
function updatePanes(
  panes: PaneMap,
  predicate: (pane: Pane) => boolean,
  update: (pane: Pane) => Pane,
): PaneMap {
  let changed = false;
  const next = new Map(panes);
  for (const [key, pane] of panes) {
    if (predicate(pane)) {
      next.set(key, update(pane));
      changed = true;
    }
  }
  return changed ? next : panes;
}

/**
 * Applies one bridge event frame to the full `{panes, workspaces, tabs}`
 * state as a single unit. This is where CONTRACT-TIER3.md section 5.6's
 * cascading-close purge lives: the wire is event-lossy for implicitly
 * destroyed children (e.g. `workspace.closed` fires with no matching
 * `tab.closed`/`pane.closed` for what was nested inside), so this purges
 * every tab/pane the client had cached under the closed resource, rather
 * than waiting for child events that will never arrive.
 */
export function applyLifecycleEvent(state: LifecycleState, evt: WsEvent): LifecycleState {
  switch (evt.event) {
    case "pane.created":
    case "pane.closed":
    case "pane.agent_status_changed":
    case "pane.updated":
      return { ...state, panes: applyEvent(state.panes, evt) };

    case "workspace.created": {
      const payload = evt.payload as BridgeEventPayload["workspace.created"];
      return { ...state, workspaces: applyWorkspaceCreated(state.workspaces, payload.workspace) };
    }
    case "workspace.renamed": {
      const payload = evt.payload as BridgeEventPayload["workspace.renamed"];
      const workspaces = applyWorkspaceRenamed(state.workspaces, payload);
      const panes = updatePanes(
        state.panes,
        (p) => p.host === payload.host && p.workspace.id === payload.id,
        (p) => ({ ...p, workspace: { ...p.workspace, name: payload.name } }),
      );
      return { ...state, workspaces, panes };
    }
    case "workspace.closed": {
      const payload = evt.payload as BridgeEventPayload["workspace.closed"];
      const workspaces = removeByKey(state.workspaces, paneKey(payload.host, payload.id));
      const tabs = purgeWhere(
        state.tabs,
        (t) => t.host === payload.host && t.workspace.id === payload.id,
      );
      const panes = purgeWhere(
        state.panes,
        (p) => p.host === payload.host && p.workspace.id === payload.id,
      );
      return { panes, workspaces, tabs };
    }

    case "tab.created": {
      const payload = evt.payload as BridgeEventPayload["tab.created"];
      return { ...state, tabs: applyTabCreated(state.tabs, payload.tab) };
    }
    case "tab.renamed": {
      const payload = evt.payload as BridgeEventPayload["tab.renamed"];
      const tabs = applyTabRenamed(state.tabs, { id: payload.id, host: payload.host, name: payload.name });
      const panes = updatePanes(
        state.panes,
        (p) => p.host === payload.host && p.tab.id === payload.id,
        (p) => ({ ...p, tab: { ...p.tab, name: payload.name } }),
      );
      return { ...state, tabs, panes };
    }
    case "tab.closed": {
      const payload = evt.payload as BridgeEventPayload["tab.closed"];
      const tabs = removeByKey(state.tabs, paneKey(payload.host, payload.id));
      const panes = purgeWhere(state.panes, (p) => p.host === payload.host && p.tab.id === payload.id);
      return { ...state, tabs, panes };
    }
    case "tab.moved": {
      const payload = evt.payload as BridgeEventPayload["tab.moved"];
      return {
        ...state,
        tabs: applyTabsReplaced(state.tabs, payload.host, payload.workspace.id, payload.tabs),
      };
    }

    case "pane.moved": {
      const payload = evt.payload as BridgeEventPayload["pane.moved"];
      const panes = applyEvent(state.panes, evt);
      let workspaces = state.workspaces;
      let tabs = state.tabs;
      if (payload.created_workspace) {
        workspaces = applyWorkspaceCreated(workspaces, payload.created_workspace);
      }
      if (payload.created_tab) {
        tabs = applyTabCreated(tabs, payload.created_tab);
      }
      if (payload.closed_workspace_id) {
        const key = paneKey(payload.pane.host, payload.closed_workspace_id);
        workspaces = removeByKey(workspaces, key);
        tabs = purgeWhere(
          tabs,
          (t) => t.host === payload.pane.host && t.workspace.id === payload.closed_workspace_id,
        );
      }
      if (payload.closed_tab_id) {
        tabs = removeByKey(tabs, paneKey(payload.pane.host, payload.closed_tab_id));
      }
      return { panes, workspaces, tabs };
    }

    default:
      return state;
  }
}

export function groupByStatus(
  panes: Iterable<Pane>,
  filters: Filters,
): Record<AgentStatus, Pane[]> {
  const groups: Record<AgentStatus, Pane[]> = {
    idle: [],
    working: [],
    blocked: [],
    done: [],
    unknown: [],
  };
  for (const pane of panes) {
    if (filters.excludedHosts.has(pane.host) || filters.hiddenStatuses.has(pane.agent_status)) {
      continue;
    }
    groups[pane.agent_status].push(pane);
  }
  return groups;
}

/** Band key/label for the no-`project` fallback. Rendered last, labelled by `copy.swimlane.ungrouped`. */
const UNGROUPED_BAND_KEY = "ungrouped";

/**
 * One horizontal band of the board. `columns` keeps `groupByStatus`'s exact
 * shape, so a band renders the same column set the ungrouped board does —
 * swimlanes group cards, they never reclassify them.
 */
export interface Swimlane {
  /**
   * Stable identity for `@for ... track`. `"all"` when the dimension is
   * `none`; `"ungrouped"` for the no-`project` fallback band.
   */
  key: string;
  /** Band heading as rendered. Empty string for `"all"` and for `"ungrouped"` (the view supplies that one's copy). */
  label: string;
  columns: Record<AgentStatus, Pane[]>;
}

function bandOf(pane: Pane, dimension: Exclude<SwimlaneDimension, "none">): { key: string; label: string } {
  switch (dimension) {
    case "host":
      return { key: pane.host, label: pane.host };
    case "repository":
      return pane.project
        ? { key: pane.project.repo_name, label: pane.project.repo_name }
        : { key: UNGROUPED_BAND_KEY, label: "" };
    case "checkout":
      return pane.project
        ? { key: pane.project.checkout_path, label: pane.project.checkout_path }
        : { key: UNGROUPED_BAND_KEY, label: "" };
    case "tab":
      return { key: paneKey(pane.host, pane.tab.id), label: pane.tab.name };
  }
}

/**
 * Bands `panes` by `dimension`, applying `filters` FIRST so a filtered-out
 * pane can never keep a band alive. A band with no cards in any column is
 * not returned (proposal Q2). Bands are ordered by their label, never by
 * arrival order, so they don't reshuffle as cards move between statuses;
 * the `ungrouped` band sorts last regardless.
 */
export function groupIntoSwimlanes(
  panes: Iterable<Pane>,
  filters: Filters,
  dimension: SwimlaneDimension,
): readonly Swimlane[] {
  if (dimension === "none") {
    return [{ key: "all", label: "", columns: groupByStatus(panes, filters) }];
  }
  const bands = new Map<string, { label: string; members: Pane[] }>();
  for (const pane of panes) {
    if (filters.excludedHosts.has(pane.host) || filters.hiddenStatuses.has(pane.agent_status)) {
      continue;
    }
    const { key, label } = bandOf(pane, dimension);
    const existing = bands.get(key);
    if (existing) {
      existing.members.push(pane);
    } else {
      bands.set(key, { label, members: [pane] });
    }
  }
  // Every band here holds at least one pane that survived the filter, so the
  // "empty band is not rendered" rule needs no extra pass.
  return [...bands]
    .map(([key, band]) => ({ key, label: band.label, columns: groupByStatus(band.members, filters) }))
    .sort((a, b) => {
      if (a.key === UNGROUPED_BAND_KEY) return b.key === UNGROUPED_BAND_KEY ? 0 : 1;
      if (b.key === UNGROUPED_BAND_KEY) return -1;
      return a.label.localeCompare(b.label, undefined, { numeric: true, sensitivity: "base" });
    });
}

/**
 * Every `EventKind` the store subscribes to per host. Tier-3's eight
 * lifecycle kinds are herdr-native (CONTRACT-TIER3.md section 4) — a
 * tier-1/tier-2-only bridge simply never emits them, so subscribing to the
 * full list unconditionally is safe and avoids a second `events.subscribe`
 * round trip once tier-3 support shows up in `bridge.capabilities`.
 */
const ALL_EVENT_KINDS = [
  "pane.created",
  "pane.closed",
  "pane.agent_status_changed",
  "pane.updated",
  "workspace.created",
  "workspace.closed",
  "workspace.renamed",
  "tab.created",
  "tab.closed",
  "tab.renamed",
  "tab.moved",
  "pane.moved",
] as const;

/**
 * Signals-based store for the kanban board: hosts, panes (keyed
 * `${host}:${id}`), derived per-status columns, and persisted filters.
 * Owns the WsClient lifecycle: refetches hosts and re-subscribes every host
 * whenever the socket (re)connects.
 */
@Injectable({ providedIn: "root" })
export class PanesStore {
  private readonly ws = inject(WsClient);
  private readonly settings = inject(SettingsService);

  /** Bumped on every successful (re)connect to retrigger the hosts fetch. */
  private readonly connectTick = signal(0);

  private readonly hostsResource = httpResource<GetHostsResponse>(() => {
    this.connectTick();
    return "/api/hosts";
  });

  readonly hostsSignal = computed<HostSummary[]>(() => this.hostsResource.value()?.hosts ?? []);
  readonly hostsLoading = computed(() => this.hostsResource.isLoading());
  readonly hostsError = computed(() => {
    const err = this.hostsResource.error();
    return err ? describeError(err) : null;
  });

  readonly panesSignal = signal<PaneMap>(new Map());
  /** Tier-3: every workspace the store has seen, keyed `${host}:${id}`. */
  readonly workspacesSignal = signal<WorkspaceMap>(new Map());
  /** Tier-3: every tab the store has seen, keyed `${host}:${id}`. */
  readonly tabsSignal = signal<TabMap>(new Map());
  readonly filtersSignal = signal<Filters>(loadFilters());

  /**
   * The board's current URL scope (`/workspace/:workspaceId` or
   * `/workspace/:workspaceId/tab/:tabId`) — derived from the route by
   * `Board`'s route-sync effect, the single writer. Filters the board to a
   * workspace's (or one tab's) panes on top of `filtersSignal`. The rail
   * navigates rather than writing this directly (rail = navigator, per the
   * brief); `KeyboardService`'s tab-cycling shortcuts navigate too, so this
   * stays a pure reflection of the current URL either way.
   */
  readonly scopeSignal = signal<{ host: string; workspaceId: string; tabId: string | null } | null>(null);

  /** Convenience view of `scopeSignal` for tab-only scoping, e.g. the rail's active-tab highlight. */
  readonly tabFilterSignal = computed(() => {
    const scope = this.scopeSignal();
    return scope && scope.tabId ? { host: scope.host, tabId: scope.tabId } : null;
  });

  /**
   * Set right after a `tab.create`/`workspace.create` action succeeds, so
   * the nav rail can auto-open that item's inline rename field ("New tab" /
   * "New workspace" both create-then-rename rather than prompting up front —
   * see the tier-3 brief's "opens rename inline afterward"). The rail is
   * expected to clear this once it has consumed it.
   */
  readonly pendingRenameSignal = signal<{ kind: "workspace" | "tab"; host: string; id: string } | null>(
    null,
  );

  /**
   * Same pattern as `pendingRenameSignal`, for `KeyboardService`'s
   * `prefix+&` (close current tab): keyboard shortcuts have no direct
   * reference to `Rail`'s `ConfirmModal`, so they request a close here and
   * `Rail` consumes it to open its existing confirmation flow — the same
   * dangerous action a user gets from clicking the tab's × button.
   */
  readonly pendingCloseTabSignal = signal<{ host: string; id: string } | null>(null);

  /** Per-host `bridge.capabilities` result; a tier-1 bridge (or a failed probe) yields `fallbackCapabilities()`. */
  readonly capabilitiesSignal = signal<ReadonlyMap<string, BridgeCapabilities>>(new Map());

  /**
   * Per-status pane totals ignoring the filter bar's own status toggles but
   * honouring host exclusion and the URL scope. Feeds the filter-bar status
   * chips so a chip toggled off still reports how many panes WOULD sit in
   * that column if it were unhidden — the whole point of the counts is to
   * watch a status while its column is out of view.
   */
  readonly statusCountsSignal = computed<Record<AgentStatus, number>>(() => {
    const scope = this.scopeSignal();
    const excludedHosts = this.filtersSignal().excludedHosts;
    const counts: Record<AgentStatus, number> = {
      idle: 0,
      working: 0,
      blocked: 0,
      done: 0,
      unknown: 0,
    };
    for (const pane of this.panesSignal().values()) {
      if (excludedHosts.has(pane.host)) continue;
      if (scope) {
        if (pane.host !== scope.host || pane.workspace.id !== scope.workspaceId) continue;
        if (scope.tabId !== null && pane.tab.id !== scope.tabId) continue;
      }
      counts[pane.agent_status] += 1;
    }
    return counts;
  });

  /**
   * Every pane the URL scope allows through, before `filtersSignal` is
   * applied. One shared source for `columnsSignal` and `swimlanesSignal` so
   * the two can never disagree about what the board is looking at.
   */
  private readonly scopedPanesSignal = computed<readonly Pane[]>(() => {
    const scope = this.scopeSignal();
    const panes = [...this.panesSignal().values()];
    if (!scope) {
      return panes;
    }
    return panes.filter((p) => {
      if (p.host !== scope.host || p.workspace.id !== scope.workspaceId) {
        return false;
      }
      return scope.tabId === null || p.tab.id === scope.tabId;
    });
  });

  readonly columnsSignal = computed(() => groupByStatus(this.scopedPanesSignal(), this.filtersSignal()));

  /**
   * The board's bands under the persisted `swimlaneDimension`. With the
   * default `none` this is a single `"all"` band whose columns are exactly
   * `columnsSignal`'s.
   */
  readonly swimlanesSignal = computed<readonly Swimlane[]>(() =>
    groupIntoSwimlanes(
      this.scopedPanesSignal(),
      this.filtersSignal(),
      this.settings.settings().swimlaneDimension,
    ),
  );

  private readonly subscribedHosts = new Set<string>();

  constructor() {
    effect(() => {
      saveFilters(this.filtersSignal());
    });

    effect(() => {
      if (this.ws.connected()) {
        untracked(() => {
          this.subscribedHosts.clear();
          this.connectTick.update((n) => n + 1);
        });
      }
    });

    effect(() => {
      const hosts = this.hostsSignal();
      untracked(() => {
        for (const host of hosts) {
          void this.subscribeHost(host.name);
        }
      });
    });

    this.ws.events$.pipe(takeUntilDestroyed()).subscribe((evt) => {
      const current: LifecycleState = {
        panes: this.panesSignal(),
        workspaces: this.workspacesSignal(),
        tabs: this.tabsSignal(),
      };
      const next = applyLifecycleEvent(current, evt);
      if (next.panes !== current.panes) {
        this.panesSignal.set(next.panes);
      }
      if (next.workspaces !== current.workspaces) {
        this.workspacesSignal.set(next.workspaces);
      }
      if (next.tabs !== current.tabs) {
        this.tabsSignal.set(next.tabs);
      }
    });

    this.ws.connect();
  }

  toggleHost(host: string): void {
    this.filtersSignal.update((filters) => {
      const excludedHosts = new Set(filters.excludedHosts);
      if (excludedHosts.has(host)) {
        excludedHosts.delete(host);
      } else {
        excludedHosts.add(host);
      }
      return { ...filters, excludedHosts };
    });
  }

  toggleStatus(status: AgentStatus): void {
    this.filtersSignal.update((filters) => {
      const hiddenStatuses = new Set(filters.hiddenStatuses);
      if (hiddenStatuses.has(status)) {
        hiddenStatuses.delete(status);
      } else {
        hiddenStatuses.add(status);
      }
      return { ...filters, hiddenStatuses };
    });
  }

  private async subscribeHost(host: string): Promise<void> {
    if (this.subscribedHosts.has(host)) {
      return;
    }
    this.subscribedHosts.add(host);
    try {
      const list = await this.ws.request(host, "pane.list", {});
      if (list) {
        this.panesSignal.update((panes) => {
          let next: PaneMap = panes;
          for (const pane of list.panes) {
            next = applyPaneCreated(next, pane);
          }
          return next;
        });
        // Tier-3 has no `workspace.list`/`tab.list` browser-facing method
        // (CONTRACT-TIER3.md's method table) — the nav rail's initial
        // workspace/tab entries are derived from the `pane.list` we already
        // fetch, then kept warm by the lifecycle events subscribed below.
        this.workspacesSignal.update((workspaces) => {
          let next = workspaces;
          for (const pane of list.panes) {
            next = applyWorkspaceCreated(next, {
              id: pane.workspace.id,
              host: pane.host,
              name: pane.workspace.name,
            });
          }
          return next;
        });
        this.tabsSignal.update((tabs) => {
          let next = tabs;
          for (const pane of list.panes) {
            next = applyTabCreated(next, {
              id: pane.tab.id,
              host: pane.host,
              workspace: { id: pane.workspace.id },
              name: pane.tab.name,
            });
          }
          return next;
        });
      }
      await this.ws.request(host, "events.subscribe", { kinds: [...ALL_EVENT_KINDS] });
    } catch {
      // Connection dropped mid-subscribe; the next `connected` transition
      // clears `subscribedHosts` and retries every host from scratch.
      this.subscribedHosts.delete(host);
      return;
    }
    await this.probeCapabilities(host);
  }

  /**
   * Probes tier-2 support for one host. A tier-1 bridge (or any transport
   * error) responds with an error frame, which the contract says to treat
   * as "no tier-2 support" without disconnecting or touching the board —
   * so any failure here just records the fallback, never throws.
   */
  private async probeCapabilities(host: string): Promise<void> {
    let caps: BridgeCapabilities;
    try {
      caps = (await this.ws.request(host, "bridge.capabilities", {})) ?? fallbackCapabilities();
    } catch {
      caps = fallbackCapabilities();
    }
    this.capabilitiesSignal.update((map) => new Map(map).set(host, caps));
  }

  // --- tier-3 lifecycle actions ------------------------------------------
  // Thin `WsClient.request` wrappers, but every one of them applies its own
  // result to the local maps directly rather than waiting on the matching
  // `*.created`/`*.closed`/`*.renamed` broadcast event. The bridge/herdr is
  // SUPPOSED to broadcast that event back to every subscribed client
  // including the caller (CONTRACT-TIER3.md section 4), and
  // `applyLifecycleEvent` above still applies it the same way a remote
  // change would be applied — that path stays load-bearing for changes
  // originating from OTHER clients, and for cascade purges (section 5.6)
  // this class can't predict from a single id (e.g. closing a tab that was
  // its workspace's last one). But relying on it for the ACTING client's own
  // change turned out not just to be an unnecessary race, but to hit a real
  // gap verified live against a real bridge (round-4 diagnosis, this file's
  // git history): `tab.renamed` never broadcasts at all for a tab created
  // earlier in the same session, only for tabs that existed at
  // subscribe-time — silently leaving the rail's create-then-rename flow
  // permanently un-renamed client-side with no error. Every reducer these
  // call (`applyTabCreated`, `applyTabRenamed`, `removeByKey`, `purgeWhere`,
  // `updatePanes`, ...) is a plain idempotent map operation, so the event
  // landing afterwards (when it does arrive) and reapplying the same id is a
  // harmless no-op either way. Callers must
  // gate on `capabilitiesSignal` themselves before calling any of these.

  async splitPane(host: string, params: BridgeMethodParams["pane.split"]) {
    const result = await this.ws.request(host, "pane.split", params);
    if (result) {
      this.panesSignal.update((panes) => applyPaneCreated(panes, result.pane));
    }
    return result;
  }

  async closePane(host: string, paneId: string) {
    const result = await this.ws.request(host, "pane.close", { pane_id: paneId });
    this.panesSignal.update((panes) => applyPaneClosed(panes, { id: paneId, host }));
    return result;
  }

  /**
   * Sets herdr's user-authored pane label; `null` clears it. Applied
   * optimistically from the response for the same reason `renameTab` is (see
   * its note): the paired `pane.updated` broadcast can lag for a resource
   * this session owns, and every reducer here is an idempotent upsert, so
   * the event landing later re-applies the same value harmlessly.
   */
  async renamePane(host: string, paneId: string, label: string | null) {
    const result = await this.ws.request(host, "pane.rename", { pane_id: paneId, label });
    if (result) {
      this.panesSignal.update((panes) => applyPaneCreated(panes, result.pane));
    }
    return result;
  }

  async createTab(host: string, params: BridgeMethodParams["tab.create"] = {}) {
    const result = await this.ws.request(host, "tab.create", params);
    if (result) {
      this.tabsSignal.update((tabs) => applyTabCreated(tabs, result.tab));
      this.panesSignal.update((panes) => applyPaneCreated(panes, result.pane));
    }
    return result;
  }

  async renameTab(host: string, tabId: string, label: string) {
    const result = await this.ws.request(host, "tab.rename", { tab_id: tabId, label });
    // Optimistic, like every other tier-3 action above — verified live
    // against a real bridge (round-4 diagnosis) that the paired
    // `tab.renamed` broadcast event never arrives for a tab created earlier
    // in the SAME session (it fires fine for tabs that existed at
    // subscribe-time), so waiting on it left the rename permanently
    // unapplied client-side for the create-then-rename UX flow.
    if (result) {
      this.tabsSignal.update((tabs) => applyTabRenamed(tabs, { id: tabId, host, name: label }));
      this.panesSignal.update((panes) =>
        updatePanes(
          panes,
          (p) => p.host === host && p.tab.id === tabId,
          (p) => ({ ...p, tab: { ...p.tab, name: label } }),
        ),
      );
    }
    return result;
  }

  async closeTab(host: string, tabId: string) {
    const result = await this.ws.request(host, "tab.close", { tab_id: tabId });
    this.tabsSignal.update((tabs) => removeByKey(tabs, paneKey(host, tabId)));
    this.panesSignal.update((panes) =>
      purgeWhere(panes, (p) => p.host === host && p.tab.id === tabId),
    );
    return result;
  }

  async createWorkspace(host: string, params: BridgeMethodParams["workspace.create"] = {}) {
    const result = await this.ws.request(host, "workspace.create", params);
    if (result) {
      this.workspacesSignal.update((workspaces) => applyWorkspaceCreated(workspaces, result.workspace));
      this.tabsSignal.update((tabs) => applyTabCreated(tabs, result.tab));
      this.panesSignal.update((panes) => applyPaneCreated(panes, result.pane));
    }
    return result;
  }

  async renameWorkspace(host: string, workspaceId: string, label: string) {
    const result = await this.ws.request(host, "workspace.rename", { workspace_id: workspaceId, label });
    if (result) {
      this.workspacesSignal.update((workspaces) =>
        applyWorkspaceRenamed(workspaces, { id: workspaceId, host, name: label }),
      );
      this.panesSignal.update((panes) =>
        updatePanes(
          panes,
          (p) => p.host === host && p.workspace.id === workspaceId,
          (p) => ({ ...p, workspace: { ...p.workspace, name: label } }),
        ),
      );
    }
    return result;
  }

  async closeWorkspace(host: string, workspaceId: string, closeGroup = false) {
    const result = await this.ws.request(host, "workspace.close", {
      workspace_id: workspaceId,
      close_group: closeGroup,
    });
    // Only purges the target workspace's own resources. `close_group: true`
    // can close OTHER linked workspaces too (CONTRACT-TIER3.md section 5.4)
    // — those aren't predictable from this single id, so they still rely on
    // their own `workspace.closed` events landing via `applyLifecycleEvent`.
    this.workspacesSignal.update((workspaces) => removeByKey(workspaces, paneKey(host, workspaceId)));
    this.tabsSignal.update((tabs) =>
      purgeWhere(tabs, (t) => t.host === host && t.workspace.id === workspaceId),
    );
    this.panesSignal.update((panes) =>
      purgeWhere(panes, (p) => p.host === host && p.workspace.id === workspaceId),
    );
    return result;
  }

  /** How many open workspaces this host currently has — used to refuse closing the very last one client-side (CONTRACT-TIER3.md section 6). */
  workspaceCountForHost(host: string): number {
    let count = 0;
    for (const workspace of this.workspacesSignal().values()) {
      if (workspace.host === host) {
        count += 1;
      }
    }
    return count;
  }

  /** How many tabs `workspaceId` currently has — used to word the `tab.close` confirmation truthfully when it's the last one. */
  tabCountForWorkspace(host: string, workspaceId: string): number {
    let count = 0;
    for (const tab of this.tabsSignal().values()) {
      if (tab.host === host && tab.workspace.id === workspaceId) {
        count += 1;
      }
    }
    return count;
  }

  /** Sets the board's current scope. Written only by `Board`'s route-sync effect — see `scopeSignal`'s doc. */
  setScope(host: string, workspaceId: string, tabId: string | null): void {
    this.scopeSignal.set({ host, workspaceId, tabId });
  }

  clearScope(): void {
    this.scopeSignal.set(null);
  }

  requestPendingRename(kind: "workspace" | "tab", host: string, id: string): void {
    this.pendingRenameSignal.set({ kind, host, id });
  }

  consumePendingRename(): void {
    this.pendingRenameSignal.set(null);
  }

  requestCloseTabById(host: string, id: string): void {
    this.pendingCloseTabSignal.set({ host, id });
  }

  consumePendingCloseTab(): void {
    this.pendingCloseTabSignal.set(null);
  }

  /**
   * First host advertising any of the given capabilities, in `hostsSignal`
   * order. Mirrors `Board`'s local `primaryHost` computed (header `+`
   * menu), generalized to a single-capability lookup for
   * `KeyboardService`'s `prefix+c` (new pane needs `paneCreate`
   * specifically, not "any lifecycle capability").
   */
  findHostForCapability(...caps: (keyof BridgeCapabilities)[]): string | null {
    const capabilities = this.capabilitiesSignal();
    for (const host of this.hostsSignal()) {
      const hostCaps = capabilities.get(host.name);
      if (hostCaps && caps.some((cap) => hostCaps[cap])) {
        return host.name;
      }
    }
    return null;
  }

  /**
   * First host in `hostsSignal` order whose `bridge.capabilities` reports
   * `hostKeybinds` — same "first host in config order" idea as
   * `findHostForCapability`, generalized to an object-valued capability
   * instead of a boolean. Used by `KeyboardService` to mirror herdr's
   * configured prefix as kanhrd's default (see the
   * `add-host-keybinds-passthrough` openspec change).
   */
  primaryHostKeybinds(): BridgeCapabilities["hostKeybinds"] | null {
    const capabilities = this.capabilitiesSignal();
    for (const host of this.hostsSignal()) {
      const hostKeybinds = capabilities.get(host.name)?.hostKeybinds;
      if (hostKeybinds) {
        return hostKeybinds;
      }
    }
    return null;
  }
}

/** True when `err` is the wire error `workspace.close` returns for CONTRACT-TIER3.md section 5.4's linked-worktree-group gate. */
export function isWorkspaceGroupCloseRequiredError(err: unknown): boolean {
  return err instanceof Error && err.message.startsWith("workspace_group_close_required");
}

function describeError(err: unknown): string {
  return err instanceof Error ? err.message : "failed to load hosts";
}
