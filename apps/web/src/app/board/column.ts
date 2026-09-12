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
import { NgTemplateOutlet } from '@angular/common';
import { ScrollingModule } from '@angular/cdk/scrolling';
import { OverlayModule, type ConnectedPosition } from '@angular/cdk/overlay';
import { CdkDrag, CdkDragHandle, CdkDropList, type CdkDragDrop } from '@angular/cdk/drag-drop';
import type { AgentStatus, BridgeCapabilities, Pane } from '@kanhrd/schema';
import { COPY } from '../shared/copy';
import {
  LucideArrowLeft,
  LucideArrowRight,
  LucideMoreHorizontal,
  LucidePencil,
} from '../shared/icons';
import { handleMenuKeydown, menuItems } from '../shared/menu-keys';
import { ConfirmModal } from '../shared/confirm-modal';
import { RenameModal } from '../shared/rename-modal';
import { PanesStore, paneKey } from '../state/panes.store';
import {
  EXIT_RULES,
  ParkedStore,
  parkedColumnKey,
  reorderDelta,
  visibleNeighbour,
  type ExitRule,
  type ParkedColumn,
} from '../state/parked.store';
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

export { parkedColumnKey };

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

/**
 * Whether cards on this board are drag sources at all. Pure, because the
 * karma viewport is permanently below `--breakpoint-mobile` (see this
 * file's `mobileViewportSignal` note and `column.spec.ts`'s header), so the
 * enabled half of the rule can only be proven as arithmetic — the same
 * split `isCompact` already lives under.
 *
 * - No user-defined column: nothing to drag INTO, so nothing is a drag
 *   source (docs/UX-GUIDELINES.md, "Status columns are read-only").
 * - Below the mobile breakpoint: the board is a one-column-per-screen
 *   pager, so the destination is never on screen and a horizontal drag
 *   fights the pager. "Drag-drop must work or not appear."
 */
export function canDrag(hasParkedColumns: boolean, mobile: boolean): boolean {
  return hasParkedColumns && !mobile;
}

/**
 * Whether the columns themselves may be dragged, in the same shape and for
 * the same reason as `canDrag`: karma's viewport is permanently below
 * `--breakpoint-mobile`, so the enabled half can only be proven as
 * arithmetic.
 *
 * - Fewer than two parked columns: there is no rearrangement to make, so no
 *   handle and no grab cursor appear ("drag-drop must work or not appear").
 * - Below `--breakpoint-mobile`: the board is a one-column-per-screen pager
 *   and a horizontal drag fights it. The header menu's `move column left` /
 *   `move column right` are the path at that width, and they are present at
 *   every width.
 */
export function canReorderColumns(parkedCount: number, mobile: boolean): boolean {
  return parkedCount > 1 && !mobile;
}

/**
 * Index of the first parked column in a strip, i.e. the leftmost position a
 * dragged column may come to rest in. `boardColumnRefs` puts every status
 * column first, so this is the count of the visible status columns — and the
 * whole of the rule "a status column is never a reorder target", as the
 * strip's `cdkDropListSortPredicate`.
 */
export function firstParkedIndex(refs: readonly BoardColumnRef[]): number {
  const index = refs.findIndex((ref) => ref.parked !== null);
  return index < 0 ? refs.length : index;
}

/**
 * A drop on the VISIBLE strip, as a `moveColumn` argument over the FULL
 * parked order.
 *
 * The CDK reports positions in the list it dragged over, which holds only
 * the columns the filter bar left visible (commit `2ecdf61`); `order` holds
 * every parked column. So the drop is read as "land where the column
 * currently at `currentIndex` is", and that column's position in the full
 * order is what the delta is measured against — a hidden column between two
 * visible ones cannot shift the result.
 *
 * `null` when the drag was not a column reorder at all, or when it changed
 * nothing.
 */
export function columnReorderDelta(
  refs: readonly BoardColumnRef[],
  order: readonly string[],
  previousIndex: number,
  currentIndex: number
): { id: string; delta: number } | null {
  const moved = refs[previousIndex]?.parked;
  const neighbour = refs[currentIndex]?.parked;
  if (!moved || !neighbour) {
    return null;
  }
  const delta = reorderDelta(order, moved.id, neighbour.id);
  return delta === 0 ? null : { id: moved.id, delta };
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
 * Whether a CDK drag is carrying a pane, i.e. is a card rather than a column.
 * `cdkDragData` is the only thing a drop target can ask about the item it is
 * being offered, so the shape of the data is the test.
 */
function isPaneDrag(drag: CdkDrag): boolean {
  const data = drag.data as Partial<Pane> | undefined;
  return typeof data?.id === 'string' && typeof data?.host === 'string';
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
  imports: [
    Card,
    ScrollingModule,
    OverlayModule,
    NgTemplateOutlet,
    CdkDrag,
    CdkDragHandle,
    CdkDropList,
    LucideArrowLeft,
    LucideArrowRight,
    LucideMoreHorizontal,
    LucidePencil,
    ConfirmModal,
    RenameModal,
  ],
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
  private readonly panesStore = inject(PanesStore);

  protected readonly copy = COPY;
  protected readonly itemSize = VIRTUAL_ITEM_SIZE;

  // --- drag and drop (Q1 granted; docs/UX-GUIDELINES.md, "Status columns
  // are read-only") ------------------------------------------------------
  //
  // Three rules, and the code below is only these three:
  //
  // 1. Drop targets are user-defined columns ONLY. A status column is a
  //    drag SOURCE — a card has to start somewhere — but its
  //    `enterPredicate` refuses every foreign item, so nothing can be
  //    dropped into it and no drag ever changes a card's status. A card
  //    dragged out and released over its own column simply goes home.
  // 2. A card is a drag source only once at least one parked column
  //    exists. With none the board is the drag-free board it always was:
  //    every `cdkDrag` is disabled, every list is disabled, and no card
  //    carries a grab cursor.
  // 3. Not below `--breakpoint-mobile`. The board is a one-column-per-
  //    screen pager there, so the destination is never on screen and a
  //    horizontal drag fights the pager's own scroll. "Drag-drop must work
  //    or not appear": on a phone it cannot work, so it does not appear.
  //
  // Sorting is disabled in every list: neither a status column nor a
  // parked column persists a per-card order, and a sort animation would
  // promise one.

  protected readonly dragEnabled = computed(() =>
    canDrag(this.parkedStore.hasColumns(), this.mobile())
  );

  /**
   * A parked column receives cards; a status column never does — and what it
   * receives must actually be a card. The column strip's own reorder list is
   * neither in this list's `cdkDropListGroup` nor connected to it, so a
   * column drag can never reach here; requiring a pane in `cdkDragData`
   * costs one predicate and makes that independent of the wiring.
   */
  protected readonly enterPredicate = (drag: CdkDrag, drop: CdkDropList): boolean =>
    drag.dropContainer === drop || (this.parked() !== null && isPaneDrag(drag));

  protected onCardDropped(event: CdkDragDrop<unknown>): void {
    const parked = this.parked();
    const pane = event.item.data as Pane | undefined;
    if (!parked || !pane || event.previousContainer === event.container) {
      return;
    }
    this.parkedStore.park(paneKey(pane.host, pane.id), parked.id);
  }
  // --- column reorder ----------------------------------------------------
  //
  // Two paths onto one store call (`ParkedStore.moveColumn`): the header
  // menu's `move column left` / `move column right`, which exist at every
  // width, and a horizontal drag of the header, which exists only where it
  // can work. The drag is what needed the keyboard path to be legal at all
  // (docs/UX-GUIDELINES.md: keyboard-first, and "drag-drop must work or not
  // appear").
  //
  // The strip's own `cdkDropList` lives in `board.html` / `swimlane.html` —
  // it is the strip's property, not the column's. What is the column's is
  // being (or refusing to be) a drag source, and where its handle is.

  protected readonly reorderEnabled = computed(() =>
    canReorderColumns(this.parkedStore.columns().length, this.mobile())
  );

  /**
   * The column this one would trade places with, per direction, or `null` at
   * the end of the row — which is what renders the menu item `disabled`
   * rather than hiding it or leaving it enabled and inert.
   */
  private readonly neighbour = computed(() => {
    const parked = this.parked();
    const order = this.parkedStore.columns().map((column) => column.id);
    const hidden = this.panesStore.filtersSignal().hiddenColumns;
    if (!parked) {
      return { left: null, right: null };
    }
    return {
      left: visibleNeighbour(order, hidden, parked.id, -1),
      right: visibleNeighbour(order, hidden, parked.id, 1),
    };
  });

  protected readonly canMoveLeft = computed(() => this.neighbour().left !== null);
  protected readonly canMoveRight = computed(() => this.neighbour().right !== null);

  /**
   * The end items are `aria-disabled` rather than `disabled`, so they stay
   * focusable: `handleMenuKeydown` walks the items it finds, and a real
   * `disabled` button in that list would swallow an arrow key and trap the
   * user on it. Activating one does nothing at all — it does not even close
   * the menu, because a dead item must not look like it did something.
   */
  protected moveColumn(direction: -1 | 1): void {
    const parked = this.parked();
    const neighbour = direction === -1 ? this.neighbour().left : this.neighbour().right;
    if (!parked || !neighbour) {
      return;
    }
    const order = this.parkedStore.columns().map((column) => column.id);
    this.parkedStore.moveColumn(parked.id, reorderDelta(order, parked.id, neighbour));
    this.closeMenu();
  }

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
  protected readonly showRename = signal(false);
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

  /**
   * Closing the menu WITH refocus first hands the modal's focus trap the
   * trigger to return focus to — the same reason the card's rename does it
   * that way.
   */
  protected onRenameClick(): void {
    this.closeMenu();
    this.showRename.set(true);
  }

  /**
   * A column always has a name, so there is nothing to clear: the dialog's
   * clear action (an empty value) resets it to the default name rather than
   * leaving a nameless column on the board.
   */
  protected onRenameSaved(name: string | null): void {
    const parked = this.parked();
    this.showRename.set(false);
    if (parked) {
      this.parkedStore.renameColumn(parked.id, name ?? COPY.park.defaultName);
    }
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
