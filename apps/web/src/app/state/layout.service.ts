import { Injectable, signal } from "@angular/core";

/**
 * TUI-presentation-only UI state (not shared/runtime state, per the
 * runtime/client boundary guardrail): whether the mobile nav-rail overlay
 * drawer is open. The board's `.rail` is `display:none` below 900px
 * (board.scss) with no toggle affordance; the header hamburger flips this
 * signal, and `Board`/`Rail` render an overlay drawer + backdrop off it.
 */
@Injectable({ providedIn: "root" })
export class LayoutService {
  readonly railOpen = signal(false);

  toggleRail(): void {
    this.railOpen.update((open) => !open);
  }

  closeRail(): void {
    this.railOpen.set(false);
  }
}
