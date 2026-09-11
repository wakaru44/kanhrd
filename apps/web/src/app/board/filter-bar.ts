import { Component, computed, inject } from '@angular/core';
import { COPY } from '../shared/copy';
import { PanesStore, STATUS_COLUMN_ORDER } from '../state/panes.store';
import { ParkedStore } from '../state/parked.store';
import { SettingsService, type SwimlaneDimension } from '../state/settings.service';
import { WsClient } from '../state/ws-client';
import { boardColumnRefs, type BoardColumnRef } from './column';

/**
 * The grouping dimensions, in the order the chips render. `none` leads
 * because it is the default and the way back to the plain board.
 */
export const SWIMLANE_DIMENSIONS: readonly SwimlaneDimension[] = [
  'none',
  'host',
  'repository',
  'checkout',
  'tab',
];

@Component({
  selector: 'app-filter-bar',
  imports: [],
  templateUrl: './filter-bar.html',
  styleUrl: './filter-bar.scss',
})
export class FilterBar {
  protected readonly store = inject(PanesStore);
  protected readonly ws = inject(WsClient);
  protected readonly settings = inject(SettingsService);
  private readonly parked = inject(ParkedStore);
  protected readonly dimensions = SWIMLANE_DIMENSIONS;
  protected readonly copy = COPY;

  /**
   * One chip per column the board renders — the five status columns in
   * `STATUS_COLUMN_ORDER`, then the operator's parked columns in their own
   * order. Hidden columns keep their chip (that is how they come back), so
   * this list is the full board, not `Board.visibleColumns`.
   */
  protected readonly columns = computed<readonly BoardColumnRef[]>(() =>
    boardColumnRefs(STATUS_COLUMN_ORDER, this.parked.columns())
  );

  protected dimensionLabel(dimension: SwimlaneDimension): string {
    return COPY.swimlane[dimension];
  }

  protected isGroupedBy(dimension: SwimlaneDimension): boolean {
    return this.settings.settings().swimlaneDimension === dimension;
  }

  protected groupBy(dimension: SwimlaneDimension): void {
    this.settings.setSwimlaneDimension(dimension);
  }

  /**
   * Live card total for the chip's column. Reflects the panes store's own
   * scope- and host-filtered view, but ignores the column-visibility filter
   * the chip itself controls, so a hidden chip keeps reporting how many
   * cards are still in that column.
   */
  protected columnCount(column: BoardColumnRef): number {
    return this.store.columnCountsSignal().get(column.key) ?? 0;
  }

  protected isHostExcluded(host: string): boolean {
    return this.store.filtersSignal().excludedHosts.has(host);
  }

  protected isColumnHidden(column: BoardColumnRef): boolean {
    return this.store.filtersSignal().hiddenColumns.has(column.key);
  }

  protected toggleHost(host: string): void {
    this.store.toggleHost(host);
  }

  protected toggleColumn(column: BoardColumnRef): void {
    this.store.toggleColumn(column.key);
  }
}
