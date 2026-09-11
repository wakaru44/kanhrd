import { Component, inject, input } from '@angular/core';
import {
  TERMINAL_THEME_OPTIONS,
  TerminalThemeService,
  type TerminalThemeName,
} from '../state/terminal-theme.service';

let nextId = 0;

/**
 * The shared terminal-palette choice: one control with two homes, the header
 * theme panel and the `/settings` terminal section. Both read the same
 * `TERMINAL_THEME_OPTIONS` list, so neither can offer a palette the other
 * does not.
 *
 * A native `<select>` rather than a custom listbox — seven options, a
 * platform keyboard contract kanhrd does not have to re-implement, and a
 * touch target the OS already sizes.
 */
@Component({
  selector: 'app-terminal-theme-choice',
  templateUrl: './terminal-theme-choice.html',
  styleUrl: './terminal-theme-choice.scss',
})
export class TerminalThemeChoice {
  protected readonly service = inject(TerminalThemeService);

  /** The row label — `colour theme` inside Settings' terminal section, `terminal` in the panel where the row's surface is the distinction. */
  readonly label = input.required<string>();

  /**
   * The `<select>`'s own id, so `<label for>` binds to it. Settings pins it
   * to `terminal-theme`, the handle its spec and the e2e suite already
   * address the control by; anything else falls back to a unique one.
   */
  readonly selectId = input(`terminal-theme-choice-${nextId++}`);

  protected readonly options = TERMINAL_THEME_OPTIONS;

  protected onChange(value: string): void {
    this.service.set(value as TerminalThemeName);
  }
}
