import { TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { ThemeService } from './theme.service';
import {
  TERMINAL_THEME_OPTIONS,
  TerminalThemeService,
  XTERM_THEME_MONOKAI,
  XTERM_THEME_SUMI,
  XTERM_THEME_WASHI,
  loadTerminalThemeName,
} from './terminal-theme.service';

async function flushMicrotasks(): Promise<void> {
  for (let i = 0; i < 5; i++) {
    await Promise.resolve();
  }
}

/** Lets a root effect (created in an `@Injectable` constructor) flush. Mirrors theme.service.spec.ts's `settle()`. */
async function settle(): Promise<void> {
  await flushMicrotasks();
  await new Promise((resolve) => setTimeout(resolve, 0));
  await flushMicrotasks();
}

describe('loadTerminalThemeName', () => {
  it('defaults to auto when nothing stored', () => {
    const storage = { getItem: () => null };
    expect(loadTerminalThemeName(storage)).toBe('auto');
  });

  it('returns a stored valid theme name', () => {
    const storage = { getItem: () => 'monokai' };
    expect(loadTerminalThemeName(storage)).toBe('monokai');
  });

  it('falls back to auto for garbage storage content', () => {
    const storage = { getItem: () => 'not-a-real-theme' };
    expect(loadTerminalThemeName(storage)).toBe('auto');
  });

  it('migrates the pre-redesign palette names to washi/sumi', () => {
    expect(loadTerminalThemeName({ getItem: () => 'standard-light' })).toBe('washi');
    expect(loadTerminalThemeName({ getItem: () => 'standard-dark' })).toBe('sumi');
  });
});

describe('TerminalThemeService', () => {
  let service: TerminalThemeService;
  let themeService: ThemeService;

  beforeEach(() => {
    localStorage.removeItem('kanhrd.terminal-theme');
    localStorage.removeItem('kanhrd.theme');
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    themeService = TestBed.inject(ThemeService);
    service = TestBed.inject(TerminalThemeService);
  });

  afterEach(() => {
    localStorage.removeItem('kanhrd.terminal-theme');
    localStorage.removeItem('kanhrd.theme');
    document.documentElement.removeAttribute('data-theme');
  });

  it("defaults to 'auto' and follows the SPA theme", () => {
    expect(service.name()).toBe('auto');

    themeService.set('dark');
    expect(service.theme()).toEqual(XTERM_THEME_SUMI);

    themeService.set('light');
    expect(service.theme()).toEqual(XTERM_THEME_WASHI);
  });

  it('offers washi and sumi as explicitly selectable palettes', () => {
    themeService.set('dark');
    service.set('washi');
    expect(service.theme()).toEqual(XTERM_THEME_WASHI);
    expect(service.theme().background).toBe('#f4ede0');
    expect(service.theme().foreground).toBe('#1a1815');

    themeService.set('light');
    service.set('sumi');
    expect(service.theme()).toEqual(XTERM_THEME_SUMI);
    expect(service.theme().background).toBe('#161311');
    expect(service.theme().foreground).toBe('#ece3d1');
  });

  it('lists washi and sumi in the settings options and drops the old standard names', () => {
    const values: string[] = TERMINAL_THEME_OPTIONS.map((option) => option.value);
    expect(values).toContain('washi');
    expect(values).toContain('sumi');
    expect(values).not.toContain('standard-light');
    expect(values).not.toContain('standard-dark');
  });

  it('an explicit theme overrides the SPA theme regardless of dark/light', () => {
    themeService.set('dark');
    service.set('monokai');
    expect(service.theme()).toEqual(XTERM_THEME_MONOKAI);

    themeService.set('light');
    expect(service.theme()).toEqual(XTERM_THEME_MONOKAI);
  });

  it('persists the chosen name to localStorage', async () => {
    service.set('solarized-dark');
    await settle();
    expect(loadTerminalThemeName()).toBe('solarized-dark');
  });

  it('emits a new theme value to computed subscribers when the name changes', () => {
    const seen: string[] = [];
    // computed() signals re-derive lazily; read after each change to observe the new value.
    service.set('catppuccin-mocha');
    seen.push(JSON.stringify(service.theme()));
    service.set('solarized-light');
    seen.push(JSON.stringify(service.theme()));
    expect(seen[0]).not.toEqual(seen[1]);
  });
});
