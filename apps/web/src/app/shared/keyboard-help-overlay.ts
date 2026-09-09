import { Component, computed, inject, input, output } from "@angular/core";
import {
  KeyboardService,
  formatBinding,
  type ShortcutBinding,
  type ShortcutCategory,
} from "../state/keyboard.service";

interface CategoryGroup {
  category: ShortcutCategory;
  bindings: ShortcutBinding[];
}

const CATEGORY_ORDER: readonly ShortcutCategory[] = ["Navigation", "Lifecycle", "View", "Help"];

/**
 * `?` (or `prefix+?`) help overlay listing every keyboard shortcut, grouped
 * by category. Plain conditionally-rendered component like `ConfirmModal` —
 * the parent (`App`) owns the `open` state via `KeyboardService.helpOpen`.
 */
@Component({
  selector: "app-keyboard-help-overlay",
  imports: [],
  templateUrl: "./keyboard-help-overlay.html",
  styleUrl: "./keyboard-help-overlay.scss",
})
export class KeyboardHelpOverlay {
  protected readonly keyboard = inject(KeyboardService);

  readonly open = input<boolean>(false);
  readonly closed = output<void>();

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

  protected keysLabel(binding: ShortcutBinding): string {
    return formatBinding(binding, this.keyboard.prefix());
  }

  protected onBackdropClick(): void {
    this.close();
  }

  protected close(): void {
    this.closed.emit();
  }
}
