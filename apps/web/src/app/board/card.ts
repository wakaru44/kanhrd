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
import type { BridgeCapabilities, Pane, SplitDirection } from '@kanhrd/schema';
import { PanesStore } from '../state/panes.store';
import { ConfirmModal } from '../shared/confirm-modal';
import { RenameModal } from '../shared/rename-modal';
import { ClockTick, formatElapsed } from '../util/clock';
import { paneSecondaryIdentity, paneTitle } from '../util/pane-title';
import { pathTail } from '../util/path-tail';
import { ToastService } from '../state/toast.service';
import { BoardReturnService } from '../state/board-return.service';
import { COPY, fill } from '../shared/copy';
import {
  LucideArrowDown,
  LucideArrowRight,
  LucideMoreHorizontal,
  LucidePencil,
  LucideX,
} from '../shared/icons';

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
  splitRight: COPY.card.splitRight,
  splitDown: COPY.card.splitDown,
  close: COPY.confirm.closePaneAction,
  moreActions: COPY.nav.moreActions,
  rename: COPY.card.renameAction,
} as const;

/** Ids for `aria-controls`, unique per card instance for the life of the page. */
let nextMenuId = 0;

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

  protected readonly hasActions = computed(
    () => this.paneSplitAvailable() || this.paneCloseAvailable() || this.paneRenameAvailable()
  );

  protected readonly showCloseConfirm = signal(false);
  /** The value a failed rename kept, so reopening the dialog seeds it instead of the stored name. */
  protected readonly renameDraft = signal<string | null>(null);
  /** Inline reason on the rename dialog after a rejection; cleared on the next attempt. */
  protected readonly renameError = signal<string | null>(null);
  protected readonly showRename = signal(false);
  protected readonly menuOpen = signal(false);
  /**
   * The menu is portalled into the CDK overlay container, so it is no longer
   * a DOM descendant of its trigger's parent. `aria-controls` is what still
   * ties the two together for a screen reader — and it needs an id that is
   * unique across every card on the board.
   */
  protected readonly menuId = `card-menu-${nextMenuId++}`;

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
  private readonly menuTrigger = viewChild<ElementRef<HTMLButtonElement>>('menuTrigger');
  private readonly actionsEl = viewChild<ElementRef<HTMLElement>>('actions');

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
      const menu = this.menuEl()?.nativeElement;
      if (this.menuOpen() && menu) {
        this.menuItems(menu)[0]?.focus({ preventScroll: true });
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

  private menuItems(root: HTMLElement): HTMLButtonElement[] {
    return Array.from(root.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'));
  }

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

  /** Arrow / Home / End move within the menu; Escape dismisses without opening the card. */
  protected onMenuKeydown(event: KeyboardEvent): void {
    const menu = this.menuEl()?.nativeElement;
    if (!menu) {
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      this.closeMenu();
      return;
    }
    const items = this.menuItems(menu);
    if (items.length === 0) {
      return;
    }
    const current = items.indexOf(document.activeElement as HTMLButtonElement);
    let next: number | null = null;
    if (event.key === 'ArrowDown') {
      next = (current + 1) % items.length;
    } else if (event.key === 'ArrowUp') {
      next = (current <= 0 ? items.length : current) - 1;
    } else if (event.key === 'Home') {
      next = 0;
    } else if (event.key === 'End') {
      next = items.length - 1;
    }
    if (next !== null) {
      event.preventDefault();
      items[next].focus();
    }
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
    const menu = this.menuEl()?.nativeElement;
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
