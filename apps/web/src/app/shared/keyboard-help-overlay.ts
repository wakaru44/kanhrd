import {
  Component,
  ElementRef,
  OnDestroy,
  computed,
  effect,
  inject,
  input,
  output,
  viewChild,
} from "@angular/core";
import {
  KeyboardService,
  formatBinding,
  type ShortcutBinding,
  type ShortcutCategory,
} from "../state/keyboard.service";
import { LucideX } from "./icons";
import { COPY } from "./copy";
import { containDialogFocus } from "./confirm-modal";

interface CategoryGroup {
  category: ShortcutCategory;
  bindings: ShortcutBinding[];
}

const CATEGORY_ORDER: readonly ShortcutCategory[] = ["Navigation", "Lifecycle", "View", "Help"];

/**
 * Strings this overlay needs that `shared/copy.ts` does not carry yet. This
 * lane may not edit `copy.ts`; lift these into it under a `help.*` group and
 * delete this block.
 */
const PENDING_COPY = {
  close: "close",
  prefixNote: "prefix — press it, release, then the action key within 2 seconds.",
} as const;

/**
 * The keyboard-shortcut reference, grouped by category. A plain
 * conditionally-visible dialog like `ConfirmModal`; the parent (`App`) owns
 * the `open` state via `KeyboardService.helpOpen`.
 *
 * It is opened from the prefix chord (`prefix + ?`) and from visible
 * controls — never from a bare `?`, which belongs to whatever TUI is running
 * inside a card. While open it traps focus, marks the rest of the page
 * `inert`, and returns focus to whatever opened it.
 */
@Component({
  selector: "app-keyboard-help-overlay",
  imports: [LucideX],
  templateUrl: "./keyboard-help-overlay.html",
  styleUrl: "./keyboard-help-overlay.scss",
})
export class KeyboardHelpOverlay implements OnDestroy {
  protected readonly keyboard = inject(KeyboardService);
  protected readonly copy = COPY;
  protected readonly pending = PENDING_COPY;

  readonly open = input<boolean>(false);
  readonly closed = output<void>();

  private readonly dialog = viewChild<ElementRef<HTMLElement>>("dialog");
  private release: (() => void) | null = null;

  constructor() {
    effect(() => {
      const dialog = this.open() ? this.dialog()?.nativeElement : undefined;
      if (dialog && !this.release) {
        this.release = containDialogFocus(dialog);
      } else if (!dialog && this.release) {
        this.release();
        this.release = null;
      }
    });
  }

  ngOnDestroy(): void {
    this.release?.();
    this.release = null;
  }

  protected readonly groups = computed<CategoryGroup[]>(() => {
    const byCategory = new Map<ShortcutCategory, ShortcutBinding[]>();
    for (const binding of this.keyboard.shortcuts().values()) {
      const list = byCategory.get(binding.category) ?? [];
      list.push(binding);
      byCategory.set(binding.category, list);
    }
    return CATEGORY_ORDER.filter((category) => byCategory.has(category)).map((category) => ({
      category,
      bindings: byCategory.get(category) ?? [],
    }));
  });

  /**
   * `formatBinding` still advertises help as `? or <prefix> + ?`, because
   * `KeyboardService` still declares the bare `?`. `App` no longer forwards
   * an unmodified `?` (the terminal owns that key), so the honest label here
   * is the chord alone — help never promises a binding the app won't honour.
   */
  protected keysLabel(binding: ShortcutBinding): string {
    const prefix = this.keyboard.prefix();
    return binding.action === "help" ? `${prefix} + ?` : formatBinding(binding, prefix);
  }

  protected onBackdropClick(): void {
    this.close();
  }

  protected close(): void {
    this.closed.emit();
  }
}
