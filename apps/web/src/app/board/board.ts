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
} from '@angular/core';
import { CdkDrag, CdkDropList, CdkDropListGroup, type CdkDragDrop } from '@angular/cdk/drag-drop';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { map } from 'rxjs';
import type { AgentStatus, BridgeCapabilities, BridgeMethodParams, Pane } from '@kanhrd/schema';
import {
  LucidePlus,
  LucideRefreshCw,
  LucideTriangleAlert,
  LucideUnplug,
  LucideX,
} from '../shared/icons';
import { COPY, fill } from '../shared/copy';
import { handleMenuKeydown, menuItems } from '../shared/menu-keys';
import { PanesStore, STATUS_COLUMN_ORDER, defaultFilters } from '../state/panes.store';
import { SettingsService } from '../state/settings.service';
import {
  Column,
  boardColumnRefs,
  canReorderColumns,
  columnReorderDelta,
  firstParkedIndex,
  focusCard,
  mobileViewportSignal,
  type BoardColumnRef,
} from './column';
import { ParkedStore } from '../state/parked.store';
import { Swimlane, bandLabels, pageIndex } from './swimlane';
import { FilterBar } from './filter-bar';
import { StatusSwitcher } from './status-switcher';
import { Rail } from '../rail/rail';
import { LayoutService } from '../state/layout.service';
import { ToastService } from '../state/toast.service';
import { BoardReturnService, type BoardRestorePort } from '../state/board-return.service';
import { ClockTick } from '../util/clock';
import { EmptyState } from './empty-state';
import {
  DestinationPicker,
  destinationsFor,
  type Destination,
  type DestinationCapability,
  type DestinationLevel,
} from '../shared/destination-picker';

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
 * Where the pager should rest when `previous` may no longer be visible: the
 * status itself if it survived, otherwise the nearest visible column to its
 * left in `STATUS_COLUMN_ORDER`, otherwise the first visible one. `null`
 * only when nothing is visible at all — which is the no-matches empty state,
 * not a blank page.
 */
export function nearestVisibleStatus(
  previous: AgentStatus,
  visible: readonly AgentStatus[]
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
  selector: 'app-board',
  imports: [
    Column,
    CdkDrag,
    CdkDropList,
    CdkDropListGroup,
    Swimlane,
    FilterBar,
    Rail,
    EmptyState,
    StatusSwitcher,
    DestinationPicker,
    LucideX,
    LucidePlus,
    LucideRefreshCw,
    LucideTriangleAlert,
    LucideUnplug,
  ],
  templateUrl: './board.html',
  styleUrl: './board.scss',
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
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  protected readonly copy = COPY;
  protected readonly skeletonRows = SKELETON_ROWS;
  protected readonly statusOrder = STATUS_COLUMN_ORDER;
  protected readonly columns = this.store.columnsSignal;
  private readonly parked = inject(ParkedStore);
  /** The operator's columns, left to right. Rendered after `unknown`, never before it. */
  protected readonly parkedColumns = this.parked.columns;
  protected readonly parkedPanes = this.store.parkedPanesSignal;
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
    () => this.settings.settings().swimlaneDimension !== 'none'
  );

  /**
   * Grouping on, but every band empty. Bands with no cards are not rendered
   * (proposal Q2), so without this the board region would simply go blank.
   * The filters are the usual reason, and `noMatches` offers the way out.
   */
  protected readonly noBands = computed(() => this.grouped() && this.swimlanes().length === 0);

  /** The bands with their headings resolved — copy, host qualification and path elision. */
  protected readonly bands = computed(() =>
    bandLabels(this.swimlanes(), this.settings.settings().swimlaneDimension)
  );

  // --- the pager: one state, two views ----------------------------------
  //
  // Below `--breakpoint-mobile` the board is a one-column-per-screen pager
  // (docs/UX-GUIDELINES.md, "Board paging model"). The strip's scroll
  // position and the switcher's selection are the same state: a swipe writes
  // `currentKey` from `Math.round(scrollLeft / clientWidth)`, a tap writes
  // it directly and scrolls the strip to match.

  private readonly strip = viewChild<ElementRef<HTMLElement>>('strip');
  private readonly columnEls = viewChildren('columnEl', { read: ElementRef });

  /**
   * Every column the board draws, in order: the status columns in
   * `STATUS_COLUMN_ORDER` first, then the operator's parked columns, minus
   * whatever the filter bar has hidden. One list for the desktop grid, the
   * mobile pager and the switcher, so a parked column is a page like any
   * other — and one place that knows about hiding, keyed by
   * `BoardColumnRef.key` so both kinds of column hide the same way.
   */
  protected readonly visibleColumns = computed<readonly BoardColumnRef[]>(() => {
    const hidden = this.store.filtersSignal().hiddenColumns;
    return boardColumnRefs(STATUS_COLUMN_ORDER, this.parkedColumns()).filter(
      (column) => !hidden.has(column.key)
    );
  });

  // --- column reorder ----------------------------------------------------
  //
  // The strip is a horizontal drop list whose items are the columns and whose
  // handle is a parked column's header. The list is mounted on the region
  // rather than on the strip, because the strip's `cdkDropListGroup` is what
  // connects the per-column CARD lists (see board.html). The two lists are
  // never connected to each other, so neither drag can end in the other's
  // list.

  protected readonly reorderEnabled = computed(() =>
    canReorderColumns(this.parkedColumns().length, this.mobile())
  );

  /**
   * A status column is never a reorder target: nothing may come to rest left
   * of the first parked column, so the status run keeps `STATUS_COLUMN_ORDER`
   * whatever is dragged over it.
   */
  protected readonly columnSortPredicate = (index: number): boolean =>
    index >= firstParkedIndex(this.visibleColumns());

  protected onColumnDropped(event: CdkDragDrop<unknown>): void {
    const move = columnReorderDelta(
      this.visibleColumns(),
      this.parkedColumns().map((column) => column.id),
      event.previousIndex,
      event.currentIndex
    );
    if (move) {
      this.parked.moveColumn(move.id, move.delta);
    }
  }

  /**
   * The status half of `visibleColumns`, in `STATUS_COLUMN_ORDER`. Derived
   * from the one visible-column list rather than filtered a second time, so
   * the pager's nearest-column fallback and the scroll-top snapshot can
   * never disagree with what is drawn.
   */
  protected readonly visibleStatuses = computed<readonly AgentStatus[]>(() =>
    this.visibleColumns()
      .map((column) => column.status)
      .filter((status): status is AgentStatus => status !== null)
  );

  /** Card count per visible column, index-aligned with `visibleColumns`. */
  protected readonly visibleCounts = computed(() =>
    this.visibleColumns().map((column) => this.panesFor(column).length)
  );

  protected panesFor(column: BoardColumnRef): Pane[] {
    return column.parked
      ? (this.parkedPanes().get(column.parked.id) ?? [])
      : (this.columns()[column.status!] ?? []);
  }

  /** The column the pager rests on, by `BoardColumnRef.key`. */
  private readonly currentKey = signal<string>(STATUS_COLUMN_ORDER[0]);

  protected readonly currentIndex = computed(() => {
    const index = this.visibleColumns().findIndex((column) => column.key === this.currentKey());
    return index < 0 ? 0 : index;
  });

  /** Nothing to page through at all: the no-matches empty state, not a blank page. */
  protected readonly noMatches = computed(() => this.visibleColumns().length === 0);

  /** Hosts that are configured but currently unreachable — content stays, marked stale. */
  protected readonly staleHosts = computed(() =>
    this.store.hostsSignal().filter((host) => !host.connected)
  );

  /** Tapping a segment pages the strip; `scroll-snap` does the settling. */
  protected selectStatus(index: number): void {
    const column = this.visibleColumns()[index];
    if (!column) {
      return;
    }
    this.currentKey.set(column.key);
    this.scrollToIndex(index);
  }

  private scrollToIndex(index: number): void {
    const element = this.columnEls()[index]?.nativeElement as HTMLElement | undefined;
    if (!element) {
      return;
    }
    const reduced =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
    element.scrollIntoView({
      inline: 'start',
      block: 'nearest',
      behavior: reduced ? 'auto' : 'smooth',
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
    const column = this.visibleColumns()[index];
    if (column && column.key !== this.currentKey()) {
      this.currentKey.set(column.key);
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
    this.route.paramMap.pipe(map((params) => params.get('workspaceId'))),
    { initialValue: null }
  );
  protected readonly routeTabId = toSignal(
    this.route.paramMap.pipe(map((params) => params.get('tabId'))),
    { initialValue: null }
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
    () => !!this.routeWorkspaceId() && !this.resolvedWorkspace()
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
    () => this.loading() || (this.scopePending() && !this.scopeUnavailable())
  );

  constructor() {
    // Opening the create menu — or stepping into its destination list —
    // moves focus onto the first thing there, so the menu is operable from
    // the keyboard the moment it appears. `preventScroll`: the menu sits
    // over the board, and focusing it must not scroll what is under it.
    effect(() => {
      const menu = this.plusMenuEl()?.nativeElement;
      this.pendingCreate();
      if (this.plusMenuOpen() && menu) {
        menuItems(menu)[0]?.focus({ preventScroll: true });
      }
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
    // because `currentKey` is untouched when its column is still visible.
    effect(() => {
      const columns = this.visibleColumns();
      const current = this.currentKey();
      if (columns.some((column) => column.key === current)) {
        return;
      }
      // A status column that was hidden pages to the nearest visible status
      // to its left, as it always has. A parked column that was removed has
      // no such gradient to walk, so the pager falls back to the first
      // column on the board.
      const status = STATUS_COLUMN_ORDER.includes(current as AgentStatus)
        ? nearestVisibleStatus(current as AgentStatus, this.visibleStatuses())
        : null;
      const next = status ?? columns[0]?.key ?? null;
      if (next) {
        this.currentKey.set(next);
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
      this.boardReturn.retryRestore();
    });

    this.boardReturn.restore(this.restorePort);
    afterNextRender(() => this.boardReturn.retryRestore(), { injector: this.injector });
  }

  // --- coming back from a pane ------------------------------------------
  //
  // Opening a card is a round trip (docs/UX-GUIDELINES.md, "Focus and
  // terminal input survive navigation"). `BoardReturnService` owns that
  // trip end to end — the record, the URL it belongs to, the retry pump and
  // the grace deadline. What is left here is what only a template knows:
  // which element scrolls what, and how a card is found in the DOM.
  //
  // The board deliberately holds no URL of its own. It cannot: the only
  // moment it could hand one over is `ngOnDestroy`, and by then `Router.url`
  // already names the route being navigated TO — see the service's own doc
  // for the bug that shipped.
  //
  // Bands change what "the column" means. With grouping on there is no
  // single strip and no single column per status: every band renders its
  // own strip and its own copy of every column. So the two scroll offsets
  // the record can hold — one horizontal, one per status — have nowhere to
  // land, and `restorePage`/`restoreColumnScroll` are honest no-ops there.
  // Focus is not: a card is found by its `data-pane` key wherever it is
  // rendered, which is the half of the return trip that keyboard users
  // actually feel (docs/UX-GUIDELINES.md, "Keyboard-first"). Per-band
  // geometry would need the record to name the band, which is a change to
  // what is remembered, not to how it is applied.

  private readonly restorePort: BoardRestorePort = {
    currentUrl: () => this.router.url || '/',
    // A strip in the DOM — the board's own, or any band's — means the
    // skeleton is gone and there is something to restore into.
    ready: () => !!this.host.nativeElement.querySelector('.board-strip, .swimlane-strip'),
    restorePage: (scrollLeft) => {
      const element = this.strip()?.nativeElement;
      if (!element || element.clientWidth === 0 || element.scrollLeft === scrollLeft) {
        return;
      }
      element.scrollLeft = scrollLeft;
      const column = this.visibleColumns()[pageIndex(scrollLeft, element.clientWidth)];
      if (column) {
        this.currentKey.set(column.key);
      }
    },
    restoreColumnScroll: (status, scrollTop) => {
      const scroller = this.columnScroller(status);
      if (scroller) {
        scroller.scrollTop = scrollTop;
      }
    },
    columnKeys: (status) => (this.columns()[status] ?? []).map((pane) => `${pane.host}:${pane.id}`),
    // `preventScroll` so restoring focus cannot undo the scroll just restored.
    focusCard: (paneKey) => focusCard(this.host.nativeElement, paneKey, { preventScroll: true }),
  };

  /**
   * The element that actually scrolls a column: the CDK viewport when
   * virtualized, the body otherwise. `null` while grouping is on — the
   * board renders no columns of its own then, only bands do.
   */
  private columnScroller(status: AgentStatus): HTMLElement | null {
    for (const ref of this.columnEls()) {
      const element = ref.nativeElement as HTMLElement;
      if (element.querySelector(`.column[data-status="${status}"]`)) {
        return (
          element.querySelector<HTMLElement>('cdk-virtual-scroll-viewport') ??
          element.querySelector<HTMLElement>('.column-body')
        );
      }
    }
    return null;
  }

  /** Hand the next mount everything it needs to put the user back here. */
  ngOnDestroy(): void {
    const strip = this.strip()?.nativeElement;
    const scrollTops: Partial<Record<AgentStatus, number>> = {};
    for (const status of this.visibleStatuses()) {
      const scroller = this.columnScroller(status);
      if (scroller && scroller.scrollTop > 0) {
        scrollTops[status] = scroller.scrollTop;
      }
    }
    this.boardReturn.rememberBoard({ scrollLeft: strip?.scrollLeft ?? 0, scrollTops });
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
    void this.router.navigate(['/']);
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
  // Every creation carries a destination. `pane.split` and `tab.create`
  // both resolve an omitted destination against whatever herdr has FOCUSED
  // on that host, which is a place the operator is not looking at and has
  // no way to see from here — so the board sends the scope the URL already
  // names (the rail is the navigator; the scope is in the route).
  //
  // The host is part of that destination, and it is deliberately NOT the
  // capability gate. `createHost()` answers "where does this go"; the three
  // availability signals answer "can that host do it", and each is a plain
  // capability read on whatever `createHost()` returned. They used to be
  // the same question, which is how first-in-config-order quietly became
  // both the default destination and the reason the menu appeared at all.
  //
  // Host identity is read per-resource — a workspace carries its own
  // `host`, so nothing here assumes the host list is fixed at startup or
  // that a host is a local socket. `unscopedHost()` is the one place that
  // still walks the configured order, and it is what the destination
  // picker replaces (tasks 1.3 / 2.1).

  /**
   * The fallback destination host with no scope on the board: the first
   * configured host that can create anything. A guess, and the only one
   * left — the picker in phase 2 asks instead when more than one host
   * qualifies.
   */
  private readonly unscopedHost = computed<string | null>(() => {
    const capabilities = this.capabilities();
    for (const host of this.store.hostsSignal()) {
      const caps = capabilities.get(host.name);
      if (caps?.paneCreate || caps?.tabCrud || caps?.workspaceCrud) {
        return host.name;
      }
    }
    return null;
  });

  /** The host the `+` menu acts on: the scoped workspace's own, else the fallback. */
  private readonly createHost = computed<string | null>(
    () => this.resolvedWorkspace()?.host ?? this.unscopedHost()
  );

  // --- asking, when there is no scope to answer with ---------------------
  //
  // A scoped board already knows where a creation goes. An unscoped one does
  // not, and the fallback below it is a guess dressed as a default. So the
  // menu asks — but only when the question has more than one answer: with a
  // single workspace on a single capable host there is nothing to choose
  // between, and a list of one is a click, not a question.

  /** Which creation is waiting on a destination, if any. */
  protected readonly pendingCreate = signal<'pane' | 'tab' | 'workspace' | null>(null);

  /** How deep a destination each creation needs, and what the host must advertise. */
  private static readonly CREATE_DESTINATION: Record<
    'pane' | 'tab' | 'workspace',
    { level: DestinationLevel; capability: DestinationCapability }
  > = {
    pane: { level: 'tab', capability: 'paneCreate' },
    tab: { level: 'workspace', capability: 'tabCrud' },
    workspace: { level: 'host', capability: 'workspaceCrud' },
  };

  protected readonly pendingLevel = computed<DestinationLevel>(
    () => Board.CREATE_DESTINATION[this.pendingCreate() ?? 'pane'].level
  );
  protected readonly pendingCapability = computed<DestinationCapability>(
    () => Board.CREATE_DESTINATION[this.pendingCreate() ?? 'pane'].capability
  );

  /**
   * Whether this creation has more than one place it could land. Counted
   * from the same `destinationsFor` the picker renders, so the decision to
   * ask and the list that gets shown can never disagree.
   */
  private ambiguous(kind: 'pane' | 'tab' | 'workspace'): boolean {
    if (this.resolvedWorkspace()) {
      return false;
    }
    const { level, capability } = Board.CREATE_DESTINATION[kind];
    return (
      destinationsFor(
        {
          workspaces: this.store.workspacesSignal().values(),
          tabs: this.store.tabsSignal().values(),
          panes: this.store.panesSignal().values(),
          capabilities: this.capabilities(),
        },
        { level, capability }
      ).length > 1
    );
  }

  /** The picker's answer: perform the creation that was waiting on it. */
  protected async onDestinationChosen(destination: Destination): Promise<void> {
    const kind = this.pendingCreate();
    this.pendingCreate.set(null);
    this.layout.closePlusMenu();
    if (kind === 'pane') {
      await this.createPane(destination.host, {
        ...(destination.workspaceId ? { workspace_id: destination.workspaceId } : {}),
        ...(destination.targetPaneId ? { target_pane_id: destination.targetPaneId } : {}),
      });
    } else if (kind === 'tab') {
      await this.createTab(
        destination.host,
        destination.workspaceId ? { workspace_id: destination.workspaceId } : {}
      );
    } else if (kind === 'workspace') {
      await this.createWorkspace(destination.host);
    }
  }

  /**
   * A pane inside the scoped tab, so `pane.split` lands in THAT tab rather
   * than the workspace's focused one — `workspace_id` alone only narrows the
   * destination to the workspace. `null` when the board is not tab-scoped,
   * which is the case where the workspace id is the whole destination.
   */
  private readonly scopedTargetPane = computed<Pane | null>(() => {
    const tab = this.resolvedTab();
    if (!tab) {
      return null;
    }
    for (const pane of this.store.panesSignal().values()) {
      if (pane.host === tab.host && pane.tab.id === tab.id) {
        return pane;
      }
    }
    return null;
  });

  private capabilitiesForCreateHost(): BridgeCapabilities | undefined {
    const host = this.createHost();
    return host ? this.capabilities().get(host) : undefined;
  }

  protected readonly newPaneAvailable = computed(
    () => this.capabilitiesForCreateHost()?.paneCreate === true
  );
  protected readonly newTabAvailable = computed(
    () => this.capabilitiesForCreateHost()?.tabCrud === true
  );
  protected readonly newWorkspaceAvailable = computed(
    () => this.capabilitiesForCreateHost()?.workspaceCrud === true
  );
  protected readonly plusMenuAvailable = computed(
    () => this.newPaneAvailable() || this.newTabAvailable() || this.newWorkspaceAvailable()
  );

  protected readonly plusMenuOpen = this.layout.plusMenuOpen;

  private readonly plusMenuEl = viewChild<ElementRef<HTMLElement>>('plusMenu');
  private readonly plusTrigger = viewChild<ElementRef<HTMLButtonElement>>('plusTrigger');

  protected togglePlusMenu(): void {
    this.pendingCreate.set(null);
    this.layout.togglePlusMenu();
  }

  /**
   * The same contract a card's menu has (shared/menu-keys.ts): arrows, Home
   * and End walk the items, Escape closes and puts focus back on the `+`.
   * The destination list is part of that walk rather than a second menu —
   * see `shared/destination-picker`.
   */
  protected onPlusMenuKeydown(event: KeyboardEvent): void {
    handleMenuKeydown(event, this.plusMenuEl()?.nativeElement ?? null, () => {
      this.pendingCreate.set(null);
      this.layout.closePlusMenu();
      this.plusTrigger()?.nativeElement.focus();
    });
  }

  protected async newPane(): Promise<void> {
    if (this.ambiguous('pane')) {
      this.pendingCreate.set('pane');
      return;
    }
    this.layout.closePlusMenu();
    const host = this.createHost();
    if (!host) {
      return;
    }
    const workspace = this.resolvedWorkspace();
    const target = this.scopedTargetPane();
    await this.createPane(host, {
      ...(workspace ? { workspace_id: workspace.id } : {}),
      ...(target ? { target_pane_id: target.id } : {}),
    });
  }

  protected async newTab(): Promise<void> {
    if (this.ambiguous('tab')) {
      this.pendingCreate.set('tab');
      return;
    }
    this.layout.closePlusMenu();
    const host = this.createHost();
    if (!host) {
      return;
    }
    const workspace = this.resolvedWorkspace();
    await this.createTab(host, workspace ? { workspace_id: workspace.id } : {});
  }

  protected async newWorkspace(): Promise<void> {
    if (this.ambiguous('workspace')) {
      this.pendingCreate.set('workspace');
      return;
    }
    this.layout.closePlusMenu();
    const host = this.createHost();
    if (!host) {
      return;
    }
    await this.createWorkspace(host);
  }

  // --- doing it, once the destination is settled -------------------------

  private async createPane(
    host: string,
    destination: Omit<BridgeMethodParams['pane.split'], 'direction'>
  ): Promise<void> {
    try {
      await this.store.splitPane(host, { direction: 'right', ...destination });
    } catch (err) {
      this.toast.push({
        level: 'error',
        message: fill(COPY.toast.createPaneFailed, { reason: describeError(err) }),
      });
    }
  }

  private async createTab(
    host: string,
    destination: BridgeMethodParams['tab.create']
  ): Promise<void> {
    try {
      const result = await this.store.createTab(host, destination);
      if (result) {
        this.store.requestPendingRename('tab', host, result.tab.id);
      }
    } catch (err) {
      this.toast.push({
        level: 'error',
        message: fill(COPY.toast.createTabFailed, { reason: describeError(err) }),
      });
    }
  }

  private async createWorkspace(host: string): Promise<void> {
    try {
      const result = await this.store.createWorkspace(host, {});
      if (result) {
        this.store.requestPendingRename('workspace', host, result.workspace.id);
      }
    } catch (err) {
      this.toast.push({
        level: 'error',
        message: fill(COPY.toast.createWorkspaceFailed, { reason: describeError(err) }),
      });
    }
  }
}

function describeError(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
