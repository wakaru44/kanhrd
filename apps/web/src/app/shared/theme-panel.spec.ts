import { provideZonelessChangeDetection, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { BridgeCapabilities, HostSummary } from '@kanhrd/schema';
import { ThemePanel } from './theme-panel';
import { COPY } from './copy';
import { Settings } from '../settings/settings';
import { PanesStore } from '../state/panes.store';
import { LayoutService } from '../state/layout.service';
import { ThemeService } from '../state/theme.service';
import { TerminalThemeService } from '../state/terminal-theme.service';

/** `Settings` reaches the store for the hosts and runtime sections only; the two theme rows need nothing from it. */
class FakePanesStore {
  readonly hostsSignal = signal<HostSummary[]>([{ name: 'laptop', connected: true }]);
  readonly capabilitiesSignal = signal<ReadonlyMap<string, BridgeCapabilities>>(new Map());

  primaryHostKeybinds(): BridgeCapabilities['hostKeybinds'] | null {
    return null;
  }
}

function clearStorage(): void {
  localStorage.removeItem('kanhrd.theme');
  localStorage.removeItem('kanhrd.terminal-theme');
  localStorage.removeItem('kanhrd.settings');
}

describe('ThemePanel', () => {
  let fixture: ComponentFixture<ThemePanel>;
  let layout: LayoutService;
  let themeService: ThemeService;
  let terminalThemeService: TerminalThemeService;

  beforeEach(async () => {
    clearStorage();
    await TestBed.configureTestingModule({
      imports: [ThemePanel],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        { provide: PanesStore, useValue: new FakePanesStore() },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ThemePanel);
    layout = TestBed.inject(LayoutService);
    themeService = TestBed.inject(ThemeService);
    terminalThemeService = TestBed.inject(TerminalThemeService);
    fixture.detectChanges();
  });

  afterEach(() => {
    layout.closeThemePanel();
    clearStorage();
    document.documentElement.removeAttribute('data-theme');
  });

  function trigger(): HTMLButtonElement {
    return (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(
      '.theme-toggle'
    )!;
  }

  /** The panel is portalled into the CDK overlay container, so it is not under the fixture's own element. */
  function panel(): HTMLElement | null {
    return document.querySelector<HTMLElement>('.theme-panel');
  }

  function radios(): HTMLButtonElement[] {
    return Array.from(panel()!.querySelectorAll<HTMLButtonElement>('[role="radio"]'));
  }

  function open(): void {
    trigger().click();
    fixture.detectChanges();
  }

  // --- opening -----------------------------------------------------------

  it('renders a trigger that opens a panel rather than toggling the theme', () => {
    const before = themeService.theme();
    expect(panel()).toBeNull();
    expect(trigger().getAttribute('aria-expanded')).toBe('false');

    open();

    expect(panel()).not.toBeNull();
    expect(themeService.theme()).toBe(before);
  });

  it('ties the trigger to the panel for assistive technology', () => {
    expect(trigger().getAttribute('aria-haspopup')).toBe('dialog');
    expect(trigger().getAttribute('aria-controls')).toBeNull();

    open();

    expect(trigger().getAttribute('aria-expanded')).toBe('true');
    expect(trigger().getAttribute('aria-controls')).toBe(panel()!.id);
    expect(panel()!.getAttribute('role')).toBe('dialog');
    expect(panel()!.getAttribute('aria-label')).toBe(COPY.settings.theme);
  });

  it('closes on a second activation and tracks aria-expanded both ways', () => {
    open();
    expect(trigger().getAttribute('aria-expanded')).toBe('true');

    trigger().click();
    fixture.detectChanges();

    expect(panel()).toBeNull();
    expect(trigger().getAttribute('aria-expanded')).toBe('false');
  });

  it('moves focus into the panel when it opens', () => {
    open();
    expect(panel()!.contains(document.activeElement)).toBeTrue();
  });

  // --- the two surfaces --------------------------------------------------

  it('carries one row per themed surface, labelled by surface', () => {
    open();
    const labels = Array.from(panel()!.querySelectorAll('.setting-label')).map((l) =>
      l.textContent?.trim()
    );
    expect(labels).toEqual([COPY.theme.board, COPY.settings.terminal]);
  });

  it('sets the board theme without closing the panel', () => {
    open();
    const other = radios().find((r) => r.getAttribute('aria-checked') !== 'true')!;
    const expected = themeService.theme() === 'dark' ? 'light' : 'dark';

    other.click();
    fixture.detectChanges();

    expect(themeService.theme()).toBe(expected);
    expect(panel()).not.toBeNull();
  });

  it('sets the terminal palette independently of the board theme', () => {
    open();
    const board = themeService.theme();
    const select = panel()!.querySelector<HTMLSelectElement>('select')!;

    select.value = 'monokai';
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    expect(terminalThemeService.name()).toBe('monokai');
    expect(themeService.theme()).toBe(board);
    expect(panel()).not.toBeNull();
  });

  it('leaves auto following the board theme', () => {
    open();
    expect(terminalThemeService.name()).toBe('auto');

    themeService.set('light');
    fixture.detectChanges();
    const washi = terminalThemeService.theme().background;

    themeService.set('dark');
    fixture.detectChanges();

    expect(terminalThemeService.theme().background).not.toBe(washi);
  });

  it('marks the selected theme with more than colour', () => {
    open();
    const checked = radios().find((r) => r.getAttribute('aria-checked') === 'true')!;
    expect(checked.classList).toContain('active');
    expect(getComputedStyle(checked).fontWeight).not.toBe(
      getComputedStyle(radios().find((r) => r !== checked)!).fontWeight
    );
  });

  // --- keyboard ----------------------------------------------------------

  it('moves the board selection with arrow keys', () => {
    open();
    const before = themeService.theme();

    radios()[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    fixture.detectChanges();

    expect(themeService.theme()).not.toBe(before);
    expect(radios().find((r) => r.getAttribute('aria-checked') === 'true')).toBe(
      document.activeElement as HTMLButtonElement
    );
  });

  it('keeps the radio group to a single tab stop', () => {
    open();
    const stops = radios().filter((r) => r.getAttribute('tabindex') === '0');
    expect(stops.length).toBe(1);
    expect(stops[0].getAttribute('aria-checked')).toBe('true');
  });

  it('closes on Escape and returns focus to the trigger', () => {
    open();
    panel()!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();

    expect(panel()).toBeNull();
    expect(trigger().getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(trigger());
  });

  it('returns focus to the trigger when the Escape ladder closes it from outside', () => {
    // `KeyboardService.closeTopOverlay` has no component reference — it
    // flips the signal — so the focus return has to survive that path too.
    open();
    layout.closeThemePanel();
    fixture.detectChanges();

    expect(panel()).toBeNull();
    expect(document.activeElement).toBe(trigger());
  });

  it('closes on a click outside without taking focus back', () => {
    open();
    const elsewhere = document.createElement('button');
    document.body.appendChild(elsewhere);
    elsewhere.focus();

    elsewhere.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    fixture.detectChanges();

    expect(panel()).toBeNull();
    expect(document.activeElement).toBe(elsewhere);
    elsewhere.remove();
  });

  // --- viewport ----------------------------------------------------------

  it('opens inside the viewport', () => {
    open();
    const box = panel()!.getBoundingClientRect();
    expect(box.left).toBeGreaterThanOrEqual(0);
    expect(box.right).toBeLessThanOrEqual(window.innerWidth + 1);
  });
});

/**
 * The anti-drift claim. The panel is the quick path and `/settings` is the
 * full inventory, so the same two choices are rendered twice — which is only
 * safe because both surfaces render the SAME components
 * (`shared/theme-choice`, `shared/terminal-theme-choice`). These tests fail
 * the moment either surface grows its own copy.
 */
describe('ThemePanel and Settings agree', () => {
  let panelFixture: ComponentFixture<ThemePanel>;
  let settingsFixture: ComponentFixture<Settings>;
  let layout: LayoutService;
  let themeService: ThemeService;
  let terminalThemeService: TerminalThemeService;

  beforeEach(async () => {
    clearStorage();
    await TestBed.configureTestingModule({
      imports: [ThemePanel, Settings],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        { provide: PanesStore, useValue: new FakePanesStore() },
      ],
    }).compileComponents();

    panelFixture = TestBed.createComponent(ThemePanel);
    settingsFixture = TestBed.createComponent(Settings);
    layout = TestBed.inject(LayoutService);
    themeService = TestBed.inject(ThemeService);
    terminalThemeService = TestBed.inject(TerminalThemeService);
    panelFixture.detectChanges();
    settingsFixture.detectChanges();
    layout.toggleThemePanel();
    panelFixture.detectChanges();
  });

  afterEach(() => {
    layout.closeThemePanel();
    clearStorage();
    document.documentElement.removeAttribute('data-theme');
  });

  function panelRoot(): HTMLElement {
    return document.querySelector<HTMLElement>('.theme-panel')!;
  }

  function settingsRoot(): HTMLElement {
    return settingsFixture.nativeElement as HTMLElement;
  }

  function checkedTheme(root: HTMLElement): string {
    return root
      .querySelector<HTMLElement>('app-theme-choice [role="radio"][aria-checked="true"]')!
      .textContent!.trim();
  }

  function palette(root: HTMLElement): string {
    return root.querySelector<HTMLSelectElement>('app-terminal-theme-choice select')!.value;
  }

  it('reflects a board-theme change made in the panel', () => {
    panelRoot()
      .querySelectorAll<HTMLButtonElement>('[role="radio"]')
      .forEach((r) => {
        if (r.getAttribute('aria-checked') !== 'true') r.click();
      });
    panelFixture.detectChanges();
    settingsFixture.detectChanges();

    expect(checkedTheme(settingsRoot())).toBe(checkedTheme(panelRoot()));
    expect(checkedTheme(settingsRoot())).toBe(
      themeService.theme() === 'dark' ? COPY.theme.sumi : COPY.theme.washi
    );
  });

  it('reflects a board-theme change made in Settings', () => {
    const option = Array.from(
      settingsRoot().querySelectorAll<HTMLButtonElement>('app-theme-choice [role="radio"]')
    ).find((r) => r.getAttribute('aria-checked') !== 'true')!;
    option.click();
    settingsFixture.detectChanges();
    // That click landed outside the panel, which dismisses it — so this is
    // also the real path: make the choice in Settings, open the panel after.
    panelFixture.detectChanges();
    expect(document.querySelector('.theme-panel')).toBeNull();
    layout.toggleThemePanel();
    panelFixture.detectChanges();

    expect(checkedTheme(panelRoot())).toBe(checkedTheme(settingsRoot()));
  });

  it('reflects a terminal-palette change made in Settings', () => {
    const select = settingsRoot().querySelector<HTMLSelectElement>('#terminal-theme')!;
    select.value = 'solarized-dark';
    select.dispatchEvent(new Event('change'));
    settingsFixture.detectChanges();
    panelFixture.detectChanges();

    expect(terminalThemeService.name()).toBe('solarized-dark');
    expect(palette(panelRoot())).toBe('solarized-dark');
  });

  it('offers the same palettes in the same order on both surfaces', () => {
    const options = (root: HTMLElement) =>
      Array.from(root.querySelectorAll<HTMLOptionElement>('app-terminal-theme-choice option')).map(
        (o) => o.value
      );

    expect(options(panelRoot())).toEqual(options(settingsRoot()));
    expect(options(panelRoot()).length).toBeGreaterThan(1);
  });
});
