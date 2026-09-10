import {
  Component,
  ElementRef,
  computed,
  effect,
  input,
  output,
  viewChild,
} from "@angular/core";
import type { AgentStatus, BridgeCapabilities } from "@kanhrd/schema";
import { COPY } from "../shared/copy";
import type { Swimlane as SwimlaneBand } from "../state/panes.store";
import type { SwimlaneDimension } from "../state/settings.service";
import { Column, mobileViewportSignal } from "./column";

/**
 * The resting page index of a paging strip. Deterministic by construction:
 * with `scroll-snap-type: x mandatory` and columns at `flex: 0 0 100%`, a
 * settled `scrollLeft` is always a whole multiple of `clientWidth`.
 *
 * It lives here rather than in `board.ts` because both the board's own
 * single strip and every band's strip page by the same rule, and the band
 * must not import the board it is rendered by. `board.ts` re-exports it, so
 * `import { pageIndex } from "./board"` still resolves.
 */
export function pageIndex(scrollLeft: number, clientWidth: number): number {
  return clientWidth > 0 ? Math.round(scrollLeft / clientWidth) : 0;
}

/**
 * Longest checkout path rendered whole in a band heading. Past this the
 * *head* is elided and the tail kept: `…/services/aservice` — the last
 * segment is the one that tells two checkouts of one repo apart, and it is
 * the one a head-truncating ellipsis would throw away.
 */
export const CHECKOUT_LABEL_MAX = 34;

function elideHead(value: string, max = CHECKOUT_LABEL_MAX): string {
  return value.length <= max ? value : `…${value.slice(value.length - max)}`;
}

/** The band heading as rendered, plus the full value for `title` when it was shortened or qualified. */
export interface BandLabel {
  lane: SwimlaneBand;
  label: string;
  /** `null` when the heading already says everything — no tooltip on a complete label. */
  title: string | null;
}

/**
 * Resolve every band's heading in one pass, because two of the rules need
 * the whole band set:
 *
 * - `ungrouped` is named by copy; `groupIntoSwimlanes` leaves its label
 *   empty on purpose (the store holds no user-facing strings).
 * - Under `tab`, the store labels a band with the bare `tab.name`, which is
 *   only unique per host: two hosts each with a tab named `main` produce two
 *   bands with the same heading, adjacent after the sort. A duplicated tab
 *   name is qualified with its host — and only then, so the common
 *   single-host board is not made noisier to pay for the multi-host case.
 * - Under `checkout`, a long path is elided at the head.
 */
export function bandLabels(
  lanes: readonly SwimlaneBand[],
  dimension: SwimlaneDimension,
): readonly BandLabel[] {
  const seen = new Map<string, number>();
  for (const lane of lanes) {
    seen.set(lane.label, (seen.get(lane.label) ?? 0) + 1);
  }
  return lanes.map((lane) => {
    if (lane.key === "ungrouped") {
      return { lane, label: COPY.swimlane.ungrouped, title: null };
    }
    if (dimension === "tab" && (seen.get(lane.label) ?? 0) > 1) {
      const host = lane.key.slice(0, lane.key.indexOf(":"));
      return { lane, label: `${host} / ${lane.label}`, title: null };
    }
    if (dimension === "checkout") {
      const label = elideHead(lane.label);
      return { lane, label, title: label === lane.label ? null : lane.label };
    }
    return { lane, label: lane.label, title: null };
  });
}

/**
 * One swimlane: a horizontal band holding the full set of visible columns
 * (docs/UX-GUIDELINES.md, "Board — populated"; openspec change
 * `add-swimlane-grouping`).
 *
 * Membership is derived from the pane's own data, never assigned, so the
 * band exposes **no drag handle, no grab cursor and no drop target** — the
 * same rule the status column already lives under. The band header is a
 * label and a count; nothing on it is draggable.
 *
 * The band is rendered only when a grouping dimension is active. With
 * `none` the board renders its own single strip directly, with no band
 * chrome at all, so the grouped-off DOM is what it always was.
 */
@Component({
  selector: "app-swimlane",
  imports: [Column],
  templateUrl: "./swimlane.html",
  styleUrl: "./swimlane.scss",
})
export class Swimlane {
  readonly lane = input.required<SwimlaneBand>();
  /** The heading as resolved by `bandLabels` — copy and disambiguation are the view's job, not the store's. */
  readonly label = input.required<string>();
  /** Full value behind an elided heading, or `null` when the heading is complete. */
  readonly title = input<string | null>(null);
  /** Visible status columns, already in `STATUS_COLUMN_ORDER`. Whatever the board yields, the band renders. */
  readonly statuses = input.required<readonly AgentStatus[]>();
  readonly capabilities = input.required<ReadonlyMap<string, BridgeCapabilities>>();
  /**
   * Index into `statuses` of the column the mobile pager rests on. The
   * selection is board-level state: every band pages together, so scrolling
   * down the board never lands on a band showing a different column.
   */
  readonly selectedIndex = input<number>(0);

  /** A swipe inside this band moves the board's page. */
  readonly page = output<number>();

  protected readonly mobile = mobileViewportSignal();

  private readonly strip = viewChild<ElementRef<HTMLElement>>("strip");

  /** Cards in this band across every visible column — the band's own count, not the board's. */
  protected readonly count = computed(() => {
    const columns = this.lane().columns;
    let total = 0;
    for (const status of this.statuses()) {
      total += columns[status]?.length ?? 0;
    }
    return total;
  });

  protected panesFor(status: AgentStatus) {
    return this.lane().columns[status] ?? [];
  }

  constructor() {
    // Follow the board's page when it changes underneath this band (a tap on
    // the switcher, or a swipe in a sibling band).
    effect(() => {
      const index = this.selectedIndex();
      const element = this.strip()?.nativeElement;
      if (!this.mobile() || !element || element.clientWidth === 0) {
        return;
      }
      if (pageIndex(element.scrollLeft, element.clientWidth) !== index) {
        this.scrollToIndex(index);
      }
    });
  }

  protected onStripScroll(): void {
    const element = this.strip()?.nativeElement;
    if (!this.mobile() || !element || element.clientWidth === 0) {
      return;
    }
    const index = pageIndex(element.scrollLeft, element.clientWidth);
    if (index !== this.selectedIndex() && index < this.statuses().length) {
      this.page.emit(index);
    }
  }

  private scrollToIndex(index: number): void {
    const element = this.strip()?.nativeElement;
    if (!element) {
      return;
    }
    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
    element.scrollTo({
      left: index * element.clientWidth,
      behavior: reduced ? "auto" : "smooth",
    });
  }
}
