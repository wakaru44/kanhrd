import { Component, inject } from '@angular/core';
import type { AgentStatus } from '@kanhrd/schema';
import { COPY } from '../shared/copy';
import { PanesStore, STATUS_COLUMN_ORDER } from '../state/panes.store';
import { SettingsService, type SwimlaneDimension } from '../state/settings.service';
import { WsClient } from '../state/ws-client';

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
  protected readonly statusOrder = STATUS_COLUMN_ORDER;
  protected readonly dimensions = SWIMLANE_DIMENSIONS;
  protected readonly copy = COPY;

  protected dimensionLabel(dimension: SwimlaneDimension): string {
    return COPY.swimlane[dimension];
  }

  protected isGroupedBy(dimension: SwimlaneDimension): boolean {
    return this.settings.settings().swimlaneDimension === dimension;
  }

  protected groupBy(dimension: SwimlaneDimension): void {
    this.settings.setSwimlaneDimension(dimension);
  }

  protected statusLabel(status: AgentStatus): string {
    return COPY.status[status];
  }

  /**
   * Live pane total for the chip's status. Reflects the panes store's own
   * scope- and host-filtered view, but ignores the status-visibility filter
   * the chip itself controls, so a hidden chip keeps reporting how many
   * panes are still in that status.
   */
  protected statusCount(status: AgentStatus): number {
    return this.store.statusCountsSignal()[status];
  }

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
