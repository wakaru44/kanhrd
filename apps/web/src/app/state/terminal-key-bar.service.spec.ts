import { TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { TerminalKeyBarService, loadTerminalKeyBarExpanded } from './terminal-key-bar.service';

const STORAGE_KEY = 'kanhrd.terminal-key-bar';

function fakeStorage(value: string | null): Pick<Storage, 'getItem'> {
  return { getItem: (key: string) => (key === STORAGE_KEY ? value : null) };
}

describe('terminal key bar state', () => {
  describe('loadTerminalKeyBarExpanded', () => {
    it('honours a stored choice over the pointer guess', () => {
      expect(loadTerminalKeyBarExpanded(fakeStorage('expanded'), () => false)).toBeTrue();
      expect(loadTerminalKeyBarExpanded(fakeStorage('collapsed'), () => true)).toBeFalse();
    });

    it('guesses from a coarse pointer when nothing valid is stored', () => {
      for (const raw of [null, '', 'yes', '{"expanded":true}']) {
        expect(loadTerminalKeyBarExpanded(fakeStorage(raw), () => true)).toBeTrue();
        expect(loadTerminalKeyBarExpanded(fakeStorage(raw), () => false)).toBeFalse();
      }
    });
  });

  describe('TerminalKeyBarService', () => {
    beforeEach(() => {
      localStorage.removeItem(STORAGE_KEY);
      TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    });

    afterEach(() => localStorage.removeItem(STORAGE_KEY));

    it('writes nothing until the operator toggles', () => {
      TestBed.inject(TerminalKeyBarService);
      TestBed.tick();
      expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    });

    it('persists a toggle under a kanhrd. key, so clear-local-data sweeps it', () => {
      const service = TestBed.inject(TerminalKeyBarService);
      const before = service.expanded();
      service.toggle();
      TestBed.tick();
      expect(service.expanded()).toBe(!before);
      expect(localStorage.getItem(STORAGE_KEY)).toBe(before ? 'collapsed' : 'expanded');
      expect(STORAGE_KEY.startsWith('kanhrd.')).toBeTrue();
    });
  });
});
