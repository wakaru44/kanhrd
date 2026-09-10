import {
  Component,
  ElementRef,
  computed,
  effect,
  inject,
  input,
  signal,
  viewChild,
} from "@angular/core";
import { RouterLink } from "@angular/router";
import type { BridgeCapabilities, Pane, SplitDirection } from "@kanhrd/schema";
import { PanesStore } from "../state/panes.store";
import { ConfirmModal } from "../shared/confirm-modal";
import { RenameModal } from "../shared/rename-modal";
import { ClockTick, formatElapsed } from "../util/clock";
import { paneSecondaryIdentity, paneTitle } from "../util/pane-title";
import { pathTail } from "../util/path-tail";
import { ToastService } from "../state/toast.service";
import { COPY, fill } from "../shared/copy";
import {
  LucideArrowDown,
  LucideArrowRight,
  LucideMoreHorizontal,
  LucidePencil,
  LucideX,
} from "../shared/icons";

/**
 * PENDING COPY — `docs/BRAND.md`'s approved-copy table has no `card.*`
 * action keys, and `shared/copy.ts` is another lane's file, so the three
 * per-card action labels live here instead of being inlined in the
 * template. They follow the brand voice (lowercase, no exclamation, the
 * care verb `rest` for a lifecycle end) and must move into `copy.ts` as
 * `card.splitRight` / `card.splitDown` / `card.close` the moment the
 * approved-copy table gains those rows. Nothing else in this component
 * carries a user-facing literal.
 */
export const CARD_COPY = {
  splitRight: "split right",
  splitDown: "split down",
  /** `confirm.closePaneAction` is the sanctioned verb for ending a session. */
  close: COPY.confirm.closePaneAction,
  moreActions: "more actions",
  /** Approved copy — lives in `copy.ts`, unlike the three pending keys above. */
  rename: COPY.card.renameAction,
} as const;

@Component({
  selector: "app-card",
  imports: [
    RouterLink,
    ConfirmModal,
    RenameModal,
    LucideArrowRight,
    LucideArrowDown,
    LucideX,
    LucideMoreHorizontal,
    LucidePencil,
  ],
  templateUrl: "./card.html",
  styleUrl: "./card.scss",
  host: {
    "[class.compact]": "compact()",
    "(document:click)": "onDocumentClick($event)",
  },
})
export class Card {
  private readonly store = inject(PanesStore);
  private readonly clock = inject(ClockTick);
  private readonly toast = inject(ToastService);

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
    () => COPY.status[this.pane().agent_status] ?? COPY.status.unknown,
  );

  /** Whether this pane's host bridge supports the tier-2 terminal detail view. */
  protected readonly terminalAvailable = computed(
    () => this.capabilities().get(this.pane().host)?.terminal === true,
  );

  /** Tier-3: whether `pane.close` will succeed on this pane's host. */
  protected readonly paneCloseAvailable = computed(
    () => this.capabilities().get(this.pane().host)?.paneClose === true,
  );
  /** Tier-3: whether `pane.split` will succeed on this pane's host. */
  protected readonly paneSplitAvailable = computed(
    () => this.capabilities().get(this.pane().host)?.paneCreate === true,
  );
  /** Whether `pane.rename` will succeed on this pane's host — its own flag, not part of the tier-3 bundle. */
  protected readonly paneRenameAvailable = computed(
    () => this.capabilities().get(this.pane().host)?.paneRename === true,
  );

  protected readonly hasActions = computed(
    () => this.paneSplitAvailable() || this.paneCloseAvailable() || this.paneRenameAvailable(),
  );

  protected readonly showCloseConfirm = signal(false);
  protected readonly showRename = signal(false);
  protected readonly menuOpen = signal(false);

  private readonly menuEl = viewChild<ElementRef<HTMLElement>>("menu");
  private readonly menuTrigger = viewChild<ElementRef<HTMLButtonElement>>("menuTrigger");
  private readonly actionsEl = viewChild<ElementRef<HTMLElement>>("actions");

  // --- meta row ----------------------------------------------------------
  // Only data already on the `Pane` surface: the pane's own `agent_status`
  // plus how long it's held that status. herdr/the bridge send no timestamp,
  // so "since when" is observed client time — when this client last saw the
  // status change — never presented as a server-authoritative duration. The
  // optional line count reads `last_output_snippet` if a bridge populated it;
  // no card ever fetches terminal output for decoration.

  private readonly statusSince = signal(Date.now());
  private lastObservedStatus: Pane["agent_status"] | null = null;

  protected readonly elapsed = computed(() => formatElapsed(this.clock.now() - this.statusSince()));

  protected readonly lineCount = computed(() => {
    const snippet = this.pane().last_output_snippet;
    return snippet ? snippet.split("\n").length : null;
  });

  constructor() {
    effect(() => {
      const status = this.pane().agent_status;
      if (this.lastObservedStatus !== null && this.lastObservedStatus !== status) {
        this.statusSince.set(Date.now());
      }
      this.lastObservedStatus = status;
    });

    // Opening the overflow menu moves focus into it (keyboard-first: the menu
    // is navigable with arrows and returns focus to its trigger on Escape).
    effect(() => {
      const menu = this.menuEl()?.nativeElement;
      if (this.menuOpen() && menu) {
        this.menuItems(menu)[0]?.focus();
      }
    });
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
    if (event.key === "Escape") {
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
    if (event.key === "ArrowDown") {
      next = (current + 1) % items.length;
    } else if (event.key === "ArrowUp") {
      next = (current <= 0 ? items.length : current) - 1;
    } else if (event.key === "Home") {
      next = 0;
    } else if (event.key === "End") {
      next = items.length - 1;
    }
    if (next !== null) {
      event.preventDefault();
      items[next].focus();
    }
  }

  protected onDocumentClick(event: MouseEvent): void {
    const actions = this.actionsEl()?.nativeElement;
    if (this.menuOpen() && actions && !actions.contains(event.target as Node)) {
      this.closeMenu(false);
    }
  }

  protected onCloseClick(): void {
    this.closeMenu(false);
    this.showCloseConfirm.set(true);
  }

  protected async confirmClose(): Promise<void> {
    this.showCloseConfirm.set(false);
    try {
      await this.store.closePane(this.pane().host, this.pane().id);
    } catch (err) {
      this.toast.push({
        level: "error",
        message: fill(COPY.toast.closeFailed, {
          name: this.displayName(),
          reason: err instanceof Error ? err.message : String(err),
        }),
      });
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
    this.showRename.set(true);
  }

  protected async onRenameSaved(label: string | null): Promise<void> {
    this.showRename.set(false);
    try {
      await this.store.renamePane(this.pane().host, this.pane().id, label);
    } catch (err) {
      this.toast.push({
        level: "error",
        message: fill(COPY.toast.renameFailed, {
          reason: err instanceof Error ? err.message : String(err),
        }),
      });
    }
  }

  protected async doSplit(direction: SplitDirection): Promise<void> {
    this.closeMenu(false);
    try {
      await this.store.splitPane(this.pane().host, {
        target_pane_id: this.pane().id,
        direction,
      });
    } catch (err) {
      this.toast.push({
        level: "error",
        message: fill(COPY.toast.splitFailed, {
          reason: err instanceof Error ? err.message : String(err),
        }),
      });
    }
  }
}
