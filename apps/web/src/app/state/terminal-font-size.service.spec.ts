import { TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import {
  DEFAULT_TERMINAL_FONT_SIZE,
  TERMINAL_FONT_SIZES,
  TerminalFontSizeService,
  loadTerminalFontSize,
} from './terminal-font-size.service';

const STORAGE_KEY = 'kanhrd.terminal-font-size';

/** Minimal `getItem`-only storage, so the pure read is tested without touching real localStorage. */
function fakeStorage(value: string | null): Pick<Storage, 'getItem'> {
  return { getItem: (key: string) => (key === STORAGE_KEY ? value : null) };
}

describe('terminal font size', () => {
  describe('the ladder', () => {
    it('is the brand type ladder in px, ascending, with 13 on it as the default', () => {
      // Expected values come from docs/DESIGN-SYSTEM.md § Typography at a
      // 16px root — --fs-caption/small/body/lead/h3 — not from the module.
      expect([...TERMINAL_FONT_SIZES]).toEqual([12, 13, 15, 17, 20]);
      expect(DEFAULT_TERMINAL_FONT_SIZE).toBe(13);
      expect(TERMINAL_FONT_SIZES).toContain(DEFAULT_TERMINAL_FONT_SIZE);
    });
  });

  describe('loadTerminalFontSize', () => {
    it('falls back to the default when nothing is stored', () => {
      expect(loadTerminalFontSize(fakeStorage(null))).toBe(DEFAULT_TERMINAL_FONT_SIZE);
      expect(loadTerminalFontSize(fakeStorage(''))).toBe(DEFAULT_TERMINAL_FONT_SIZE);
      expect(loadTerminalFontSize(fakeStorage('   '))).toBe(DEFAULT_TERMINAL_FONT_SIZE);
    });

    it('falls back to the default for corrupt values without throwing', () => {
      for (const corrupt of [
        'large',
        'NaN',
        'Infinity',
        '-Infinity',
        '{"size":17}',
        '13px',
        '1e',
      ]) {
        expect(() => loadTerminalFontSize(fakeStorage(corrupt))).not.toThrow();
        expect(loadTerminalFontSize(fakeStorage(corrupt))).toBe(DEFAULT_TERMINAL_FONT_SIZE);
      }
    });

    it('falls back to the default for out-of-range values', () => {
      for (const out of ['0', '-13', '11', '11.9', '21', '999']) {
        expect(loadTerminalFontSize(fakeStorage(out))).toBe(DEFAULT_TERMINAL_FONT_SIZE);
      }
    });

    it('round-trips every ladder value', () => {
      for (const size of TERMINAL_FONT_SIZES) {
        expect(loadTerminalFontSize(fakeStorage(String(size)))).toBe(size);
      }
    });

    it('snaps an in-range off-ladder value to the nearest step', () => {
      expect(loadTerminalFontSize(fakeStorage('16'))).toBe(15);
      expect(loadTerminalFontSize(fakeStorage('18.5'))).toBe(17);
      expect(loadTerminalFontSize(fakeStorage('19'))).toBe(20);
      expect(loadTerminalFontSize(fakeStorage('12.4'))).toBe(12);
    });

    it('resolves a tie to the smaller step', () => {
      // 14 sits exactly between 13 and 15; 16 between 15 and 17.
      expect(loadTerminalFontSize(fakeStorage('14'))).toBe(13);
      expect(loadTerminalFontSize(fakeStorage('16'))).toBe(15);
    });
  });

  describe('TerminalFontSizeService', () => {
    beforeEach(() => {
      localStorage.removeItem(STORAGE_KEY);
      TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    });

    afterEach(() => {
      localStorage.removeItem(STORAGE_KEY);
    });

    it('starts at the default with nothing stored', () => {
      expect(TestBed.inject(TerminalFontSizeService).size()).toBe(DEFAULT_TERMINAL_FONT_SIZE);
    });

    it('seeds from storage', () => {
      localStorage.setItem(STORAGE_KEY, '17');
      expect(TestBed.inject(TerminalFontSizeService).size()).toBe(17);
    });

    it('persists a chosen size under a kanhrd. key, so clear-local-data sweeps it', () => {
      const service = TestBed.inject(TerminalFontSizeService);
      service.set(20);
      TestBed.tick();

      expect(service.size()).toBe(20);
      expect(localStorage.getItem(STORAGE_KEY)).toBe('20');
      // The prefix is the whole point: SettingsService.clearLocalData()
      // sweeps every `kanhrd.`-prefixed key and needs no change for this one.
      expect(STORAGE_KEY.startsWith('kanhrd.')).toBeTrue();
    });

    it('ignores a size that is not on the ladder', () => {
      const service = TestBed.inject(TerminalFontSizeService);
      service.set(42);
      service.set(11);
      service.set(16);
      expect(service.size()).toBe(DEFAULT_TERMINAL_FONT_SIZE);
    });
  });
});
