import {
  Component,
  ElementRef,
  Injector,
  OnDestroy,
  afterNextRender,
  computed,
  effect,
  inject,
  signal,
  viewChild,
  viewChildren,
} from "@angular/core";
import { takeUntilDestroyed, toSignal } from "@angular/core/rxjs-interop";
import { ActivatedRoute, Router } from "@angular/router";
import { map } from "rxjs";
import type { AgentStatus } from "@kanhrd/schema";
import { LucidePlus, LucideRefreshCw, LucideTriangleAlert, LucideUnplug, LucideX } from "../shared/icons";
import { COPY } from "../shared/copy";
import { PanesStore, STATUS_COLUMN_ORDER, defaultFilters } from "../state/panes.store";
import { SettingsService } from "../state/settings.service";
import { Column, mobileViewportSignal } from "./column";
import { Swimlane, bandLabels, pageIndex } from "./swimlane";
import { FilterBar } from "./filter-bar";
import { StatusSwitcher } from "./status-switcher";
import { Rail } from "../rail/rail";
import { LayoutService } from "../state/layout.service";
import { ToastService } from "../state/toast.service";
import {
  BoardReturnService,
  returnFocusTarget,
  type BoardReturn,
} from "../state/board-return.service";
import { ClockTick } from "../util/clock";
import { EmptyState } from "./empty-state";

/**
 * How long a `/workspace/:id` in the URL may stay unresolved before the
 * board says so. Long enough for `pane.list` to come back on a cold load at
 * a deep link, short enough that a stale or bogus id is reported rather than
 * silently swallowed (docs/UX-GUIDELINES.md, "Reliability states tell the
 * truth": never silently falling back to a previous scope).
 */
export const SCOPE_RESOLVE_GRACE_MS = 4000;

/**
 * The resting page index of a strip. Defined in `swimlane.ts` — every band
 * pages by the same rule as the board's own single strip, and a band may not
 * import the board that renders it. Re-exported here because it was the
 * board's before swimlanes existed.
 */
export { pageIndex };

/** Three placeholder rows per skeleton column — a static skeleton, never a spinner. */
export const SKELETON_ROWS = [0, 1, 2] as const;

/**
 * How long the board keeps trying to put the user back where they were
 * before giving up and leaving them at the top. Cards arrive with
 * `pane.list`, so the target may not exist for a beat after mount; past
 * this, the data is late enough that a jump would be more surprising than
 * the reset.
 */
export const RESTORE_GRACE_MS = 2000;

/** How often the restore pump re-checks for a target that has not rendered yet. */
const RESTORE_RETRY_MS = 50;

/**
 * Where the pager should rest when `previous` may no longer be visible: the
 * status itself if it survived, otherwise the nearest visible column to its
 * left in `STATUS_COLUMN_ORDER`, otherwise the first visible one. `null`
 * only when nothing is visible at all — which is the no-matches empty state,
 * not a blank page.
 */
export function nearestVisibleStatus(
  previous: AgentStatus,
  visible: readonly AgentStatus[],
): AgentStatus | null {
  if (visible.includes(previous)) {
    return previous;
  }
  const previousPosition = STATUS_COLUMN_ORDER.indexOf(previous);
  for (let i = previousPosition - 1; i >= 0; i--) {
    const candidate = STATUS_COLUMN_ORDER[i];
    if (visible.includes(candidate)) {
      return candidate;
    }
  }
  return visible[0] ?? null;
}

@Component({
  selector: "app-board",
  imports: [
    Column,
    Swimlane,
    FilterBar,
    Rail,
    EmptyState,
    StatusSwitcher,
    LucideX,
    LucidePlus,
    LucideRefreshCw,
    LucideTriangleAlert,
    LucideUnplug,
  ],
  templateUrl: "./board.html",
  styleUrl: "./board.scss",
})
export class Board implements OnDestroy {
  protected readonly store = inject(PanesStore);
  protected readonly layout = inject(LayoutService);
  private readonly toast = inject(ToastService);
  private readonly boardReturn = inject(BoardReturnService);
  private readonly injector = inject(Injector);
  private readonly clock = inject(ClockTick);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  protected readonly copy = COPY;
  protected readonly skeletonRows = SKELETON_ROWS;
  protected readonly statusOrder = STATUS_COLUMN_ORDER;
  protected readonly columns = this.store.columnsSignal;
  /**
   * The bands. Under dimension `none` this is a single `"all"` band the
   * board deliberately does NOT render through `app-swimlane`: grouping off
   * means no band chrome at all, and the single-strip path below stays the
   * one the board has always used.
   */
  protected readonly swimlanes = this.store.swimlanesSignal;
  protected readonly loading = this.store.hostsLoading;
  protected readonly error = this.store.hostsError;
  protected readonly capabilities = this.store.capabilitiesSignal;
  protected readonly mobile = mobileViewportSignal();
  private readonly settings = inject(SettingsService);

  /** Whether any band chrome is rendered at all. `none` is today's board, untouched. */
  protected readonly grouped = computed(
    () => this.settings.settings().swimlaneDimension !== "none",
  );

  /**
   * Grouping on, but every band empty. Bands with no cards are not rendered
   * (proposal Q2), so without this the board region would simply go blank.
   * The filters are the usual reason, and `noMatches` offers the way out.
   */
  protected readonly noBands = computed(() => this.grouped() && this.swimlanes().length === 0);

  /** The bands with their headings resolved — copy, host qualification and path elision. */
  protected readonly bands = computed(() =>
    bandLabels(this.swimlanes(), this.settings.settings().swimlaneDimension),
  );

  // --- the pager: one state, two views ----------------------------------
  //
  // Below `--breakpoint-mobile` the board is a one-column-per-screen pager
  // (docs/UX-GUIDELINES.md, "Board paging model"). The strip's scroll
  // position and the switcher's selection are the same state: a swipe writes
  // `currentStatus` from `Math.round(scrollLeft / clientWidth)`, a tap writes
  // it directly and scrolls the strip to match.

  private readonly strip = viewChild<ElementRef<HTMLElement>>("strip");
  private readonly columnEls = viewChildren("columnEl", { read: ElementRef });

  /** Visible status columns, always in `STATUS_COLUMN_ORDER`. Paging never reorders. */
  protected readonly visibleStatuses = computed<readonly AgentStatus[]>(() => {
    const hidden = this.store.filtersSignal().hiddenStatuses;
    return STATUS_COLUMN_ORDER.filter((status) => !hidden.has(status));
  });

  /** Card count per visible status, index-aligned with `visibleStatuses`. */
  protected readonly visibleCounts = computed(() =>
    this.visibleStatuses().map((status) => this.columns()[status].length),
  );

  private readonly currentStatus = signal<AgentStatus>(STATUS_COLUMN_ORDER[0]);

  protected readonly currentIndex = computed(() => {
    const index = this.visibleStatuses().indexOf(this.currentStatus());
    return index < 0 ? 0 : index;
  });

  /** Every status hidden: the pager is replaced by the no-matches empty state, not left blank. */
  protected readonly noMatches = computed(() => this.visibleStatuses().length === 0);

  /** Hosts that are configured but currently unreachable — content stays, marked stale. */
  protected readonly staleHosts = computed(() =>
    this.store.hostsSignal().filter((host) => !host.connected),
  );

  protected isStatusHidden(status: AgentStatus): boolean {
    return this.store.filtersSignal().hiddenStatuses.has(status);
  }

  /** Tapping a segment pages the strip; `scroll-snap` does the settling. */
  protected selectStatus(index: number): void {
    const status = this.visibleStatuses()[index];
    if (!status) {
      return;
    }
    this.currentStatus.set(status);
    this.scrollToIndex(index);
  }

  private scrollToIndex(index: number): void {
    const element = this.columnEls()[index]?.nativeElement as HTMLElement | undefined;
    if (!element) {
      return;
    }
    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
    element.scrollIntoView({
      inline: "start",
      block: "nearest",
      behavior: reduced ? "auto" : "smooth",
    });
  }

  /** A swipe moves the selection: the index is `Math.round(scrollLeft / clientWidth)`, deterministic by construction. */
  protected onStripScroll(): void {
    if (!this.mobile()) {
      return;
    }
    const element = this.strip()?.nativeElement;
    if (!element || element.clientWidth === 0) {
      return;
    }
    const index = pageIndex(element.scrollLeft, element.clientWidth);
    const status = this.visibleStatuses()[index];
    if (status && status !== this.currentStatus()) {
      this.currentStatus.set(status);
    }
  }

  protected clearFilters(): void {
    this.store.filtersSignal.set(defaultFilters());
  }

  // --- URL scope: rail = navigator (decision locked) ---------------------
  //
  // `/workspace/:workspaceId` and `/workspace/:workspaceId/tab/:tabId` scope
  // the board to one workspace's (or one tab's) panes. `PanesStore.scopeSignal`
  // is derived from these route params below (the store itself never writes
  // it from a click handler anymore — `Rail` navigates instead). Workspace
  // ids are looked up across every host's `workspacesSignal` entries since
  // the URL shape (per the brief) doesn't carry a host segment; the first
  // match wins, which holds as long as workspace ids don't collide across
  // hosts in practice.

  protected readonly routeWorkspaceId = toSignal(
    this.route.paramMap.pipe(map((params) => params.get("workspaceId"))),
    { initialValue: null },
  );
  protected readonly routeTabId = toSignal(
    this.route.paramMap.pipe(map((params) => params.get("tabId"))),
    { initialValue: null },
  );

  private readonly resolvedWorkspace = computed(() => {
    const workspaceId = this.routeWorkspaceId();
    if (!workspaceId) {
      return null;
    }
    for (const workspace of this.store.workspacesSignal().values()) {
      if (workspace.id === workspaceId) {
        return workspace;
      }
    }
    return null;
  });

  private readonly resolvedTab = computed(() => {
    const tabId = this.routeTabId();
    const workspace = this.resolvedWorkspace();
    if (!tabId || !workspace) {
      return null;
    }
    for (const tab of this.store.tabsSignal().values()) {
      if (tab.id === tabId && tab.host === workspace.host && tab.workspace.id === workspace.id) {
        return tab;
      }
    }
    return null;
  });

  /** When the current unresolved workspace id was first seen — the honesty clock. */
  private readonly unresolvedSince = signal<number | null>(null);

  /** A scoped URL whose workspace hasn't resolved yet: still loading, not yet a verdict. */
  protected readonly scopePending = computed(
    () => !!this.routeWorkspaceId() && !this.resolvedWorkspace(),
  );

  /** A scoped URL whose workspace never resolved: say so, don't fall back to the previous scope. */
  protected readonly scopeUnavailable = computed(() => {
    if (!this.scopePending()) {
      return false;
    }
    const since = this.unresolvedSince();
    return since !== null && this.clock.now() - since > SCOPE_RESOLVE_GRACE_MS;
  });

  /** Static skeleton columns, never a spinner over the wordmark. */
  protected readonly showSkeleton = computed(
    () => this.loading() || (this.scopePending() && !this.scopeUnavailable()),
  );

  constructor() {
    // Every emission here happens while this route is the active one, so
    // `Router.url` is still the board's own URL. `paramMap` emits on
    // subscribe and again on each in-place scope change (`/` →
    // `/workspace/:id` reuses this component), which is exactly the set of
    // moments the remembered URL can change.
    this.route.paramMap.pipe(takeUntilDestroyed()).subscribe(() => {
      this.activeUrl = this.currentUrl();
    });

    // The route is the single source of truth for `scopeSignal` — see the
    // signal's own doc in panes.store.ts. Re-resolves whenever the route
    // params change OR the workspace/tab data needed to resolve them
    // finishes loading (e.g. a page load straight at `/workspace/:id`
    // before `pane.list` has come back yet).
    effect(() => {
      const workspaceId = this.routeWorkspaceId();
      const tabId = this.routeTabId();
      const workspace = this.resolvedWorkspace();
      const tab = this.resolvedTab();
      if (!workspaceId) {
        this.unresolvedSince.set(null);
        this.store.clearScope();
        return;
      }
      if (!workspace) {
        // Unresolvable *so far*. The board must never keep showing the
        // previous scope's cards under a URL that no longer names them, so
        // the scope is dropped now and the view shows the skeleton until
        // either the workspace resolves or `SCOPE_RESOLVE_GRACE_MS` elapses and
        // the unavailable state takes over.
        if (this.unresolvedSince() === null) {
          this.unresolvedSince.set(Date.now());
        }
        this.store.clearScope();
        return;
      }
      this.unresolvedSince.set(null);
      this.store.setScope(workspace.host, workspace.id, tabId ? (tab?.id ?? null) : null);
    });

    // Keep the pager on a column that exists: hiding the shown status pages
    // to the nearest visible column to its left, never to a hidden or blank
    // page. Un-hiding re-inserts a column without moving the current page,
    // because `currentStatus` is untouched when it is still visible.
    effect(() => {
      const visible = this.visibleStatuses();
      const next = nearestVisibleStatus(this.currentStatus(), visible);
      if (next && next !== this.currentStatus()) {
        this.currentStatus.set(next);
      }
    });

    // Settle the strip on whichever column the state says is current, after
    // the visible set changes underneath it.
    effect(() => {
      const index = this.currentIndex();
      const element = this.strip()?.nativeElement;
      if (!this.mobile() || !element || element.clientWidth === 0) {
        return;
      }
      if (pageIndex(element.scrollLeft, element.clientWidth) !== index) {
        this.scrollToIndex(index);
      }
    });

    // Cards land with `pane.list`, well after mount, so a restore attempt is
    // worth making again every time the columns change — not only on the
    // pump's own timer.
    effect(() => {
      this.columns();
      this.tryRestore();
    });

    this.startRestore();
  }

  // --- coming back from a pane ------------------------------------------
  //
  // Opening a card is a round trip (docs/UX-GUIDELINES.md, "Focus and
  // terminal input survive navigation"): the scope is carried by the URL the
  // pane's back control points at, and the rest — which page the strip
  // rested on, how far each column was scrolled, which card had focus — is
  // handed back by `BoardReturnService`.
  //
  // The record is consumed on mount but applied later: cards arrive with
  // `pane.list`, so the target usually is not in the DOM yet. The pump
  // retries until it lands or `RESTORE_GRACE_MS` runs out.

  /** The position to restore, until it has been applied or has expired. */
  private pendingReturn: BoardReturn | null = null;
  private restoreDeadline = 0;
  private restoreTimer: ReturnType<typeof setTimeout> | undefined;

  /**
   * The board URL as of the last moment this route was actually active.
   *
   * `Router.url` must NOT be read in `ngOnDestroy`: by then the router has
   * already committed the navigation, so it names the route being navigated
   * TO. Reading it there made every departure remember the pane's own URL,
   * which is what the pane's "back to the board" control links to — the
   * link pointed at the page the user was already on, so the first click
   * did nothing (a reload cleared the record and the link fell back to
   * `/`, which is why refreshing "fixed" it).
   */
  private activeUrl = this.currentUrl();

  /** `Router.url`, defensively: a test double (or a router mid-teardown) may not have one. */
  private currentUrl(): string {
    return this.router.url || "/";
  }

  private startRestore(): void {
    const record = this.boardReturn.take();
    if (!record) {
      return;
    }
    this.pendingReturn = record;
    this.restoreDeadline = Date.now() + RESTORE_GRACE_MS;
    afterNextRender(() => this.pumpRestore(), { injector: this.injector });
  }

  private pumpRestore(): void {
    if (!this.pendingReturn) {
      return;
    }
    this.tryRestore();
    if (this.pendingReturn) {
      this.restoreTimer = setTimeout(() => this.pumpRestore(), RESTORE_RETRY_MS);
    }
  }

  private tryRestore(): void {
    const record = this.pendingReturn;
    if (!record) {
      return;
    }
    // A board that came up somewhere else has no use for someone else's
    // position, and a record that has waited too long is stale.
    if (record.url !== this.currentUrl() || Date.now() > this.restoreDeadline) {
      this.finishRestore();
      return;
    }
    const strip = this.strip()?.nativeElement;
    if (!strip) {
      return; // still on the skeleton
    }

    this.restoreScroll(record, strip);

    const status = record.status;
    if (!status) {
      this.finishRestore(); // left the board without opening a card: scroll was the whole job
      return;
    }
    const keys = (this.columns()[status] ?? []).map((pane) => `${pane.host}:${pane.id}`);
    const target = returnFocusTarget(record.paneKey, record.index, keys);
    if (!target) {
      this.finishRestore();
      return;
    }
    const card = strip.querySelector(`app-card[data-pane="${CSS.escape(target)}"]`);
    const focusable = card?.querySelector<HTMLElement>("a[href], button");
    if (!focusable) {
      return; // not rendered yet — the pump will look again
    }
    // Never take focus the user has already placed somewhere themselves.
    if (document.activeElement === null || document.activeElement === document.body) {
      // `preventScroll` so restoring focus cannot undo the scroll just restored.
      focusable.focus({ preventScroll: true });
    }
    this.finishRestore();
  }

  private restoreScroll(record: BoardReturn, strip: HTMLElement): void {
    if (strip.scrollLeft !== record.scrollLeft && strip.clientWidth > 0) {
      strip.scrollLeft = record.scrollLeft;
      const status = this.visibleStatuses()[pageIndex(record.scrollLeft, strip.clientWidth)];
      if (status) {
        this.currentStatus.set(status);
      }
    }
    for (const [status, top] of Object.entries(record.scrollTops)) {
      const scroller = this.columnScroller(status as AgentStatus);
      if (scroller && top !== undefined) {
        scroller.scrollTop = top;
      }
    }
  }

  private finishRestore(): void {
    this.pendingReturn = null;
    clearTimeout(this.restoreTimer);
    this.restoreTimer = undefined;
  }

  /** The element that actually scrolls a column: the CDK viewport when virtualized, the body otherwise. */
  private columnScroller(status: AgentStatus): HTMLElement | null {
    for (const ref of this.columnEls()) {
      const element = ref.nativeElement as HTMLElement;
      if (element.querySelector(`.column[data-status="${status}"]`)) {
        return (
          element.querySelector<HTMLElement>("cdk-virtual-scroll-viewport") ??
          element.querySelector<HTMLElement>(".column-body")
        );
      }
    }
    return null;
  }

  /** Hand the next mount everything it needs to put the user back here. */
  ngOnDestroy(): void {
    clearTimeout(this.restoreTimer);
    const strip = this.strip()?.nativeElement;
    const scrollTops: Partial<Record<AgentStatus, number>> = {};
    for (const status of this.visibleStatuses()) {
      const scroller = this.columnScroller(status);
      if (scroller && scroller.scrollTop > 0) {
        scrollTops[status] = scroller.scrollTop;
      }
    }
    this.boardReturn.rememberBoard({
      url: this.activeUrl,
      scrollLeft: strip?.scrollLeft ?? 0,
      scrollTops,
    });
  }

  protected readonly scopePillLabel = computed(() => {
    const workspace = this.resolvedWorkspace();
    if (!workspace) {
      return null;
    }
    const tab = this.resolvedTab();
    return tab ? `${workspace.name} / ${tab.name}` : workspace.name;
  });

  protected clearScope(): void {
    void this.router.navigate(["/"]);
  }

  /**
   * `PanesStore` fetches `/api/hosts` through an `httpResource` it does not
   * expose a reload handle for, so the honest retry for a failed discovery
   * is a reload of the app itself. Cheaper than widening the store's API for
   * one button; swap it for `hostsResource.reload()` if that ever lands.
   */
  protected retry(): void {
    window.location.reload();
  }

  // --- header "+" menu: new pane / new tab / new workspace -------------
  //
  // Tier-3 lifecycle create actions need a host to act on; the brief scopes
  // this to lifecycle CRUD, not a full multi-host picker UI, so this picks
  // the first host that advertises any tier-3 create capability and acts on
  // it. Fine for the common single-host case; a per-host submenu is a
  // natural follow-up once multi-host lifecycle create comes up in
  // practice.

  private readonly primaryHost = computed<string | null>(() => {
    const capabilities = this.capabilities();
    for (const host of this.store.hostsSignal()) {
      const caps = capabilities.get(host.name);
      if (caps?.paneCreate || caps?.tabCrud || caps?.workspaceCrud) {
        return host.name;
      }
    }
    return null;
  });

  protected readonly newPaneAvailable = computed(
    () => !!this.primaryHost() && this.capabilities().get(this.primaryHost()!)?.paneCreate === true,
  );
  protected readonly newTabAvailable = computed(
    () => !!this.primaryHost() && this.capabilities().get(this.primaryHost()!)?.tabCrud === true,
  );
  protected readonly newWorkspaceAvailable = computed(
    () => !!this.primaryHost() && this.capabilities().get(this.primaryHost()!)?.workspaceCrud === true,
  );
  protected readonly plusMenuAvailable = computed(
    () => this.newPaneAvailable() || this.newTabAvailable() || this.newWorkspaceAvailable(),
  );

  protected readonly plusMenuOpen = this.layout.plusMenuOpen;

  protected togglePlusMenu(): void {
    this.layout.togglePlusMenu();
  }

  protected async newPane(): Promise<void> {
    this.layout.closePlusMenu();
    const host = this.primaryHost();
    if (!host) {
      return;
    }
    try {
      await this.store.splitPane(host, { direction: "right" });
    } catch (err) {
      this.toast.push({ level: "error", message: `Could not create a new pane: ${describeError(err)}` });
    }
  }

  protected async newTab(): Promise<void> {
    this.layout.closePlusMenu();
    const host = this.primaryHost();
    if (!host) {
      return;
    }
    try {
      const result = await this.store.createTab(host, {});
      if (result) {
        this.store.requestPendingRename("tab", host, result.tab.id);
      }
    } catch (err) {
      this.toast.push({ level: "error", message: `Could not create a new tab: ${describeError(err)}` });
    }
  }

  protected async newWorkspace(): Promise<void> {
    this.layout.closePlusMenu();
    const host = this.primaryHost();
    if (!host) {
      return;
    }
    try {
      const result = await this.store.createWorkspace(host, {});
      if (result) {
        this.store.requestPendingRename("workspace", host, result.workspace.id);
      }
    } catch (err) {
      this.toast.push({ level: "error", message: `Could not create a new workspace: ${describeError(err)}` });
    }
  }
}

function describeError(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
