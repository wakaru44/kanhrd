import { Injectable, effect, signal } from '@angular/core';

export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'kanhrd.theme';

/** `true` only when the OS/browser actively asks for dark; absence of a signal reads as light. */
export function systemPrefersDark(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches;
}

/** Pure read, unit-testable without a real `ThemeService`/DOM — mirrors `loadFilters` in panes.store.ts. */
export function loadTheme(storage: Pick<Storage, 'getItem'> = localStorage): Theme | null {
  const raw = storage.getItem(STORAGE_KEY);
  return raw === 'light' || raw === 'dark' ? raw : null;
}

/**
 * Theme in effect at startup: a valid stored preference always wins, else
 * sumi (dark) when the OS prefers dark and washi (light) otherwise. Washi
 * is the reference theme (docs/DESIGN-SYSTEM.md), so no signal means light.
 */
export function resolveTheme(
  storage: Pick<Storage, 'getItem'> = localStorage,
  prefersDark: boolean = systemPrefersDark()
): Theme {
  return loadTheme(storage) ?? (prefersDark ? 'dark' : 'light');
}

/**
 * Signals-based dark/light theme. Persists to `localStorage['kanhrd.theme']`
 * and reflects the current theme as `data-theme` on `<html>` so plain CSS
 * custom properties (styles.scss) can branch on it — no framework theming
 * layer needed for a two-value toggle. Falls back to
 * `prefers-color-scheme` when no stored preference exists yet.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  readonly theme = signal<Theme>(resolveTheme());

  constructor() {
    effect(() => {
      const theme = this.theme();
      document.documentElement.setAttribute('data-theme', theme);
      localStorage.setItem(STORAGE_KEY, theme);
    });
  }

  toggle(): void {
    this.theme.update((current) => (current === 'dark' ? 'light' : 'dark'));
  }

  set(theme: Theme): void {
    this.theme.set(theme);
  }
}
