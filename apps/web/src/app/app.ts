import { Component, HostListener, computed, inject } from "@angular/core";
import { RouterLink, RouterOutlet } from "@angular/router";
import { LucideMenu, LucideMoon, LucideSettings, LucideSun } from "./shared/icons";
import { COPY } from "./shared/copy";
import { ThemeService } from "./state/theme.service";
import { LayoutService } from "./state/layout.service";
import { KeyboardService } from "./state/keyboard.service";
import { ToastService } from "./state/toast.service";
import { KeyboardHelpOverlay } from "./shared/keyboard-help-overlay";
import { ToastHost } from "./shared/toast-host";

/**
 * Strings the shell needs that `shared/copy.ts` does not carry yet. This lane
 * may not edit `copy.ts`; lift these in as `nav.toWashi` / `nav.toSumi` and
 * delete the block. `kanhrd` itself is the wordmark, not copy — it stays in
 * the template.
 */
const PENDING_COPY = {
  toWashi: "switch to washi",
  toSumi: "switch to sumi",
} as const;

/** True for a bare key press: no modifier, so it is exactly what a TUI inside a card expects to receive. */
function isUnmodified(event: KeyboardEvent, key: string): boolean {
  return event.key === key && !event.ctrlKey && !event.metaKey && !event.altKey;
}

@Component({
  selector: "app-root",
  imports: [
    RouterOutlet,
    RouterLink,
    KeyboardHelpOverlay,
    ToastHost,
    LucideMenu,
    LucideSun,
    LucideMoon,
    LucideSettings,
  ],
  templateUrl: "./app.html",
  styleUrl: "./app.scss",
})
export class App {
  protected readonly themeService = inject(ThemeService);
  protected readonly layout = inject(LayoutService);
  protected readonly keyboard = inject(KeyboardService);
  private readonly toasts = inject(ToastService);

  protected readonly copy = COPY;
  protected readonly pending = PENDING_COPY;

  /** App chrome that an Escape can legitimately dismiss. Escape is forwarded only while one of these is open — it is scoped to open chrome, never a global binding. */
  private readonly chromeOpen = computed(
    () =>
      this.keyboard.helpOpen() ||
      this.layout.railOpen() ||
      this.layout.plusMenuOpen() ||
      this.toasts.toasts().length > 0,
  );

  protected themeLabel(): string {
    return this.themeService.theme() === "dark" ? this.pending.toWashi : this.pending.toSumi;
  }

  protected toggleTheme(): void {
    this.themeService.toggle();
  }

  protected toggleRail(): void {
    this.layout.toggleRail();
  }

  /**
   * The single global keydown entry point for herdr-style prefix shortcuts
   * (suppression, chording and dispatch all live in `KeyboardService`).
   *
   * Two keys never leave this method: an unmodified `?` and an unmodified
   * `Escape` with no app chrome open. The terminal owns its keys — binding
   * either globally would break vim, less, fzf and every other TUI a user
   * runs inside a card. Help is reached through the prefix chord and through
   * visible controls; Escape dismisses only chrome that is actually open.
   */
  @HostListener("window:keydown", ["$event"])
  protected onKeydown(event: KeyboardEvent): void {
    if (isUnmodified(event, "?")) {
      return;
    }
    if (isUnmodified(event, "Escape") && !this.chromeOpen()) {
      return;
    }
    this.keyboard.handleKeydown(event, document.activeElement);
  }
}
