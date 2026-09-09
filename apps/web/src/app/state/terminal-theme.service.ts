import { Injectable, computed, effect, inject, signal } from "@angular/core";
import type { ITheme } from "@xterm/xterm";
import { ThemeService } from "./theme.service";

/**
 * Built-in xterm.js color palettes. Every terminal in the app renders with
 * the SAME theme (per Juan: users tell panes apart by title/host chip/labels,
 * not terminal color) — this service is the single place that decides which
 * one that is.
 */
export type TerminalThemeName =
  | "auto"
  | "standard-dark"
  | "standard-light"
  | "catppuccin-mocha"
  | "monokai"
  | "solarized-dark"
  | "solarized-light";

const STORAGE_KEY = "kanhrd.terminal-theme";

/** Mirrors `[data-theme="dark"]` in styles.scss — xterm.js takes its own theme object, it doesn't read CSS custom properties. */
export const XTERM_THEME_DARK: ITheme = {
  background: "#14161c",
  foreground: "#e6e8ee",
  cursor: "#e6e8ee",
  selectionBackground: "#3c4252",
  black: "#14161c",
  brightBlack: "#5a6072",
};

/** Mirrors `[data-theme="light"]` in styles.scss. */
export const XTERM_THEME_LIGHT: ITheme = {
  background: "#f4f5f7",
  foreground: "#1b1e26",
  cursor: "#1b1e26",
  selectionBackground: "#d7dae1",
  black: "#f4f5f7",
  brightBlack: "#8b91a1",
};

/** Catppuccin Mocha — https://github.com/catppuccin/catppuccin, standard 16-color mapping. */
export const XTERM_THEME_CATPPUCCIN_MOCHA: ITheme = {
  background: "#1e1e2e",
  foreground: "#cdd6f4",
  cursor: "#f5e0dc",
  selectionBackground: "#585b70",
  black: "#45475a",
  red: "#f38ba8",
  green: "#a6e3a1",
  yellow: "#f9e2af",
  blue: "#89b4fa",
  magenta: "#f5c2e7",
  cyan: "#94e2d5",
  white: "#bac2de",
  brightBlack: "#585b70",
  brightRed: "#f38ba8",
  brightGreen: "#a6e3a1",
  brightYellow: "#f9e2af",
  brightBlue: "#89b4fa",
  brightMagenta: "#f5c2e7",
  brightCyan: "#94e2d5",
  brightWhite: "#a6adc8",
};

/** Monokai — the classic Sublime Text default scheme's standard xterm 16-color mapping. */
export const XTERM_THEME_MONOKAI: ITheme = {
  background: "#272822",
  foreground: "#f8f8f2",
  cursor: "#f8f8f0",
  selectionBackground: "#49483e",
  black: "#272822",
  red: "#f92672",
  green: "#a6e22e",
  yellow: "#f4bf75",
  blue: "#66d9ef",
  magenta: "#ae81ff",
  cyan: "#a1efe4",
  white: "#f8f8f2",
  brightBlack: "#75715e",
  brightRed: "#f92672",
  brightGreen: "#a6e22e",
  brightYellow: "#f4bf75",
  brightBlue: "#66d9ef",
  brightMagenta: "#ae81ff",
  brightCyan: "#a1efe4",
  brightWhite: "#f9f8f5",
};

/** Solarized Dark — https://ethanschoonover.com/solarized/, standard 16-color xterm mapping. */
export const XTERM_THEME_SOLARIZED_DARK: ITheme = {
  background: "#002b36",
  foreground: "#839496",
  cursor: "#839496",
  selectionBackground: "#073642",
  black: "#073642",
  red: "#dc322f",
  green: "#859900",
  yellow: "#b58900",
  blue: "#268bd2",
  magenta: "#d33682",
  cyan: "#2aa198",
  white: "#eee8d5",
  brightBlack: "#002b36",
  brightRed: "#cb4b16",
  brightGreen: "#586e75",
  brightYellow: "#657b83",
  brightBlue: "#839496",
  brightMagenta: "#6c71c4",
  brightCyan: "#93a1a1",
  brightWhite: "#fdf6e3",
};

/** Solarized Light — same 16 ANSI colors as Solarized Dark; only background/foreground/cursor flip. */
export const XTERM_THEME_SOLARIZED_LIGHT: ITheme = {
  ...XTERM_THEME_SOLARIZED_DARK,
  background: "#fdf6e3",
  foreground: "#657b83",
  cursor: "#657b83",
  selectionBackground: "#eee8d5",
};

const PALETTES: Record<Exclude<TerminalThemeName, "auto">, ITheme> = {
  "standard-dark": XTERM_THEME_DARK,
  "standard-light": XTERM_THEME_LIGHT,
  "catppuccin-mocha": XTERM_THEME_CATPPUCCIN_MOCHA,
  monokai: XTERM_THEME_MONOKAI,
  "solarized-dark": XTERM_THEME_SOLARIZED_DARK,
  "solarized-light": XTERM_THEME_SOLARIZED_LIGHT,
};

export const TERMINAL_THEME_OPTIONS: readonly { value: TerminalThemeName; label: string }[] = [
  { value: "auto", label: "Auto (follows app theme)" },
  { value: "standard-dark", label: "Standard Dark" },
  { value: "standard-light", label: "Standard Light" },
  { value: "catppuccin-mocha", label: "Catppuccin Mocha" },
  { value: "monokai", label: "Monokai" },
  { value: "solarized-dark", label: "Solarized Dark" },
  { value: "solarized-light", label: "Solarized Light" },
];

function isTerminalThemeName(value: string | null): value is TerminalThemeName {
  return value === "auto" || value !== null && value in PALETTES;
}

/** Pure read, unit-testable without DI — mirrors `loadTheme` in theme.service.ts. */
export function loadTerminalThemeName(storage: Pick<Storage, "getItem"> = localStorage): TerminalThemeName {
  const raw = storage.getItem(STORAGE_KEY);
  return isTerminalThemeName(raw) ? raw : "auto";
}

/**
 * Signals-based terminal color theme, applied uniformly to every xterm.js
 * instance. Persists to `localStorage['kanhrd.terminal-theme']`. `"auto"`
 * (the default) follows `ThemeService`'s dark/light SPA theme; any other
 * value pins a specific palette regardless of the SPA theme.
 */
@Injectable({ providedIn: "root" })
export class TerminalThemeService {
  private readonly appTheme = inject(ThemeService);

  readonly name = signal<TerminalThemeName>(loadTerminalThemeName());

  readonly theme = computed<ITheme>(() => {
    const name = this.name();
    if (name === "auto") {
      return this.appTheme.theme() === "light" ? XTERM_THEME_LIGHT : XTERM_THEME_DARK;
    }
    return PALETTES[name];
  });

  constructor() {
    effect(() => {
      localStorage.setItem(STORAGE_KEY, this.name());
    });
  }

  set(name: TerminalThemeName): void {
    this.name.set(name);
  }
}
