import { Injectable, effect, signal } from "@angular/core";

export type Theme = "light" | "dark";

const STORAGE_KEY = "kanhrd.theme";

function systemPrefersLight(): boolean {
  return typeof matchMedia === "function" && matchMedia("(prefers-color-scheme: light)").matches;
}

/** Pure read, unit-testable without a real `ThemeService`/DOM — mirrors `loadFilters` in panes.store.ts. */
export function loadTheme(storage: Pick<Storage, "getItem"> = localStorage): Theme | null {
  const raw = storage.getItem(STORAGE_KEY);
  return raw === "light" || raw === "dark" ? raw : null;
}

/**
 * Signals-based dark/light theme. Persists to `localStorage['kanhrd.theme']`
 * and reflects the current theme as `data-theme` on `<html>` so plain CSS
 * custom properties (styles.scss) can branch on it — no framework theming
 * layer needed for a two-value toggle. Falls back to
 * `prefers-color-scheme` when no stored preference exists yet.
 */
@Injectable({ providedIn: "root" })
export class ThemeService {
  readonly theme = signal<Theme>(loadTheme() ?? (systemPrefersLight() ? "light" : "dark"));

  constructor() {
    effect(() => {
      const theme = this.theme();
      document.documentElement.setAttribute("data-theme", theme);
      localStorage.setItem(STORAGE_KEY, theme);
    });
  }

  toggle(): void {
    this.theme.update((current) => (current === "dark" ? "light" : "dark"));
  }

  set(theme: Theme): void {
    this.theme.set(theme);
  }
}
