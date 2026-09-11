import { Injectable, signal } from '@angular/core';

/**
 * TUI-presentation-only UI state (not shared/runtime state, per the
 * runtime/client boundary guardrail): whether the mobile nav-rail overlay
 * drawer is open. The board's `.rail` is `display:none` below 900px
 * (board.scss) with no toggle affordance; the header hamburger flips this
 * signal, and `Board`/`Rail` render an overlay drawer + backdrop off it.
 */
@Injectable({ providedIn: 'root' })
export class LayoutService {
  readonly railOpen = signal(false);
  /** Board's header `+` menu open state — lives here (not on `Board`) so `KeyboardService`'s `Escape` handling can close it without a component reference. */
  readonly plusMenuOpen = signal(false);
  /**
   * The header theme panel's open state — here, not on `ThemePanel`, for the
   * same reason `plusMenuOpen` is: `KeyboardService`'s Escape ladder closes
   * it, and `App.chromeOpen` has to know it is open to let an unmodified
   * Escape through at all. Neither has a component reference.
   */
  readonly themePanelOpen = signal(false);

  toggleRail(): void {
    this.railOpen.update((open) => !open);
  }

  openRail(): void {
    this.railOpen.set(true);
  }

  closeRail(): void {
    this.railOpen.set(false);
  }

  togglePlusMenu(): void {
    this.plusMenuOpen.update((open) => !open);
  }

  closePlusMenu(): void {
    this.plusMenuOpen.set(false);
  }

  toggleThemePanel(): void {
    this.themePanelOpen.update((open) => !open);
  }

  closeThemePanel(): void {
    this.themePanelOpen.set(false);
  }
}
