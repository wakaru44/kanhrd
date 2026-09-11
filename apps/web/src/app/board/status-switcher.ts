import { Component, ElementRef, computed, input, output, viewChildren } from '@angular/core';
import { COPY, fill } from '../shared/copy';
import type { BoardColumnRef } from './column';

/**
 * The mobile status switcher: a persistent segmented control between the
 * filter bar and the paging strip (docs/DESIGN-SYSTEM.md, "Status switcher
 * (mobile only)"; docs/UX-GUIDELINES.md, "Board paging model").
 *
 * It renders one `role="tab"` per *visible* status, in `STATUS_COLUMN_ORDER`
 * — the caller decides which statuses those are. It owns no selection state:
 * `selectedIndex` comes in and `select` goes out, so a swipe on the strip and
 * a tap on a segment are one state with two views. It is rendered only below
 * `--breakpoint-mobile`; the desktop board has side-by-side columns.
 */
@Component({
  selector: 'app-status-switcher',
  imports: [],
  templateUrl: './status-switcher.html',
  styleUrl: './status-switcher.scss',
})
export class StatusSwitcher {
  /**
   * The visible columns, in board order: status columns first, then the
   * operator's parked columns. One segment per COLUMN, not per status
   * (maintainer decision Q6) — a parked column pages like any other.
   */
  readonly columns = input.required<readonly BoardColumnRef[]>();
  /** Card count per visible column, index-aligned with `columns`. */
  readonly counts = input.required<readonly number[]>();
  /** Index into `statuses` of the column the strip is currently resting on. */
  readonly selectedIndex = input.required<number>();
  /**
   * Whether each segment controls exactly one panel. True on the ungrouped
   * board, where one status is one column. With swimlanes on there is one
   * column per status *per band*, so no single panel id is the tab's — the
   * reference is dropped rather than left pointing at an element that is
   * not there.
   */
  readonly controlsPanels = input<boolean>(true);

  readonly select = output<number>();

  protected readonly switcherLabel = COPY.nav.statusSwitcher;

  private readonly segments = viewChildren<ElementRef<HTMLButtonElement>>('segment');

  protected readonly selected = computed(() => this.selectedIndex());

  /** `{status} — {count} cards`: the accessible name carries the count for every segment, even though only the selected one shows it. */
  protected itemLabel(column: BoardColumnRef, index: number): string {
    return fill(COPY.nav.statusSwitcherItem, {
      status: column.label,
      count: String(this.counts()[index] ?? 0),
    });
  }

  protected choose(index: number): void {
    this.select.emit(index);
  }

  /** Left/right arrows move between segments; the strip follows via `select`. */
  protected onKeydown(event: KeyboardEvent): void {
    const delta = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    if (delta === 0) {
      return;
    }
    const count = this.columns().length;
    if (count === 0) {
      return;
    }
    event.preventDefault();
    const next = (this.selectedIndex() + delta + count) % count;
    this.select.emit(next);
    this.segments()[next]?.nativeElement.focus();
  }
}
