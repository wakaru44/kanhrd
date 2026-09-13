import { Injectable, effect, signal } from '@angular/core';

const STORAGE_KEY = 'kanhrd.terminal-key-bar';

/**
 * Pure read, unit-testable without DI — mirrors `loadTerminalFontSize`.
 * `'expanded'` and `'collapsed'` are the only stored values; anything else,
 * including nothing, falls back to the first-visit guess. Never throws.
 *
 * The guess is `(any-pointer: coarse)`: expanded where a finger is likely,
 * collapsed otherwise. It is only a starting position — `pointer` media
 * features misreport on iOS Safari, some Android phones, ChromeOS and
 * Windows (mdn/browser-compat-data#24451) — and the strip itself is the
 * control that corrects it.
 */
export function loadTerminalKeyBarExpanded(
  storage: Pick<Storage, 'getItem'> = localStorage,
  coarsePointer: () => boolean = () =>
    typeof matchMedia === 'function' && matchMedia('(any-pointer: coarse)').matches
): boolean {
  const raw = storage.getItem(STORAGE_KEY);
  if (raw === 'expanded') return true;
  if (raw === 'collapsed') return false;
  return coarsePointer();
}

/**
 * Whether the pane-detail key bar shows its row of keys or only its strip.
 * App-wide and per browser, beside the terminal's text size and scrollback;
 * persists to `localStorage['kanhrd.terminal-key-bar']`, which the
 * `kanhrd.`-prefix sweep in `SettingsService.clearLocalData` already covers.
 *
 * Nothing is written until the operator toggles, so a first visit keeps
 * re-guessing from the pointer until they choose.
 */
@Injectable({ providedIn: 'root' })
export class TerminalKeyBarService {
  readonly expanded = signal<boolean>(loadTerminalKeyBarExpanded());
  private chosen = false;

  constructor() {
    effect(() => {
      const expanded = this.expanded();
      if (this.chosen) {
        localStorage.setItem(STORAGE_KEY, expanded ? 'expanded' : 'collapsed');
      }
    });
  }

  toggle(): void {
    this.chosen = true;
    this.expanded.set(!this.expanded());
  }
}
