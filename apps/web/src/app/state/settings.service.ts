import { Injectable, effect, signal } from "@angular/core";

export type Density = "comfortable" | "compact";

/**
 * Which dimension the board bands cards by. `none` is today's board: one
 * implicit band, no band chrome. See `groupIntoSwimlanes` in panes.store.ts
 * for how each value derives a band key/label from a pane.
 */
export type SwimlaneDimension = "none" | "host" | "repository" | "checkout" | "tab";

const STORAGE_KEY = "kanhrd.settings";

export interface StoredSettings {
  density: Density;
  /**
   * Client-side "requested" output poll interval, in ms. Not wired to
   * anything real yet — the bridge doesn't accept a per-subscription
   * override today (`bridge.capabilities.outputPollIntervalMs` is
   * read-only/advertised, see panes.store.ts's `fallbackCapabilities`).
   * Kept here so the settings UI has somewhere to persist the value once
   * that lands; the Settings screen flags it "coming soon".
   */
  requestedOutputPollIntervalMs: number | null;
  /**
   * Board arrangement, not a herdr concept: which dimension the board
   * groups cards into swimlanes by. Deliberately NOT stamped onto
   * `documentElement` the way `density` is — density keys the token layer,
   * swimlanes are structure the board component owns.
   */
  swimlaneDimension: SwimlaneDimension;
}

export function defaultSettings(): StoredSettings {
  return { density: "comfortable", requestedOutputPollIntervalMs: null, swimlaneDimension: "none" };
}

/** Pure read, unit-testable without DI — mirrors `loadFilters` in panes.store.ts. */
export function loadSettings(storage: Pick<Storage, "getItem"> = localStorage): StoredSettings {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) {
      return defaultSettings();
    }
    const parsed = JSON.parse(raw) as Partial<StoredSettings>;
    return { ...defaultSettings(), ...parsed };
  } catch {
    return defaultSettings();
  }
}

export function saveSettings(
  settings: StoredSettings,
  storage: Pick<Storage, "setItem"> = localStorage,
): void {
  storage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

/** Every localStorage key kanhrd owns; used by the Settings "Data" section to clear all client-local state at once. */
const KANHRD_STORAGE_PREFIX = "kanhrd.";

/** Signals-based settings store: density + the (currently inert) runtime poll-interval request. Persists to `localStorage['kanhrd.settings']`. */
@Injectable({ providedIn: "root" })
export class SettingsService {
  readonly settings = signal<StoredSettings>(loadSettings());

  constructor() {
    effect(() => {
      const settings = this.settings();
      saveSettings(settings);
      document.documentElement.setAttribute("data-density", settings.density);
    });
  }

  setDensity(density: Density): void {
    this.settings.update((current) => ({ ...current, density }));
  }

  setSwimlaneDimension(dimension: SwimlaneDimension): void {
    this.settings.update((current) => ({ ...current, swimlaneDimension: dimension }));
  }

  setRequestedPollIntervalMs(ms: number | null): void {
    this.settings.update((current) => ({ ...current, requestedOutputPollIntervalMs: ms }));
  }

  /** Clears every `kanhrd.*` localStorage key: filters, theme, settings. Caller is responsible for reloading. */
  clearLocalData(storage: Pick<Storage, "key" | "removeItem" | "length"> = localStorage): void {
    const keys: string[] = [];
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (key?.startsWith(KANHRD_STORAGE_PREFIX)) {
        keys.push(key);
      }
    }
    for (const key of keys) {
      storage.removeItem(key);
    }
  }
}
