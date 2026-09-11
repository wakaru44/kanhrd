import { provideZonelessChangeDetection, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { BridgeCapabilities, HostSummary } from '@kanhrd/schema';
import { Settings } from './settings';
import { PanesStore } from '../state/panes.store';
import { SettingsService } from '../state/settings.service';
import { ThemeService } from '../state/theme.service';
import { TerminalThemeService } from '../state/terminal-theme.service';
import {
  DEFAULT_TERMINAL_FONT_SIZE,
  TERMINAL_FONT_SIZES,
  TerminalFontSizeService,
} from '../state/terminal-font-size.service';
import { COPY } from '../shared/copy';

const LONG_ERROR =
  'dial unix /run/user/1000/herdr.sock: connect: connection refused after 5 attempts over 30s — check that herdr is running on this host and that the socket path in kanhrd.config.yaml matches';

class FakePanesStore {
  readonly hostsSignal = signal<HostSummary[]>([
    { name: 'laptop', connected: true },
    { name: 'desktop', connected: false, last_error: LONG_ERROR },
  ]);
  readonly capabilitiesSignal = signal<ReadonlyMap<string, BridgeCapabilities>>(
    new Map([
      [
        'laptop',
        {
          tier: 2,
          terminal: true,
          paneResize: false,
          paneGraphics: false,
          outputPollIntervalMs: 150,
          paneCreate: false,
          paneClose: false,
          paneMove: false,
          paneRename: false,
          tabCrud: false,
          workspaceCrud: false,
        },
      ],
    ])
  );

  primaryHostKeybinds(): BridgeCapabilities['hostKeybinds'] | null {
    for (const caps of this.capabilitiesSignal().values()) {
      if (caps.hostKeybinds) return caps.hostKeybinds;
    }
    return null;
  }
}

describe('Settings', () => {
  let store: FakePanesStore;
  let fixture: ComponentFixture<Settings>;
  let settingsService: SettingsService;
  let themeService: ThemeService;
  let fontSizeService: TerminalFontSizeService;
  let terminalThemeService: TerminalThemeService;

  beforeEach(async () => {
    localStorage.removeItem('kanhrd.settings');
    localStorage.removeItem('kanhrd.theme');
    localStorage.removeItem('kanhrd.terminal-font-size');
    localStorage.removeItem('kanhrd.terminal-theme');
    store = new FakePanesStore();
    await TestBed.configureTestingModule({
      imports: [Settings],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        { provide: PanesStore, useValue: store },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(Settings);
    settingsService = TestBed.inject(SettingsService);
    themeService = TestBed.inject(ThemeService);
    fontSizeService = TestBed.inject(TerminalFontSizeService);
    terminalThemeService = TestBed.inject(TerminalThemeService);
    fixture.detectChanges();
  });

  afterEach(() => {
    localStorage.removeItem('kanhrd.settings');
    localStorage.removeItem('kanhrd.theme');
    localStorage.removeItem('kanhrd.terminal-font-size');
    localStorage.removeItem('kanhrd.terminal-theme');
  });

  function el(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  /** The `.settings-section` whose `h2` is `heading` — segments now appear in more than one. */
  function section(heading: string): HTMLElement {
    const found = Array.from(el().querySelectorAll<HTMLElement>('.settings-section')).find(
      (s) => s.querySelector('h2')?.textContent?.trim() === heading
    );
    expect(found).withContext(`no settings section titled "${heading}"`).toBeTruthy();
    return found!;
  }

  function fontSizeSegments(): HTMLButtonElement[] {
    return Array.from(section('terminal').querySelectorAll<HTMLButtonElement>('.segment'));
  }

  it('titles the screen and its back control from copy.ts', () => {
    expect(el().querySelector('h1')?.textContent).toContain(COPY.nav.settings);
    expect(el().querySelector('.back')?.textContent).toContain(COPY.nav.backToBoard);
  });

  it('puts the back control first in tab order with an icon, not an entity glyph', () => {
    const focusable = el().querySelector(
      'a[href], button, input, select, [tabindex]:not([tabindex="-1"])'
    );
    expect(focusable?.classList.contains('back')).toBeTrue();
    expect(focusable?.querySelector('svg')).toBeTruthy();
    expect(el().querySelector('.back')?.textContent?.includes('←')).toBeFalse();
  });

  it('renders the appearance section with a theme choice and density segments', () => {
    const sections = Array.from(el().querySelectorAll('.settings-section h2')).map(
      (h) => h.textContent
    );
    expect(sections).toContain('appearance');
    // Two controls, two options each: the shared washi/sumi radio group
    // (`app-theme-choice`, also rendered by the header panel) and density.
    expect(section('appearance').querySelectorAll('.segment').length).toBe(4);
    expect(section('appearance').querySelectorAll('app-theme-choice [role="radio"]').length).toBe(
      2
    );
  });

  it('renders the runtime section with per-host advertised poll intervals', () => {
    expect(el().textContent).toContain('runtime');
    expect(el().textContent).toContain('150ms');
    expect(el().textContent).toContain('n/a');
  });

  it('renders the hosts section with connection status and a wrapping last_error', () => {
    expect(el().textContent).toContain('hosts');
    expect(el().textContent).toContain('laptop');
    expect(el().textContent).toContain('desktop');

    const error = el().querySelector<HTMLElement>('.host-error');
    expect(error?.textContent).toContain('connection refused');
    expect(getComputedStyle(error!).whiteSpace).not.toBe('nowrap');
  });

  it('renders the current keyboard prefix with a default source label when no host reports hostKeybinds', () => {
    expect(el().textContent).toContain('Ctrl+B');
    expect(el().textContent).toContain('default');
  });

  it('renders the current keyboard prefix with a herdr-config source label when the primary host reports hostKeybinds', () => {
    store.capabilitiesSignal.update((map) => {
      const next = new Map(map);
      const laptop = next.get('laptop');
      if (laptop)
        next.set('laptop', {
          ...laptop,
          hostKeybinds: { prefix: 'Ctrl+Space', source: 'config-file' },
        });
      return next;
    });
    fixture.detectChanges();

    expect(el().textContent).toContain('Ctrl+Space');
    expect(el().textContent).toContain('from herdr config');
  });

  it('says hosts, never pens or servers', () => {
    const headings = Array.from(el().querySelectorAll('.settings-section h2')).map(
      (h) => h.textContent
    );
    expect(headings).not.toContain('Servers / pens');
  });

  it('renders the data section with a clear-data button', () => {
    expect(el().querySelector('.btn.danger')?.textContent).toContain('clear local data');
  });

  it('clicking density segments persists the choice via SettingsService', () => {
    const compactButton = Array.from(
      section('appearance').querySelectorAll<HTMLButtonElement>('.segment')
    ).find((b) => b.textContent?.includes('compact'));
    compactButton?.click();
    fixture.detectChanges();
    expect(settingsService.settings().density).toBe('compact');
  });

  it('picking the other theme in the shared choice writes ThemeService', () => {
    const before = themeService.theme();
    const options = Array.from(
      el().querySelectorAll<HTMLButtonElement>('app-theme-choice [role="radio"]')
    );
    options.find((b) => b.getAttribute('aria-checked') !== 'true')!.click();
    fixture.detectChanges();
    expect(themeService.theme()).not.toBe(before);
  });

  it('clicking clear-data opens a confirmation with a preview list instead of clearing', () => {
    const clearSpy = spyOn(TestBed.inject(SettingsService), 'clearLocalData');
    el().querySelector<HTMLButtonElement>('.btn.danger')?.click();
    fixture.detectChanges();

    const modal = el().querySelector('app-confirm-modal');
    expect(modal).toBeTruthy();
    expect(modal?.querySelector('.preview-heading')?.textContent).toContain(
      COPY.confirm.previewHeading
    );
    // One row per kanhrd-owned setting the sweep clears — board grouping
    // rides the same `kanhrd.settings` key, so it is listed too, and the
    // parked columns are a `kanhrd.*` key of their own.
    expect(modal?.querySelectorAll('.preview-row').length).toBe(7);
    expect(modal?.textContent).toContain(COPY.settings.clearParked);
    expect(modal?.textContent).toContain(COPY.settings.clearSwimlane);
    expect(modal?.querySelector('.modal-body')?.textContent).toContain('cannot be undone');
    expect(clearSpy).not.toHaveBeenCalled();
  });

  // --- terminal text size -------------------------------------------------

  it('offers one segment per ladder step in the terminal section', () => {
    const labels = fontSizeSegments().map((b) => b.textContent?.trim());
    expect(labels).toEqual(TERMINAL_FONT_SIZES.map(String));
    expect(section('terminal').textContent).toContain('text size');
  });

  it('marks the current size selected, and exposes it as aria-pressed rather than by weight alone', () => {
    const pressed = fontSizeSegments().filter((b) => b.getAttribute('aria-pressed') === 'true');
    expect(pressed.length).toBe(1);
    expect(pressed[0].textContent?.trim()).toBe(String(DEFAULT_TERMINAL_FONT_SIZE));
    expect(pressed[0].classList).toContain('active');
  });

  it('clicking a size segment persists the choice via TerminalFontSizeService', () => {
    const twenty = fontSizeSegments().find((b) => b.textContent?.trim() === '20');
    twenty!.click();
    fixture.detectChanges();

    expect(fontSizeService.size()).toBe(20);
    expect(twenty!.getAttribute('aria-pressed')).toBe('true');
    expect(fontSizeSegments().filter((b) => b.getAttribute('aria-pressed') === 'true').length).toBe(
      1
    );
  });

  it('keeps size and palette independent in both directions', () => {
    const themeSelect = el().querySelector<HTMLSelectElement>('#terminal-theme')!;

    fontSizeSegments()
      .find((b) => b.textContent?.trim() === '17')!
      .click();
    fixture.detectChanges();
    expect(terminalThemeService.name()).toBe('auto');

    themeSelect.value = 'monokai';
    themeSelect.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    expect(terminalThemeService.name()).toBe('monokai');
    expect(fontSizeService.size()).toBe(17);
  });

  it('sizes every segment past the coarse-pointer touch minimum', () => {
    for (const segment of fontSizeSegments()) {
      const box = segment.getBoundingClientRect();
      expect(box.height).toBeGreaterThanOrEqual(40);
      expect(box.width).toBeGreaterThanOrEqual(40);
    }
  });
});
