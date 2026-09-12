import {
  Component,
  ElementRef,
  computed,
  effect,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { OverlayModule, type ConnectedPosition } from '@angular/cdk/overlay';
import type {
  BridgeCapabilities,
  HerdrPaneMoveDestination,
  Pane,
  SplitDirection,
} from '@kanhrd/schema';
import { PanesStore, paneKey } from '../state/panes.store';
import { ConfirmModal } from '../shared/confirm-modal';
import { RenameModal } from '../shared/rename-modal';
import { ClockTick, formatElapsed } from '../util/clock';
import { paneSecondaryIdentity, paneTitle } from '../util/pane-title';
import { pathTail } from '../util/path-tail';
import { ToastService } from '../state/toast.service';
import { BoardReturnService } from '../state/board-return.service';
import { COPY, fill } from '../shared/copy';
import { handleMenuKeydown, menuItems } from '../shared/menu-keys';
import { ParkedStore } from '../state/parked.store';
import {
  LucideArrowDown,
  LucideArrowRight,
  LucideCornerUpRight,
  LucideMoreHorizontal,
  LucidePencil,
  LucideX,
} from '../shared/icons';
import { DestinationPicker, type Destination } from '../shared/destination-picker';

/**
 * The card's action labels, gathered from `shared/copy.ts` under the names
 * the template uses. Not a copy block: there is no string here, only a
 * mapping, so the words themselves have exactly one home.
 *
 * Two of them deliberately come from outside `copy.card`: closing a session
 * uses the sanctioned care verb from `confirm`, and the overflow trigger is
 * the same control the rail's rows carry.
 */
export const CARD_COPY = {
  split: COPY.card.split,
  splitRight: COPY.card.splitRight,
  move: COPY.card.move,
  moveExistingTab: COPY.card.moveExistingTab,
  moveNewTab: COPY.card.moveNewTab,
  moveNewWorkspace: COPY.card.moveNewWorkspace,
  splitDown: COPY.card.splitDown,
  close: COPY.confirm.closePaneAction,
  moreActions: COPY.nav.moreActions,
  rename: COPY.card.renameAction,
  park: COPY.card.park,
  unpark: COPY.card.unpark,
  newColumn: COPY.park.newColumn,
} as const;

/** Ids for `aria-controls`, unique per card instance for the life of the page. */
let nextMenuId = 0;

/**
 * The card's three menus. Each has its own trigger in the action row, and
 * only ever one is open — so which one is open is a single piece of state
 * rather than three booleans that could disagree with each other.
 */
export type CardMenu = 'move' | 'split' | 'overflow';

@Component({
  selector: 'app-card',
  imports: [
    RouterLink,
    OverlayModule,
    ConfirmModal,
    RenameModal,
    LucideArrowRight,
    LucideArrowDown,
    LucideX,
    LucideMoreHorizontal,
    LucidePencil,
    LucideCornerUpRight,
    DestinationPicker,
  ],
  templateUrl: './card.html',
  styleUrl: './card.scss',
  host: {
    '[class.compact]': 'compact()',
    '(document:click)': 'onDocumentClick($event)',
  },
})
export class Card {
  private readonly store = inject(PanesStore);
  private readonly clock = inject(ClockTick);
  private readonly toast = inject(ToastService);
  private readonly boardReturn = inject(BoardReturnService);

  readonly pane = input.required<Pane>();
  /** Per-host `bridge.capabilities` results, threaded down from the store via Board/Column. */
  readonly capabilities = input.required<ReadonlyMap<string, BridgeCapabilities>>();
  /**
   * Forces the single-row compact variant. The other two compact triggers —
   * `data-density="compact"` and a viewport under `--breakpoint-mobile` — are
   * CSS-only and need no input. This one exists for the "> 20 cards in a
   * status column" rule, which only `Column` can count; it defaults to
   * `false`, so `Column` can start passing it without a lockstep change here.
   */
  readonly compact = input(false);
  /**
   * This card's position in its status column, threaded down by `Column`.
   * Only used to remember where to put focus back on return, so a card whose
   * pane is gone by then can fall back to the card now standing in its place.
   */
  readonly indexInColumn = input(0);

  protected readonly copy = COPY;
  protected readonly action = CARD_COPY;

  /** `label ?? display_agent ?? agent ?? title ?? id prefix` — see `util/pane-title.ts`. */
  protected readonly displayName = computed(() => paneTitle(this.pane()));

  /**
   * The agent identity an operator-authored `label` displaced, so neither
   * name is lost. `null` — and so no second row at all — whenever the title
   * already IS the agent identity.
   */
  protected readonly secondaryIdentity = computed(() => paneSecondaryIdentity(this.pane()));

  /**
   * Repo name plus the truncated checkout path, or `null` when the pane's
   * workspace resolves outside any repository — in which case the card
   * renders no project line at all, not a placeholder.
   */
  protected readonly project = computed(() => {
    const project = this.pane().project;
    if (!project) return null;
    return {
      repo: project.repo_name,
      tail: pathTail(project.checkout_path),
      full: project.checkout_path,
    };
  });

  protected readonly path = computed(() => {
    const pane = this.pane();
    return `${pane.workspace.name} / ${pane.tab.name}`;
  });

  /**
   * Whether the repo name is worth its own locator. It is not when it is
   * the workspace's name again, which is the common shape on this board
   * (a workspace named after the repo it is checked out from): the
   * `workspace / tab` locator beside it already prints that word, and a
   * locator that repeats its neighbour is not a second fact. The checkout
   * path still names the directory, so nothing becomes unreachable.
   */
  protected readonly showRepo = computed(() => {
    const project = this.project();
    if (!project) {
      return false;
    }
    return project.repo.toLowerCase() !== this.pane().workspace.name.toLowerCase();
  });

  /** The status word rendered beside the dot — colour is never the only carrier. */
  protected readonly statusLabel = computed(
    () => COPY.status[this.pane().agent_status] ?? COPY.status.unknown
  );

  /** Whether this pane's host bridge supports the tier-2 terminal detail view. */
  protected readonly terminalAvailable = computed(
    () => this.capabilities().get(this.pane().host)?.terminal === true
  );

  /** Tier-3: whether `pane.close` will succeed on this pane's host. */
  protected readonly paneCloseAvailable = computed(
    () => this.capabilities().get(this.pane().host)?.paneClose === true
  );
  /** Tier-3: whether `pane.split` will succeed on this pane's host. */
  protected readonly paneSplitAvailable = computed(
    () => this.capabilities().get(this.pane().host)?.paneCreate === true
  );
  /** Whether `pane.rename` will succeed on this pane's host — its own flag, not part of the tier-3 bundle. */
  protected readonly paneRenameAvailable = computed(
    () => this.capabilities().get(this.pane().host)?.paneRename === true
  );

  /**
   * Tier-3: whether `pane.move` will succeed on this pane's host. Where it
   * is false the move control is not rendered at all — not disabled, not
   * hidden behind a failure (spec `board-card-actions`).
   */
  protected readonly paneMoveAvailable = computed(
    () => this.capabilities().get(this.pane().host)?.paneMove === true
  );

  /**
   * Whether any herdr-side action is offered at all. The action row itself
   * is NOT gated on this: park and unpark are client-local, need no
   * capability and no host, so a tier-1 board still carries the overflow
   * menu — which is also the only keyboard path to parking.
   */
  protected readonly hasPaneActions = computed(
    () =>
      this.paneSplitAvailable() ||
      this.paneCloseAvailable() ||
      this.paneRenameAvailable() ||
      this.paneMoveAvailable()
  );

  // --- move (herdr's pane.move; NOT parking) ------------------------------
  //
  // `move to…` and `park in…` are deliberately not the same menu and not the
  // same verb. A move reparents the pane on the host, can close the tab it
  // left behind, and every other herdr client sees it. Parking groups a card
  // in a column held in this browser and changes nothing anywhere else. One
  // verb over two operations with opposite blast radii is how an operator
  // ends up moving a pane on a colleague's machine when they meant to tidy
  // their own board.

  /** `move to…` expands its three destinations in place, like `park in…` above it. */
  protected readonly moveListOpen = signal(false);
  /** `another tab` expands the destination list under it — one menu, one keyboard contract. */
  protected readonly moveTabListOpen = signal(false);

  /** The pane's own tab, which the destination list leaves out: moving there is herdr's `same_tab` no-op. */
  protected readonly ownTab = computed(() => ({
    host: this.pane().host,
    tabId: this.pane().tab.id,
  }));

  protected toggleMoveList(): void {
    this.moveListOpen.update((open) => !open);
    if (!this.moveListOpen()) {
      this.moveTabListOpen.set(false);
    }
  }

  protected toggleMoveTabList(): void {
    this.moveTabListOpen.update((open) => !open);
  }

  protected moveToTab(destination: Destination): void {
    if (!destination.tabId) {
      return;
    }
    void this.doMove({ type: 'tab', tab_id: destination.tabId, split: 'right' });
  }

  protected moveToNewTab(): void {
    void this.doMove({ type: 'new_tab' });
  }

  protected moveToNewWorkspace(): void {
    void this.doMove({ type: 'new_workspace' });
  }

  /**
   * One move, and three different endings.
   *
   * A move that happened needs nothing said: the card is visibly somewhere
   * else, and a success toast for a result already on screen is noise
   * (docs/UX-GUIDELINES.md, "Success toasts are used sparingly").
   *
   * A move that herdr declined comes back as a SUCCESSFUL response with
   * `changed: false` and a reason, so it is neither an error nor a
   * completed move. `same_tab` says nothing at all — the operator asked for
   * where the card already is, and there is no wrong answer to correct.
   * `zoomed_tab` is an obstacle they can clear, so it says which one.
   *
   * A move that failed carries herdr's own prose, quoted through `{reason}`
   * like every other lifecycle failure.
   */
  private async doMove(destination: HerdrPaneMoveDestination): Promise<void> {
    this.closeMenu(false);
    const notice = this.toast.progress(this.noticeKey('move'), COPY.toast.working);
    try {
      const result = await this.store.movePane(this.pane().host, {
        pane_id: this.pane().id,
        destination,
        focus: false,
      });
      if (result && !result.changed) {
        if (result.reason === 'zoomed_tab') {
          notice.fail(COPY.toast.moveZoomed);
        } else {
          this.toast.dismissByKey(this.noticeKey('move'));
        }
        return;
      }
      notice.resolve();
    } catch (err) {
      notice.fail(
        fill(COPY.toast.moveFailed, { name: this.displayName(), reason: Card.reason(err) })
      );
    }
  }

  // --- parking (client-local; see state/parked.store.ts) ------------------

  private readonly parked = inject(ParkedStore);

  protected readonly parkedColumns = this.parked.columns;

  private readonly key = computed(() => paneKey(this.pane().host, this.pane().id));

  /** The parked column this card sits in, or `null` when it sits in its status column. */
  protected readonly parkedIn = computed(() => this.parked.membership().get(this.key()) ?? null);

  /** `park in…` expands its destinations in place, so one menu carries one keyboard contract. */
  protected readonly parkListOpen = signal(false);

  protected toggleParkList(): void {
    this.parkListOpen.update((open) => !open);
  }

  protected parkIn(columnId: string): void {
    this.parked.park(this.key(), columnId);
    this.closeMenu(false);
  }

  /** `new column…` — the column is created with the default name and this card goes straight into it. */
  protected parkInNewColumn(): void {
    const column = this.parked.createColumn(COPY.park.defaultName);
    this.parked.park(this.key(), column.id);
    this.closeMenu(false);
  }

  protected unpark(): void {
    this.parked.unpark(this.key());
    this.closeMenu(false);
  }

  protected readonly showCloseConfirm = signal(false);
  /** The value a failed rename kept, so reopening the dialog seeds it instead of the stored name. */
  protected readonly renameDraft = signal<string | null>(null);
  /** Inline reason on the rename dialog after a rejection; cleared on the next attempt. */
  protected readonly renameError = signal<string | null>(null);
  protected readonly showRename = signal(false);
  /**
   * Which of the card's three menus is open, if any. The action row's
   * `move` and `split` triggers each open one of their own rather than
   * acting immediately: each has more than one destination and neither has
   * a safe default worth guessing.
   */
  protected readonly openMenu = signal<CardMenu | null>(null);
  protected readonly menuOpen = computed(() => this.openMenu() !== null);

  protected isMenuOpen(menu: CardMenu): boolean {
    return this.openMenu() === menu;
  }

  /**
   * Every menu is portalled into the CDK overlay container, so none is a DOM
   * descendant of its trigger's parent. `aria-controls` is what still ties
   * each trigger to its own menu for a screen reader — and it needs an id
   * unique across every card on the board, and across the three menus of
   * this one.
   */
  private readonly menuIdBase = `card-menu-${nextMenuId++}`;

  protected menuIdFor(menu: CardMenu): string {
    return `${this.menuIdBase}-${menu}`;
  }

  /**
   * Below the trigger, right edges aligned — the position the menu has
   * always had — falling back to above it when the viewport has no room.
   * The gap is `.overflow-menu`'s own margin, so it stays a token.
   */
  protected readonly menuPositions: ConnectedPosition[] = [
    { originX: 'end', originY: 'bottom', overlayX: 'end', overlayY: 'top' },
    { originX: 'end', originY: 'top', overlayX: 'end', overlayY: 'bottom' },
  ];

  private readonly menuEl = viewChild<ElementRef<HTMLElement>>('menu');
  private readonly moveMenuEl = viewChild<ElementRef<HTMLElement>>('moveMenu');
  private readonly splitMenuEl = viewChild<ElementRef<HTMLElement>>('splitMenu');
  private readonly menuTrigger = viewChild<ElementRef<HTMLButtonElement>>('menuTrigger');
  private readonly moveTrigger = viewChild<ElementRef<HTMLButtonElement>>('moveTrigger');
  private readonly splitTrigger = viewChild<ElementRef<HTMLButtonElement>>('splitTrigger');
  private readonly actionsEl = viewChild<ElementRef<HTMLElement>>('actions');

  /** The open menu's element, whichever of the three it is. */
  private activeMenuEl(): HTMLElement | null {
    switch (this.openMenu()) {
      case 'move':
        return this.moveMenuEl()?.nativeElement ?? null;
      case 'split':
        return this.splitMenuEl()?.nativeElement ?? null;
      case 'overflow':
        return this.menuEl()?.nativeElement ?? null;
      default:
        return null;
    }
  }

  /** The trigger that owns the open menu, so Escape can put focus back on it. */
  private activeTriggerEl(): HTMLButtonElement | null {
    switch (this.openMenu()) {
      case 'move':
        return this.moveTrigger()?.nativeElement ?? null;
      case 'split':
        return this.splitTrigger()?.nativeElement ?? null;
      case 'overflow':
        return this.menuTrigger()?.nativeElement ?? null;
      default:
        return null;
    }
  }

  // --- meta row ----------------------------------------------------------
  // Only data already on the `Pane` surface: the pane's own `agent_status`
  // plus how long it's held that status. The duration comes from the
  // bridge's `status_since` — the bridge watches the transition and outlives
  // every board mount, virtual-scroll recycle and page reload the card does
  // not. Nothing here reads the clock at construction: that was the defect
  // this replaces (every card showed the same number, and all of them reset
  // on every visit to the board).
  //
  // A bridge that cannot vouch for the value omits it, and the card then
  // renders no duration at all. There is no fallback to client time: a
  // missing readout is honest, a zero would be a fabrication.
  //
  // The optional line count reads `last_output_snippet` if a bridge
  // populated it; no card ever fetches terminal output for decoration.

  protected readonly elapsed = computed(() => {
    const since = this.pane().status_since;
    if (since === undefined) return null;
    return formatElapsed(this.clock.now() - since);
  });

  protected readonly lineCount = computed(() => {
    const snippet = this.pane().last_output_snippet;
    return snippet ? snippet.split('\n').length : null;
  });

  constructor() {
    // Opening the overflow menu moves focus into it (keyboard-first: the menu
    // is navigable with arrows and returns focus to its trigger on Escape).
    // `preventScroll`: the menu is an overlay over the board, so focusing it
    // must not scroll the column under it — which would also trip the
    // close-on-scroll below.
    effect(() => {
      // Read through the signals so the effect re-runs when a menu opens,
      // when it is swapped for another, and when an item expands its own
      // destinations inside it.
      this.openMenu();
      this.parkListOpen();
      this.moveListOpen();
      this.moveTabListOpen();
      const menu = this.activeMenuEl();
      if (menu) {
        const items = menuItems(menu);
        if (!menu.contains(document.activeElement)) {
          items[0]?.focus({ preventScroll: true });
        }
      }
    });

    // An overlay is anchored at the moment it opens; once the column scrolls
    // under it, a menu left floating over unrelated cards is worse than the
    // clipping it replaced, so it closes. Capture phase because a scroll
    // inside `.column-body` (or the virtual viewport) never bubbles.
    effect((onCleanup) => {
      if (!this.menuOpen()) {
        return;
      }
      const close = () => this.closeMenu(false);
      document.addEventListener('scroll', close, true);
      onCleanup(() => document.removeEventListener('scroll', close, true));
    });
  }

  /**
   * Opening a card is a round trip. Recording where it was opened from —
   * before the router leaves — is what lets the board put the user back on
   * the same page, scroll and card when they come out
   * (`BoardReturnService`).
   */
  protected rememberReturn(): void {
    this.boardReturn.rememberCard(
      `${this.pane().host}:${this.pane().id}`,
      this.pane().agent_status,
      this.indexInColumn()
    );
  }

  /** Distinguishes one card's actions from its neighbours' for a screen reader. */
  protected actionLabel(label: string): string {
    return `${label} — ${this.displayName()}`;
  }

  protected toggleMenu(menu: CardMenu): void {
    const trigger = this.activeTriggerEl();
    this.openMenu.update((open) => (open === menu ? null : menu));
    this.parkListOpen.set(false);
    this.moveListOpen.set(false);
    this.moveTabListOpen.set(false);
    if (this.openMenu() === null) {
      trigger?.focus();
    }
  }

  protected closeMenu(refocus = true): void {
    if (!this.menuOpen()) {
      return;
    }
    const trigger = this.activeTriggerEl();
    this.openMenu.set(null);
    this.parkListOpen.set(false);
    this.moveListOpen.set(false);
    this.moveTabListOpen.set(false);
    if (refocus) {
      trigger?.focus();
    }
  }

  /** Arrow / Home / End move within the open menu; Escape dismisses without opening the card. */
  protected onMenuKeydown(event: KeyboardEvent): void {
    handleMenuKeydown(event, this.activeMenuEl(), () => this.closeMenu());
  }

  /**
   * Click-outside dismissal. The menu is no longer inside `.card-actions` —
   * it lives in the overlay container — so containment is tested against
   * both, or every click on a menu item would read as a click outside.
   */
  protected onDocumentClick(event: MouseEvent): void {
    if (!this.menuOpen()) {
      return;
    }
    const target = event.target as Node;
    const actions = this.actionsEl()?.nativeElement;
    const menu = this.activeMenuEl();
    if (actions?.contains(target) || menu?.contains(target)) {
      return;
    }
    this.closeMenu(false);
  }

  protected onCloseClick(): void {
    this.closeMenu(false);
    this.showCloseConfirm.set(true);
  }

  /**
   * One notice identity per action per card (`ToastService.push`'s `key`):
   * a retry replaces its own notice instead of stacking a second, while two
   * cards failing the same way still each get to say so.
   */
  private noticeKey(action: string): string {
    return `${action}:${this.pane().host}:${this.pane().id}`;
  }

  private static reason(err: unknown): string {
    return err instanceof Error ? err.message : String(err);
  }

  protected async confirmClose(): Promise<void> {
    this.showCloseConfirm.set(false);
    const notice = this.toast.progress(this.noticeKey('close'), COPY.toast.working);
    try {
      await this.store.closePane(this.pane().host, this.pane().id);
      notice.resolve();
    } catch (err) {
      notice.fail(
        fill(COPY.toast.closeFailed, { name: this.displayName(), reason: Card.reason(err) })
      );
    }
  }

  /**
   * Closing the menu WITH refocus first is deliberate: the modal's focus
   * trap records whatever is focused when it mounts and restores it on
   * release, so handing it the overflow trigger is what returns focus there
   * on both save and cancel — no timer, no second focus call.
   */
  protected onRenameClick(): void {
    this.closeMenu();
    this.renameDraft.set(null);
    this.renameError.set(null);
    this.showRename.set(true);
  }

  /** Dismissing the dialog is the user discarding the draft — the next open starts from the stored name. */
  protected onRenameCancelled(): void {
    this.showRename.set(false);
    this.renameDraft.set(null);
    this.renameError.set(null);
  }

  /**
   * A failed rename must not eat what the user typed. The dialog closes
   * optimistically — the common case is success and a modal hanging around
   * while the wire round-trips reads as a hang — but a rejection reopens it
   * seeded with the attempted value and carrying the reason inline, so the
   * fix is an edit rather than a retype (docs/UX-GUIDELINES.md,
   * "Reliability states tell the truth").
   */
  protected async onRenameSaved(label: string | null): Promise<void> {
    this.showRename.set(false);
    this.renameError.set(null);
    const notice = this.toast.progress(this.noticeKey('rename'), COPY.toast.working);
    try {
      await this.store.renamePane(this.pane().host, this.pane().id, label);
      this.renameDraft.set(null);
      notice.resolve();
    } catch (err) {
      const message = fill(COPY.toast.renameFailed, { reason: Card.reason(err) });
      notice.fail(message);
      this.renameDraft.set(label ?? '');
      this.renameError.set(message);
      this.showRename.set(true);
    }
  }

  protected async doSplit(direction: SplitDirection): Promise<void> {
    this.closeMenu(false);
    const notice = this.toast.progress(this.noticeKey(`split-${direction}`), COPY.toast.working);
    try {
      await this.store.splitPane(this.pane().host, {
        target_pane_id: this.pane().id,
        direction,
      });
      notice.resolve();
    } catch (err) {
      notice.fail(fill(COPY.toast.splitFailed, { reason: Card.reason(err) }));
    }
  }
}
