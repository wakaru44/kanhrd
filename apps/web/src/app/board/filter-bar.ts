import { Component, inject } from "@angular/core";
import type { AgentStatus } from "@kanhrd/schema";
import { PanesStore, STATUS_COLUMN_ORDER } from "../state/panes.store";
import { WsClient } from "../state/ws-client";
import { hostColor } from "../util/host-color";

@Component({
  selector: "app-filter-bar",
  imports: [],
  templateUrl: "./filter-bar.html",
  styleUrl: "./filter-bar.scss",
})
export class FilterBar {
  protected readonly store = inject(PanesStore);
  protected readonly ws = inject(WsClient);
  protected readonly statusOrder = STATUS_COLUMN_ORDER;

  protected readonly hostColor = hostColor;

  protected isHostExcluded(host: string): boolean {
    return this.store.filtersSignal().excludedHosts.has(host);
  }

  protected isStatusHidden(status: AgentStatus): boolean {
    return this.store.filtersSignal().hiddenStatuses.has(status);
  }

  protected toggleHost(host: string): void {
    this.store.toggleHost(host);
  }

  protected toggleStatus(status: AgentStatus): void {
    this.store.toggleStatus(status);
  }
}
