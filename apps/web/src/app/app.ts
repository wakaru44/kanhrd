import { Component, DestroyRef, computed, inject } from '@angular/core';
import { RouterLink, RouterOutlet } from '@angular/router';
import { LucideMenu, LucideMoon, LucideSettings, LucideSun } from './shared/icons';
import { COPY } from './shared/copy';
import { ThemeService } from './state/theme.service';
import { LayoutService } from './state/layout.service';
import { KeyboardService } from './state/keyboard.service';
import { ToastService } from './state/toast.service';
import { HostNoticeService } from './state/host-notices.service';
import { KeyboardHelpOverlay } from './shared/keyboard-help-overlay';
import { ToastHost } from './shared/toast-host';

/** True for a bare key press: no modifier, so it is exactly what a TUI inside a card expects to receive. */
function isUnmodified(event: KeyboardEvent, key: string): boolean {
  return event.key === key && !event.ctrlKey && !event.metaKey && !event.altKey;
}

@Component({
  selector: 'app-root',
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
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  protected readonly themeService = inject(ThemeService);
  protected readonly layout = inject(LayoutService);
  protected readonly keyboard = inject(KeyboardService);
  private readonly toasts = inject(ToastService);
  /**
   * Injected for its constructor effect, not for an API: per-host connection
   * notices need to be watching from the moment the shell exists, and a root
   * service nobody injects is a root service that never runs.
   */
  private readonly penNotices = inject(HostNoticeService);

  protected readonly copy = COPY;

  /** App chrome that an Escape can legitimately dismiss. Escape is forwarded only while one of these is open — it is scoped to open chrome, never a global binding. */
  private readonly chromeOpen = computed(
    () =>
      this.keyboard.helpOpen() ||
      this.layout.railOpen() ||
      this.layout.plusMenuOpen() ||
      this.toasts.toasts().length > 0
  );

  protected themeLabel(): string {
    return this.themeService.theme() === 'dark' ? COPY.nav.toWashi : COPY.nav.toSumi;
  }

  protected toggleTheme(): void {
    this.themeService.toggle();
  }

  protected toggleRail(): void {
    this.layout.toggleRail();
  }

  constructor() {
    // Attached in the CAPTURE phase at `window` — not `@HostListener`,
    // which is bubble-phase-only — so the prefix and any bound action key
    // are seen before a page-level browser extension's own capture-phase
    // keydown listener (e.g. Vimium/Vimium C binding `Ctrl+B` to "scroll up
    // a page") can consume it first. Capture-phase dispatch across
    // different nodes always runs ancestor-to-descendant by DOM position
    // (`window` before `document`), independent of listener registration
    // order, so this wins regardless of extension load timing. See
    // openspec/changes/fix-keyboard-shortcut-suppression (or its archive)
    // for the full root-cause writeup and a deterministic karma repro.
    window.addEventListener('keydown', this.onKeydown, { capture: true });
    inject(DestroyRef).onDestroy(() => {
      window.removeEventListener('keydown', this.onKeydown, { capture: true });
    });
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
  private readonly onKeydown = (event: KeyboardEvent): void => {
    if (isUnmodified(event, '?')) {
      return;
    }
    if (isUnmodified(event, 'Escape') && !this.chromeOpen()) {
      return;
    }
    this.keyboard.handleKeydown(event, document.activeElement);
  };
}
