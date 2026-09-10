import { Component, ElementRef, Signal, computed, inject, input, signal } from "@angular/core";
import { ScrollingModule } from "@angular/cdk/scrolling";
import type { AgentStatus, BridgeCapabilities, Pane } from "@kanhrd/schema";
import { COPY } from "../shared/copy";
import { Card } from "./card";

/**
 * The two density thresholds are DISTINCT (docs/UX-GUIDELINES.md, "Density
 * and cardinality"): a column goes compact well before it is worth paying
 * for virtual scrolling.
 */
export const COMPACT_THRESHOLD = 20;
export const VIRTUALIZE_THRESHOLD = 50;

/**
 * `cdk-virtual-scroll-viewport`'s `itemSize` must equal the compact row
 * height plus its gap or rows clip: `--card-compact-height` (44) +
 * `--card-gap` (8). Virtualization only ever happens above
 * `VIRTUALIZE_THRESHOLD`, where every card is compact anyway.
 */
export const VIRTUAL_ITEM_SIZE = 44 + 8;

/** Pure so the thresholds are testable without a viewport or a fixture. */
export function isCompact(count: number, mobile: boolean): boolean {
  return mobile || count > COMPACT_THRESHOLD;
}

export function isVirtualized(count: number): boolean {
  return count > VIRTUALIZE_THRESHOLD;
}

const MOBILE_QUERY = "(max-width: 900px)";
let mobileViewport: Signal<boolean> | null = null;

/**
 * Shared `< --breakpoint-mobile` signal. `--breakpoint-mobile` is a custom
 * property and cannot be read by a media query, so 900px is written out
 * here exactly as the stylesheets write it.
 *
 * It lives in this file rather than `shared/` because the board work lane does
 * not own `shared/`; `board.ts` imports it from here (it already imports
 * `Column`, so there is no new edge in the module graph).
 */
export function mobileViewportSignal(): Signal<boolean> {
  if (!mobileViewport) {
    const query = typeof window !== "undefined" && window.matchMedia ? window.matchMedia(MOBILE_QUERY) : null;
    const matches = signal(query?.matches ?? false);
    query?.addEventListener("change", (event) => matches.set(event.matches));
    mobileViewport = matches.asReadonly();
  }
  return mobileViewport;
}

/**
 * Focus the card `paneKey` names, inside `root`.
 *
 * One implementation, two callers: the column restoring focus a recycled
 * view dropped, and the board putting focus back on the card a user just
 * came out of. Both need the same three rules — the same `data-pane` query,
 * the card's first focusable control, and never taking focus the user has
 * already placed somewhere themselves.
 *
 * `true` once the card has been reached (focused, or deliberately left
 * alone because focus was elsewhere); `false` while it is not rendered,
 * which is every caller's cue to look again.
 */
export function focusCard(
  root: HTMLElement | null,
  paneKey: string,
  options?: FocusOptions,
): boolean {
  const card = root?.querySelector(`app-card[data-pane="${CSS.escape(paneKey)}"]`);
  const focusable = card?.querySelector<HTMLElement>("a[href], button");
  if (!focusable) {
    return false;
  }
  const active = document.activeElement;
  if (active === null || active === document.body) {
    focusable.focus(options);
  }
  return true;
}

/**
 * One status column.
 *
 * Status membership is herdr's fact, not the user's: the column exposes no
 * drag handle, no grab cursor and no drop target, and never calls
 * `pane.move` (docs/DESIGN-SYSTEM.md, "Status column"; docs/UX-GUIDELINES.md,
 * "Status columns are read-only"). The former disabled `cdkDropList`/`cdkDrag`
 * scaffold is gone with the "park column" idea it was reserved for — the
 * docs now forbid the affordance outright.
 */
@Component({
  selector: "app-column",
  imports: [Card, ScrollingModule],
  templateUrl: "./column.html",
  styleUrl: "./column.scss",
})
export class Column {
  readonly status = input.required<AgentStatus>();
  readonly panes = input.required<Pane[]>();
  readonly capabilities = input.required<ReadonlyMap<string, BridgeCapabilities>>();

  private readonly mobile = mobileViewportSignal();

  protected readonly itemSize = VIRTUAL_ITEM_SIZE;
  protected readonly label = computed(() => COPY.status[this.status()]);
  protected readonly compact = computed(() => isCompact(this.panes().length, this.mobile()));
  protected readonly virtualized = computed(() => isVirtualized(this.panes().length));

  /** Stable pane identity, so crossing a density threshold re-renders without changing card identity. */
  protected trackPane(_index: number, pane: Pane): string {
    return `${pane.host}:${pane.id}`;
  }

  // --- focus survives recycling -----------------------------------------
  //
  // `cdkVirtualFor` recycles a card's view when it leaves the rendered
  // range: the DOM node is re-bound to a different pane, which silently
  // drops the focus ring. A focused card may not disappear that way
  // (docs/UX-GUIDELINES.md, "Density and cardinality"), so the column
  // remembers which pane had focus and restores it as soon as that pane is
  // rendered again. Only focus lost *while the viewport is scrolling* is
  // restored — a user who tabs or clicks away keeps the focus they chose.

  private static readonly RECYCLE_WINDOW_MS = 250;
  private static readonly RESTORE_RETRY_MS = 150;

  private readonly host = inject(ElementRef<HTMLElement>);
  private focusedPaneKey: string | null = null;
  private focusLostToRecycling = false;
  private lastScrollAt = 0;

  protected onFocusIn(event: FocusEvent): void {
    this.focusLostToRecycling = false;
    this.focusedPaneKey =
      (event.target as HTMLElement | null)?.closest("app-card")?.getAttribute("data-pane") ?? null;
  }

  protected onFocusOut(event: FocusEvent): void {
    if (event.relatedTarget !== null) {
      return; // the user moved focus somewhere deliberately
    }
    if (Date.now() - this.lastScrollAt < Column.RECYCLE_WINDOW_MS) {
      this.focusLostToRecycling = true;
    }
  }

  protected onViewportScroll(): void {
    this.lastScrollAt = Date.now();
    if (!this.focusLostToRecycling) {
      return;
    }
    // The recycled views reach the DOM a frame or two after this event under
    // zoneless change detection, so look for the card twice before giving up
    // on this scroll tick — the next tick tries again anyway.
    requestAnimationFrame(() => {
      this.restoreFocus();
      if (this.focusLostToRecycling) {
        setTimeout(() => this.restoreFocus(), Column.RESTORE_RETRY_MS);
      }
    });
  }

  private restoreFocus(): void {
    const key = this.focusedPaneKey;
    if (!key || !this.focusLostToRecycling) {
      return;
    }
    const active = document.activeElement;
    if (active && active !== document.body) {
      return; // the user chose this focus while the views were recycling
    }
    if (focusCard(this.host.nativeElement as HTMLElement, key)) {
      this.focusLostToRecycling = false;
    }
  }
}
