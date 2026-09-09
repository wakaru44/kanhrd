import { computed, effect, inject, Injectable, signal, untracked } from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { httpResource } from "@angular/common/http";
import type {
  AgentStatus,
  BridgeCapabilities,
  BridgeEventPayload,
  GetHostsResponse,
  HostSummary,
  Pane,
  WsEvent,
} from "@kanhrd/schema";
import { WsClient } from "./ws-client";

/** What a bridge that never answers (or errors on) `bridge.capabilities` gets treated as: tier-1, no terminal. */
export function fallbackCapabilities(): BridgeCapabilities {
  return { tier: 1, terminal: false, paneResize: false, paneGraphics: false, outputPollIntervalMs: 0 };
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
  evt: { id: string; host: string; agent_status: AgentStatus },
): PaneMap {
  const key = paneKey(evt.host, evt.id);
  const existing = panes.get(key);
  if (!existing) {
    return panes;
  }
  const next = new Map(panes);
  next.set(key, { ...existing, agent_status: evt.agent_status });
  return next;
}

/**
 * Apply one bridge event frame to a pane map. Used by both the store and
 * tests.
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
    default:
      return panes;
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

const TIER1_EVENT_KINDS = ["pane.created", "pane.closed", "pane.agent_status_changed"] as const;

/**
 * Signals-based store for the kanban board: hosts, panes (keyed
 * `${host}:${id}`), derived per-status columns, and persisted filters.
 * Owns the WsClient lifecycle: refetches hosts and re-subscribes every host
 * whenever the socket (re)connects.
 */
@Injectable({ providedIn: "root" })
export class PanesStore {
  private readonly ws = inject(WsClient);

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
  readonly filtersSignal = signal<Filters>(loadFilters());

  /** Per-host `bridge.capabilities` result; a tier-1 bridge (or a failed probe) yields `fallbackCapabilities()`. */
  readonly capabilitiesSignal = signal<ReadonlyMap<string, BridgeCapabilities>>(new Map());

  readonly columnsSignal = computed(() =>
    groupByStatus(this.panesSignal().values(), this.filtersSignal()),
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
      this.panesSignal.update((panes) => applyEvent(panes, evt));
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
      }
      await this.ws.request(host, "events.subscribe", { kinds: [...TIER1_EVENT_KINDS] });
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
}

function describeError(err: unknown): string {
  return err instanceof Error ? err.message : "failed to load hosts";
}
