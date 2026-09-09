import { Component, computed, inject } from "@angular/core";
import { PanesStore, STATUS_COLUMN_ORDER } from "../state/panes.store";
import { Column } from "./column";
import { FilterBar } from "./filter-bar";

@Component({
  selector: "app-board",
  imports: [Column, FilterBar],
  templateUrl: "./board.html",
  styleUrl: "./board.scss",
})
export class Board {
  protected readonly store = inject(PanesStore);
  protected readonly statusOrder = STATUS_COLUMN_ORDER;
  protected readonly columns = this.store.columnsSignal;
  protected readonly loading = this.store.hostsLoading;
  protected readonly error = this.store.hostsError;
  protected readonly capabilities = this.store.capabilitiesSignal;

  protected readonly hasAnyHosts = computed(() => this.store.hostsSignal().length > 0);

  protected isStatusHidden(status: (typeof STATUS_COLUMN_ORDER)[number]): boolean {
    return this.store.filtersSignal().hiddenStatuses.has(status);
  }
}
