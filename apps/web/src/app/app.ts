import { Component, HostListener, inject } from '@angular/core';
import { RouterLink, RouterOutlet } from '@angular/router';
import { LucideMenu, LucideMoon, LucideSettings, LucideSun } from '@lucide/angular';
import { ThemeService } from './state/theme.service';
import { LayoutService } from './state/layout.service';
import { KeyboardService } from './state/keyboard.service';
import { KeyboardHelpOverlay } from './shared/keyboard-help-overlay';
import { ToastHost } from './shared/toast-host';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, KeyboardHelpOverlay, ToastHost, LucideMenu, LucideSun, LucideMoon, LucideSettings],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App {
  protected readonly themeService = inject(ThemeService);
  protected readonly layout = inject(LayoutService);
  protected readonly keyboard = inject(KeyboardService);

  protected toggleTheme(): void {
    this.themeService.toggle();
  }

  protected toggleRail(): void {
    this.layout.toggleRail();
  }

  /** Global entry point for herdr-style prefix shortcuts (see `KeyboardService`) — suppression, chording, and dispatch all live in the service so this stays a one-line wire-up. */
  @HostListener('window:keydown', ['$event'])
  protected onKeydown(event: KeyboardEvent): void {
    this.keyboard.handleKeydown(event, document.activeElement);
  }
}
