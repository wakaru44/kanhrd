import { TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import {
  DEFAULT_TERMINAL_SCROLLBACK,
  HERDR_READ_LINE_CEILING,
  TERMINAL_SCROLLBACK_STEPS,
  TerminalScrollbackService,
  loadTerminalScrollback,
} from './terminal-scrollback.service';

const STORAGE_KEY = 'kanhrd.terminal-scrollback';

/** Minimal `getItem`-only storage, so the pure read is tested without touching real localStorage. */
function fakeStorage(value: string | null): Pick<Storage, 'getItem'> {
  return { getItem: (key: string) => (key === STORAGE_KEY ? value : null) };
}

describe('terminal scrollback depth', () => {
  describe('the steps', () => {
    it('end at herdr 0.8.2 measured ceiling, which is also the default', () => {
      // 1000 is measured (design.md), not a preference: herdr answers any
      // larger `lines` with exactly 1000.
      expect(HERDR_READ_LINE_CEILING).toBe(1000);
      expect([...TERMINAL_SCROLLBACK_STEPS]).toEqual([250, 500, 1000]);
      expect(Math.max(...TERMINAL_SCROLLBACK_STEPS)).toBe(HERDR_READ_LINE_CEILING);
      // 1000 as the default is affordable only because live updates are line
      // deltas (add-delta-pane-output).
      expect(DEFAULT_TERMINAL_SCROLLBACK).toBe(HERDR_READ_LINE_CEILING);
    });
  });

  describe('loadTerminalScrollback', () => {
    it('falls back to the default when nothing is stored', () => {
      expect(loadTerminalScrollback(fakeStorage(null))).toBe(DEFAULT_TERMINAL_SCROLLBACK);
      expect(loadTerminalScrollback(fakeStorage(''))).toBe(DEFAULT_TERMINAL_SCROLLBACK);
    });

    it('falls back to the default for anything off the steps, without throwing', () => {
      for (const bad of ['deep', 'NaN', 'Infinity', '80', '2000', '999', '-250', '250.5', '{}']) {
        expect(() => loadTerminalScrollback(fakeStorage(bad))).not.toThrow();
        expect(loadTerminalScrollback(fakeStorage(bad))).toBe(DEFAULT_TERMINAL_SCROLLBACK);
      }
    });

    it('round-trips every step', () => {
      for (const lines of TERMINAL_SCROLLBACK_STEPS) {
        expect(loadTerminalScrollback(fakeStorage(String(lines)))).toBe(lines);
      }
    });
  });

  describe('TerminalScrollbackService', () => {
    beforeEach(() => {
      localStorage.removeItem(STORAGE_KEY);
      TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    });

    afterEach(() => {
      localStorage.removeItem(STORAGE_KEY);
    });

    it('starts at the default with nothing stored', () => {
      expect(TestBed.inject(TerminalScrollbackService).lines()).toBe(DEFAULT_TERMINAL_SCROLLBACK);
    });

    it('seeds from storage, so the depth survives a reload', () => {
      localStorage.setItem(STORAGE_KEY, '500');
      expect(TestBed.inject(TerminalScrollbackService).lines()).toBe(500);
    });

    it('persists a chosen depth under a kanhrd. key, so clear-local-data sweeps it', () => {
      const service = TestBed.inject(TerminalScrollbackService);
      service.set(250);
      TestBed.tick();

      expect(service.lines()).toBe(250);
      expect(localStorage.getItem(STORAGE_KEY)).toBe('250');
      expect(STORAGE_KEY.startsWith('kanhrd.')).toBeTrue();
    });

    it('ignores a depth that is not a step, including one above the ceiling', () => {
      const service = TestBed.inject(TerminalScrollbackService);
      service.set(2000);
      service.set(80);
      expect(service.lines()).toBe(DEFAULT_TERMINAL_SCROLLBACK);
    });
  });
});
