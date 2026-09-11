import {
  Component,
  ElementRef,
  Signal,
  computed,
  effect,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { ScrollingModule } from '@angular/cdk/scrolling';
import { OverlayModule, type ConnectedPosition } from '@angular/cdk/overlay';
import type { AgentStatus, BridgeCapabilities, Pane } from '@kanhrd/schema';
import { COPY } from '../shared/copy';
import { LucideMoreHorizontal } from '../shared/icons';
import { handleMenuKeydown, menuItems } from '../shared/menu-keys';
import { ConfirmModal } from '../shared/confirm-modal';
import { EXIT_RULES, ParkedStore, type ExitRule, type ParkedColumn } from '../state/parked.store';
import { Card } from './card';

/** Ids for `aria-controls`, unique per column instance for the life of the page. */
let nextColumnMenuId = 0;

/**
 * One column slot on the board, in either kind. The board and every
 * swimlane band render the same ordered list of these: the five (visible)
 * status columns in `STATUS_COLUMN_ORDER`, then the operator's parked
 * columns in their own order, after `unknown`.
 *
 * `key` is the identity the mobile pager, the switcher segment and the
 * `tabpanel` ids are all built from, so one board page is one column
 * whichever kind it is.
 */
export interface BoardColumnRef {
  key: string;
  label: string;
  status: AgentStatus | null;
  parked: ParkedColumn | null;
}

export function parkedColumnKey(id: string): string {
  return `parked:${id}`;
}

export function boardColumnRefs(
  statuses: readonly AgentStatus[],
  parked: readonly ParkedColumn[]
): readonly BoardColumnRef[] {
  return [
    ...statuses.map((status) => ({
      key: status as string,
      label: COPY.status[status],
      status,
      parked: null,
    })),
    ...parked.map((column) => ({
      key: parkedColumnKey(column.id),
      label: column.name,
      status: null,
      parked: column,
    })),
  ];
}

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

const MOBILE_QUERY = '(max-width: 900px)';
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
    const query =
      typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(MOBILE_QUERY) : null;
    const matches = signal(query?.matches ?? false);
    query?.addEventListener('change', (event) => matches.set(event.matches));
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
  options?: FocusOptions
): boolean {
  const card = root?.querySelector(`app-card[data-pane="${CSS.escape(paneKey)}"]`);
  const focusable = card?.querySelector<HTMLElement>('a[href], button');
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
 * One board column, in either of the board's two kinds.
 *
 * **Status column** (`status` set): membership is herdr's fact, not the
 * user's. It exposes no drag handle, no grab cursor and no drop target,
 * carries no header action, and never calls `pane.move`
 * (docs/DESIGN-SYSTEM.md, "Status column"; docs/UX-GUIDELINES.md, "Status
 * columns are read-only").
 *
 * **Parked column** (`parked` set): membership is the operator's. Its
 * header adds the exit rule as visible text — legible without opening,
 * hovering or focusing anything — and a `LucideMoreHorizontal` menu,
 * visible on first render, carrying the rules as `role="menuitemradio"`
 * and `remove column`. Nothing about the status header changes.
 */
@Component({
  selector: 'app-column',
  imports: [Card, ScrollingModule, OverlayModule, LucideMoreHorizontal, ConfirmModal],
  templateUrl: './column.html',
  styleUrl: './column.scss',
})
export class Column {
  /** The status this column groups by, or `null` when this is a parked column. */
  readonly status = input<AgentStatus | null>(null);
  /** The operator's column, or `null` when this is a status column. */
  readonly parked = input<ParkedColumn | null>(null);
  readonly panes = input.required<Pane[]>();
  readonly capabilities = input.required<ReadonlyMap<string, BridgeCapabilities>>();

  private readonly mobile = mobileViewportSignal();
  private readonly parkedStore = inject(ParkedStore);

  protected readonly copy = COPY;
  protected readonly itemSize = VIRTUAL_ITEM_SIZE;
  protected readonly label = computed(() => {
    const parked = this.parked();
    const status = this.status();
    return parked ? parked.name : status ? COPY.status[status] : '';
  });

  // --- parked header ------------------------------------------------------

  protected readonly exitRules = EXIT_RULES;

  /** The rule as a word, rendered in `--ink-mute` beside the name — never colour or an icon alone. */
  protected ruleLabel(rule: ExitRule): string {
    return rule === 'never' ? COPY.park.rule.never : COPY.park.rule.agentActivity;
  }

  protected readonly menuOpen = signal(false);
  protected readonly showRemoveConfirm = signal(false);
  protected readonly menuId = `column-menu-${nextColumnMenuId++}`;

  /** Below the trigger, right edges aligned; above it when the viewport has no room. */
  protected readonly menuPositions: ConnectedPosition[] = [
    { originX: 'end', originY: 'bottom', overlayX: 'end', overlayY: 'top' },
    { originX: 'end', originY: 'top', overlayX: 'end', overlayY: 'bottom' },
  ];

  private readonly menuEl = viewChild<ElementRef<HTMLElement>>('menu');
  private readonly menuTrigger = viewChild<ElementRef<HTMLButtonElement>>('menuTrigger');

  protected toggleMenu(): void {
    this.menuOpen.update((open) => !open);
  }

  protected closeMenu(refocus = true): void {
    if (!this.menuOpen()) {
      return;
    }
    this.menuOpen.set(false);
    if (refocus) {
      this.menuTrigger()?.nativeElement.focus();
    }
  }

  /** The same contract the card's menu has, lifted rather than rewritten (shared/menu-keys.ts). */
  protected onMenuKeydown(event: KeyboardEvent): void {
    handleMenuKeydown(event, this.menuEl()?.nativeElement ?? null, () => this.closeMenu());
  }

  protected chooseRule(rule: ExitRule): void {
    const parked = this.parked();
    if (parked) {
      // From the next event onward: changing the rule never reaches back
      // over statuses that already happened, so nothing unparks retroactively.
      this.parkedStore.setExitRule(parked.id, rule);
    }
    this.closeMenu();
  }

  protected onRemoveClick(): void {
    this.closeMenu(false);
    this.showRemoveConfirm.set(true);
  }

  protected confirmRemove(): void {
    const parked = this.parked();
    this.showRemoveConfirm.set(false);
    if (parked) {
      this.parkedStore.removeColumn(parked.id);
    }
  }

  constructor() {
    // Opening the menu moves focus into it, the way the card's does; it is
    // an overlay over the board, so focusing must not scroll the column
    // under it.
    effect(() => {
      const menu = this.menuEl()?.nativeElement;
      if (this.menuOpen() && menu) {
        menuItems(menu)[0]?.focus({ preventScroll: true });
      }
    });
  }
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
      (event.target as HTMLElement | null)?.closest('app-card')?.getAttribute('data-pane') ?? null;
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
