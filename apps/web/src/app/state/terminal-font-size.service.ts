import { Injectable, effect, signal } from "@angular/core";

/**
 * The sizes a terminal may be rendered at, in CSS pixels, smallest first.
 *
 * These are not new numbers: they are the pixel values of the brand type
 * ladder in docs/DESIGN-SYSTEM.md § Typography at the 16px root —
 * `--fs-caption` (12), `--fs-small` (13), `--fs-body` (15), `--fs-lead`
 * (17), `--fs-h3` (20). Reusing the ladder keeps the terminal inside the
 * same typographic system as the rest of the shell, and it bounds the
 * range at both ends for reasons the docs already state:
 *
 * - The floor is documented: "Nothing below `--fs-caption` may be
 *   introduced to make a dense layout fit."
 * - The ceiling is where the column count stops being a terminal. With
 *   JetBrains Mono's 0.600em advance, 20px leaves ~100 columns on a
 *   1280px desktop; the next rung up (`--fs-h2`, 26px) drops that to ~76,
 *   under the 80 columns most TUI output is authored against.
 *
 * The ladder is also already spaced for perception — tight at the bottom
 * (12 -> 13 is 8%), wide at the top (17 -> 20 is 18%) — which is exactly
 * what a size ramp wants. See openspec/changes/add-terminal-font-size.
 */
export const TERMINAL_FONT_SIZES: readonly number[] = [12, 13, 15, 17, 20];

/** `--fs-small`, and the size every terminal rendered at before this preference existed. */
export const DEFAULT_TERMINAL_FONT_SIZE = 13;

const STORAGE_KEY = "kanhrd.terminal-font-size";

const MIN_SIZE = TERMINAL_FONT_SIZES[0];
const MAX_SIZE = TERMINAL_FONT_SIZES[TERMINAL_FONT_SIZES.length - 1];

/**
 * The nearest ladder step to an in-range size, ties resolving downward.
 *
 * This is the size-shaped analogue of `LEGACY_NAMES` in
 * terminal-theme.service.ts: it exists so that a deliberate choice
 * survives a future change to the ladder rather than silently snapping
 * everyone back to the default.
 */
function nearestStep(size: number): number {
  let best = TERMINAL_FONT_SIZES[0];
  for (const step of TERMINAL_FONT_SIZES) {
    if (Math.abs(step - size) < Math.abs(best - size)) {
      best = step;
    }
  }
  return best;
}

/**
 * Pure read, unit-testable without DI — mirrors `loadTerminalThemeName`
 * in terminal-theme.service.ts. Never throws, for any stored string:
 * absent, unparseable and out-of-range values fall back to the default,
 * and an in-range off-ladder value snaps to the nearest step.
 */
export function loadTerminalFontSize(storage: Pick<Storage, "getItem"> = localStorage): number {
  const raw = storage.getItem(STORAGE_KEY);
  if (raw === null || raw.trim() === "") {
    return DEFAULT_TERMINAL_FONT_SIZE;
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < MIN_SIZE || parsed > MAX_SIZE) {
    return DEFAULT_TERMINAL_FONT_SIZE;
  }
  return nearestStep(parsed);
}

/**
 * Signals-based terminal font size, applied uniformly to every xterm.js
 * instance. Persists to `localStorage['kanhrd.terminal-font-size']`.
 *
 * App-wide, not per-pane — the same model docs/DESIGN-SYSTEM.md
 * § Terminal fixes for palettes, for the same reason (cards are told
 * apart by title, host seal and status, never by terminal appearance) plus
 * one specific to size: it is an accessibility preference, so an operator
 * who needs 17px needs it in every pane, not one at a time.
 *
 * A size change is not just a repaint — it changes cell geometry, so the
 * consuming terminal must refit. See `PaneDetail`'s font-size effect.
 */
@Injectable({ providedIn: "root" })
export class TerminalFontSizeService {
  readonly size = signal<number>(loadTerminalFontSize());

  constructor() {
    effect(() => {
      localStorage.setItem(STORAGE_KEY, String(this.size()));
    });
  }

  /** Ignores anything off the ladder — the control offers steps, so an off-ladder value is a bug, not a choice. */
  set(size: number): void {
    if (TERMINAL_FONT_SIZES.includes(size)) {
      this.size.set(size);
    }
  }
}
