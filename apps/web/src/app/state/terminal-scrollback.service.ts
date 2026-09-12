import { Injectable, effect, signal } from '@angular/core';

/**
 * The most lines herdr serves from one `pane.read`, however many are asked
 * for. Measured, not assumed: herdr **0.8.2** answers `lines: 2000`,
 * `20000` and `100000` with exactly 1000 lines on a pane holding ~12k lines
 * of history. See openspec/changes/add-terminal-scrollback-depth/design.md.
 *
 * Tied to that herdr version. A herdr that lifts the cap leaves kanhrd
 * pinned here until this is re-measured — the Settings control and its note
 * both read this constant, so one edit moves them together.
 */
export const HERDR_READ_LINE_CEILING = 1000;

/**
 * The depths a terminal may request, in lines, shallowest first. The last
 * step is herdr's ceiling: no step promises depth herdr will not send.
 */
export const TERMINAL_SCROLLBACK_STEPS: readonly number[] = [250, 500, HERDR_READ_LINE_CEILING];

/**
 * The ceiling. Live updates arrive as line deltas, so depth no longer
 * multiplies the payload: 1000 lines as deltas measured 2.1-3.1 KB/s on a
 * busy pane, less than 250 lines as full snapshots (14.8-29.2 KB/s). See
 * openspec/changes/add-delta-pane-output/design.md.
 */
export const DEFAULT_TERMINAL_SCROLLBACK = HERDR_READ_LINE_CEILING;

const STORAGE_KEY = 'kanhrd.terminal-scrollback';

/**
 * Pure read, unit-testable without DI — mirrors `loadTerminalFontSize`.
 * Never throws: anything that is not exactly one of the steps falls back to
 * the default, so a stale value can never request more than herdr serves.
 */
export function loadTerminalScrollback(storage: Pick<Storage, 'getItem'> = localStorage): number {
  const raw = storage.getItem(STORAGE_KEY);
  if (raw === null || raw.trim() === '') {
    return DEFAULT_TERMINAL_SCROLLBACK;
  }
  const parsed = Number(raw);
  return TERMINAL_SCROLLBACK_STEPS.includes(parsed) ? parsed : DEFAULT_TERMINAL_SCROLLBACK;
}

/**
 * The scrollback depth every terminal asks herdr for, as `lines` on both
 * `pane.read` and `pane.subscribe_output`. Persists to
 * `localStorage['kanhrd.terminal-scrollback']`.
 *
 * App-wide, like the terminal's palette and text size. A change re-reads the
 * open pane — see `PaneDetail`'s scrollback effect.
 */
@Injectable({ providedIn: 'root' })
export class TerminalScrollbackService {
  readonly lines = signal<number>(loadTerminalScrollback());

  constructor() {
    effect(() => {
      localStorage.setItem(STORAGE_KEY, String(this.lines()));
    });
  }

  /** Ignores anything off the steps — the control offers steps, so an off-step value is a bug, not a choice. */
  set(lines: number): void {
    if (TERMINAL_SCROLLBACK_STEPS.includes(lines)) {
      this.lines.set(lines);
    }
  }
}
