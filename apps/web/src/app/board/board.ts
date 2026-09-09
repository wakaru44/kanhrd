import { Component, computed, effect, inject } from "@angular/core";
import { toSignal } from "@angular/core/rxjs-interop";
import { ActivatedRoute, Router } from "@angular/router";
import { map } from "rxjs";
import { LucidePlus, LucideX } from "@lucide/angular";
import { PanesStore, STATUS_COLUMN_ORDER } from "../state/panes.store";
import { Column } from "./column";
import { FilterBar } from "./filter-bar";
import { Rail } from "../rail/rail";
import { LayoutService } from "../state/layout.service";
import { ToastService } from "../state/toast.service";
import { EmptyState } from "./empty-state";

@Component({
  selector: "app-board",
  imports: [Column, FilterBar, Rail, EmptyState, LucideX, LucidePlus],
  templateUrl: "./board.html",
  styleUrl: "./board.scss",
})
export class Board {
  protected readonly store = inject(PanesStore);
  protected readonly layout = inject(LayoutService);
  private readonly toast = inject(ToastService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  protected readonly statusOrder = STATUS_COLUMN_ORDER;
  protected readonly columns = this.store.columnsSignal;
  protected readonly loading = this.store.hostsLoading;
  protected readonly error = this.store.hostsError;
  protected readonly capabilities = this.store.capabilitiesSignal;

  protected isStatusHidden(status: (typeof STATUS_COLUMN_ORDER)[number]): boolean {
    return this.store.filtersSignal().hiddenStatuses.has(status);
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

  constructor() {
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
        this.store.clearScope();
        return;
      }
      if (!workspace) {
        return; // not resolvable yet — leave the previous scope until it is, or forever if the id is stale/bogus
      }
      this.store.setScope(workspace.host, workspace.id, tabId ? (tab?.id ?? null) : null);
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
