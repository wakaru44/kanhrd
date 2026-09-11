import { Component, ElementRef, effect, inject, viewChild } from '@angular/core';
import { OverlayModule, type ConnectedPosition } from '@angular/cdk/overlay';
import { LucideMoon, LucideSun } from './icons';
import { COPY } from './copy';
import { ThemeChoice } from './theme-choice';
import { TerminalThemeChoice } from './terminal-theme-choice';
import { LayoutService } from '../state/layout.service';
import { ThemeService } from '../state/theme.service';

/**
 * The header's theme control.
 *
 * It no longer toggles: kanhrd has two themed surfaces — the board and the
 * terminal — and a single button could only ever reach one of them. The
 * button opens a panel with a row each, and the two choices are made there.
 * `prefix + t` stays the one-press path for the board theme.
 *
 * A popover, not a tooltip: it opens on activation, it is keyboard
 * operable, and it dismisses on Escape (`docs/UX-GUIDELINES.md` forbids
 * hover-only affordances).
 *
 * `role="dialog"` rather than `menu`, because the content is a radio group
 * and a `<select>` — not menu items. Both controls are the shared ones that
 * `/settings` renders, so the quick path and the full inventory cannot
 * disagree.
 *
 * Open state lives on `LayoutService`, beside the rail and the board's `+`
 * menu, so `KeyboardService.closeTopOverlay` can dismiss it in the existing
 * precedence order without a component reference and without registering a
 * global `Escape` binding.
 */
@Component({
  selector: 'app-theme-panel',
  imports: [OverlayModule, LucideSun, LucideMoon, ThemeChoice, TerminalThemeChoice],
  templateUrl: './theme-panel.html',
  styleUrl: './theme-panel.scss',
  host: {
    '(document:click)': 'onDocumentClick($event)',
  },
})
export class ThemePanel {
  protected readonly layout = inject(LayoutService);
  protected readonly themeService = inject(ThemeService);

  /**
   * The panel's own name and its terminal row reuse the words `/settings`
   * already owns — one home per string (see the `theme` group in copy.ts).
   */
  protected readonly text = {
    panel: COPY.settings.theme,
    board: COPY.theme.board,
    terminal: COPY.settings.terminal,
  };

  protected readonly panelId = 'theme-panel';

  /**
   * Below the trigger, right edges aligned, falling back to above it. With
   * `cdkConnectedOverlayPush` the CDK shifts a panel that would otherwise
   * cross the viewport edge back inside it, which is what keeps the left
   * edge >= 0 at phone width (docs/UX-GUIDELINES.md, board at 390px).
   */
  protected readonly positions: ConnectedPosition[] = [
    { originX: 'end', originY: 'bottom', overlayX: 'end', overlayY: 'top' },
    { originX: 'end', originY: 'top', overlayX: 'end', overlayY: 'bottom' },
  ];

  private readonly panelEl = viewChild<ElementRef<HTMLElement>>('panel');
  private readonly triggerEl = viewChild<ElementRef<HTMLButtonElement>>('trigger');

  /**
   * Whether the next close should hand focus back to the trigger. True for
   * every keyboard dismissal — including the one `KeyboardService` performs
   * through the Escape ladder, which is why this is a flag read by an
   * effect rather than an argument to a local `close()`. A pointer press
   * outside the panel clears it first: focus belongs wherever the user just
   * clicked, not back on a control they were leaving.
   */
  private refocusOnClose = true;
  private wasOpen = false;

  constructor() {
    effect(() => {
      const open = this.layout.themePanelOpen();
      const panel = this.panelEl()?.nativeElement;
      if (open && panel) {
        // Keyboard-first: opening lands on the board row's checked option,
        // so the first arrow press is already inside the control.
        const first = panel.querySelector<HTMLElement>(
          '[role="radio"][aria-checked="true"], [role="radio"], select'
        );
        first?.focus({ preventScroll: true });
      } else if (!open && this.wasOpen && this.refocusOnClose) {
        this.triggerEl()?.nativeElement.focus();
      }
      this.refocusOnClose = true;
      this.wasOpen = open;
    });
  }

  protected toggle(): void {
    this.layout.toggleThemePanel();
  }

  /** Escape inside the panel. The window-level handler sees it first while the panel counts as open chrome, so this is the fallback for the focus-inside case. */
  protected onKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Escape' || !this.layout.themePanelOpen()) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    this.layout.closeThemePanel();
  }

  /** Click-outside dismissal. The panel is portalled into the CDK overlay container, so containment is tested against both it and the trigger. */
  protected onDocumentClick(event: MouseEvent): void {
    if (!this.layout.themePanelOpen()) {
      return;
    }
    const target = event.target as Node;
    if (
      this.triggerEl()?.nativeElement.contains(target) ||
      this.panelEl()?.nativeElement.contains(target)
    ) {
      return;
    }
    this.refocusOnClose = false;
    this.layout.closeThemePanel();
  }
}
