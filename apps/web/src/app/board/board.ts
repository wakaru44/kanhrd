import { Component, computed, inject } from "@angular/core";
import { PanesStore, STATUS_COLUMN_ORDER } from "../state/panes.store";
import { Column } from "./column";
import { FilterBar } from "./filter-bar";
import { Rail } from "../rail/rail";
import { LayoutService } from "../state/layout.service";

@Component({
  selector: "app-board",
  imports: [Column, FilterBar, Rail],
  templateUrl: "./board.html",
  styleUrl: "./board.scss",
})
export class Board {
  protected readonly store = inject(PanesStore);
  protected readonly layout = inject(LayoutService);
  protected readonly statusOrder = STATUS_COLUMN_ORDER;
  protected readonly columns = this.store.columnsSignal;
  protected readonly loading = this.store.hostsLoading;
  protected readonly error = this.store.hostsError;
  protected readonly capabilities = this.store.capabilitiesSignal;

  protected readonly hasAnyHosts = computed(() => this.store.hostsSignal().length > 0);

  protected isStatusHidden(status: (typeof STATUS_COLUMN_ORDER)[number]): boolean {
    return this.store.filtersSignal().hiddenStatuses.has(status);
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
      console.warn("board: new pane failed", err);
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
      console.warn("board: new tab failed", err);
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
      console.warn("board: new workspace failed", err);
    }
  }
}
