import { TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { Router } from '@angular/router';
import type { TabSummary } from '@kanhrd/schema';
import type { BridgeCapabilities } from '@kanhrd/schema';
import {
  DEFAULT_PREFIX,
  DIRECT_CHORDS,
  KeyboardService,
  formatBinding,
  isTextInputFocused,
  loadPrefix,
  matchesPrefix,
  parsePrefix,
  savePrefix,
} from './keyboard.service';
import { PanesStore, paneKey } from './panes.store';
import { LayoutService } from './layout.service';
import { ThemeService } from './theme.service';
import { ToastService } from './toast.service';
import { COPY } from '../shared/copy';

function keyEvent(
  key: string,
  mods: Partial<{ ctrlKey: boolean; metaKey: boolean; shiftKey: boolean }> = {}
): KeyboardEvent {
  return new KeyboardEvent('keydown', { key, cancelable: true, ...mods });
}

function tab(host: string, id: string): TabSummary {
  return { id, host, workspace: { id: 'w1' }, name: id };
}

/** Minimal fake covering every `PanesStore` member `KeyboardService` touches. */
class FakePanesStore {
  readonly tabsSignal = signal<ReadonlyMap<string, TabSummary>>(new Map());
  readonly tabFilterSignal = signal<{ host: string; tabId: string } | null>(null);
  readonly scopeSignal = signal<{ host: string; workspaceId: string; tabId: string | null } | null>(
    null
  );
  readonly hostKeybindsSignal = signal<BridgeCapabilities['hostKeybinds'] | null>(null);

  findHostForCapability = jasmine.createSpy('findHostForCapability').and.returnValue(null);
  primaryHostKeybinds = jasmine
    .createSpy('primaryHostKeybinds')
    .and.callFake(() => this.hostKeybindsSignal());
  splitPane = jasmine.createSpy('splitPane').and.resolveTo(undefined);
  setScope = jasmine
    .createSpy('setScope')
    .and.callFake((host: string, _workspaceId: string, tabId: string | null) => {
      this.tabFilterSignal.set(tabId ? { host, tabId } : null);
    });
  requestPendingRename = jasmine.createSpy('requestPendingRename');
  requestCloseTabById = jasmine.createSpy('requestCloseTabById');

  setTabs(tabs: TabSummary[]): void {
    this.tabsSignal.set(new Map(tabs.map((t) => [paneKey(t.host, t.id), t])));
  }
}

async function flushMicrotasks(): Promise<void> {
  for (let i = 0; i < 5; i++) {
    await Promise.resolve();
  }
}

/** Lets a root effect (created in an `@Injectable` constructor, e.g. `KeyboardService`'s prefix-persist effect) flush. Mirrors theme.service.spec.ts's `settle()`. */
async function settle(): Promise<void> {
  await flushMicrotasks();
  await new Promise((resolve) => setTimeout(resolve, 0));
  await flushMicrotasks();
}

describe('keyboard.service pure helpers', () => {
  afterEach(() => {
    localStorage.removeItem('kanhrd.keyboard');
  });

  it('loadPrefix defaults to Ctrl+B when nothing is stored', () => {
    expect(loadPrefix({ getItem: () => null })).toBe(DEFAULT_PREFIX);
  });

  it('loadPrefix reads a stored prefix', () => {
    expect(loadPrefix({ getItem: () => JSON.stringify({ prefix: 'Ctrl+A' }) })).toBe('Ctrl+A');
  });

  it('loadPrefix falls back to default on garbage', () => {
    expect(loadPrefix({ getItem: () => 'not json' })).toBe(DEFAULT_PREFIX);
  });

  it('savePrefix writes the expected JSON shape', () => {
    const calls: string[] = [];
    savePrefix('Ctrl+A', { setItem: (_k, v) => calls.push(v) });
    expect(calls).toEqual([JSON.stringify({ prefix: 'Ctrl+A' })]);
  });

  it('parsePrefix/matchesPrefix recognize the default Ctrl+B combo', () => {
    const parsed = parsePrefix(DEFAULT_PREFIX);
    expect(parsed).toEqual({ ctrl: true, meta: false, shift: false, alt: false, key: 'b' });
    expect(matchesPrefix(DEFAULT_PREFIX, keyEvent('b', { ctrlKey: true }))).toBe(true);
    expect(matchesPrefix(DEFAULT_PREFIX, keyEvent('b'))).toBe(false);
  });

  it('isTextInputFocused recognizes input/textarea/contenteditable, not a plain div', () => {
    const input = document.createElement('input');
    const textarea = document.createElement('textarea');
    const div = document.createElement('div');
    const editable = document.createElement('div');
    editable.contentEditable = 'true';
    expect(isTextInputFocused(input)).toBe(true);
    expect(isTextInputFocused(textarea)).toBe(true);
    expect(isTextInputFocused(editable)).toBe(true);
    expect(isTextInputFocused(div)).toBe(false);
    expect(isTextInputFocused(null)).toBe(false);
  });

  it("formatBinding renders chord bindings as 'prefix + key' and non-chord as the bare key", () => {
    const chordBinding = {
      action: 'new-pane',
      keys: 'c',
      description: '',
      category: 'Lifecycle',
      chord: true,
    } as const;
    const plainBinding = {
      action: 'toggle-theme',
      keys: 't',
      description: '',
      category: 'View',
      chord: false,
    } as const;
    expect(formatBinding(chordBinding, 'Ctrl+B')).toBe('Ctrl+B + c');
    expect(formatBinding(plainBinding, 'Ctrl+B')).toBe('t');
  });
});

describe('KeyboardService', () => {
  let store: FakePanesStore;
  let service: KeyboardService;

  beforeEach(() => {
    localStorage.removeItem('kanhrd.keyboard');
    localStorage.removeItem('kanhrd.theme');
    store = new FakePanesStore();
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        LayoutService,
        ThemeService,
        ToastService,
        { provide: PanesStore, useValue: store },
        { provide: Router, useValue: { navigate: jasmine.createSpy('navigate') } },
      ],
    });
    service = TestBed.inject(KeyboardService);
  });

  afterEach(() => {
    localStorage.removeItem('kanhrd.keyboard');
    localStorage.removeItem('kanhrd.theme');
    document.documentElement.removeAttribute('data-theme');
  });

  it('defaults prefix() to Ctrl+B', () => {
    expect(service.prefix()).toBe(DEFAULT_PREFIX);
  });

  it('persists a changed prefix to localStorage', async () => {
    service.setPrefix('Ctrl+A');
    await settle();
    expect(loadPrefix()).toBe('Ctrl+A');
  });

  it('resetToDefault() restores Ctrl+B after a rebind', () => {
    service.setPrefix('Ctrl+A');
    service.resetToDefault();
    expect(service.prefix()).toBe(DEFAULT_PREFIX);
  });

  describe('herdr-mirrored default prefix', () => {
    it("uses the primary host's hostKeybinds.prefix when the user has no explicit override", () => {
      store.hostKeybindsSignal.set({ prefix: 'Ctrl+Space', source: 'config-file' });

      expect(service.prefix()).toBe('Ctrl+Space');
      expect(service.prefixSource()).toBe('herdr-config');
    });

    it('an explicit user override wins over a herdr-mirrored prefix', () => {
      store.hostKeybindsSignal.set({ prefix: 'Ctrl+Space', source: 'config-file' });
      service.setPrefix('Ctrl+A');

      expect(service.prefix()).toBe('Ctrl+A');
      expect(service.prefixSource()).toBe('override');
    });

    it('falls back to the hardcoded Ctrl+B default when no host reports hostKeybinds', () => {
      store.hostKeybindsSignal.set(null);

      expect(service.prefix()).toBe(DEFAULT_PREFIX);
      expect(service.prefixSource()).toBe('default');
    });

    it('resetToDefault() clears the override back to the herdr-mirrored prefix, not the hardcoded one, when a host reports one', () => {
      store.hostKeybindsSignal.set({ prefix: 'Ctrl+Space', source: 'config-file' });
      service.setPrefix('Ctrl+A');

      service.resetToDefault();

      expect(service.prefix()).toBe('Ctrl+Space');
      expect(service.prefixSource()).toBe('herdr-config');
    });
  });

  it('sources every description from copy.ts, never a literal typed here', () => {
    // `create.pane`, `nav.nextCard` and `nav.cardSwitcher` are reused
    // deliberately: a chord must not describe an action in a second voice
    // from the control that performs it.
    const approved = new Set<string>([
      COPY.create.pane,
      COPY.nav.cardSwitcher,
      COPY.nav.nextCard,
      ...Object.values(COPY.help.shortcuts),
    ]);
    for (const binding of TestBed.inject(KeyboardService).shortcuts().values()) {
      expect(approved.has(binding.description))
        .withContext(`${binding.action}: "${binding.description}" is not in copy.ts`)
        .toBeTrue();
    }
  });

  it("describes the new-card chord with the same words as the board's create menu", () => {
    // `prefix + c` and the `+` menu's first item run the same action; they
    // must not describe it in two voices.
    const binding = TestBed.inject(KeyboardService).shortcuts().get('new-pane');
    expect(binding?.description).toBe(COPY.create.pane);
  });

  it("speaks herdr's vocabulary in every description the user reads", () => {
    for (const binding of TestBed.inject(KeyboardService).shortcuts().values()) {
      expect(binding.description)
        .withContext(binding.action)
        .not.toMatch(/\bpen\b|\bfield\b|\blane\b/);
    }
  });

  it('shortcuts() returns every documented action, each with a description', () => {
    const shortcuts = service.shortcuts();
    for (const action of [
      'new-pane',
      'next-tab',
      'prev-tab',
      'last-tab',
      'open-rail',
      'close-tab',
      'close-pane',
      'rename-tab',
      'jump-tab',
      'help',
      'toggle-theme',
      'focus-search',
      'close-overlay',
      'focus-card-switcher',
      'next-sibling-card',
    ] as const) {
      expect(shortcuts.get(action)?.description).withContext(action).toBeTruthy();
    }
  });

  // --- the card switcher: one stolen chord, and herdr's own "other pane" key.

  describe('card switcher bindings', () => {
    let handle: {
      available: jasmine.Spy;
      focus: jasmine.Spy;
      nextCard: jasmine.Spy;
    };

    beforeEach(() => {
      handle = {
        available: jasmine.createSpy('available').and.returnValue(true),
        focus: jasmine.createSpy('focus'),
        nextCard: jasmine.createSpy('nextCard'),
      };
      service.registerCardSwitcher(handle);
    });

    function ctrlAltI(): KeyboardEvent {
      return new KeyboardEvent('keydown', {
        key: 'i',
        ctrlKey: true,
        altKey: true,
        cancelable: true,
      });
    }

    it('holds exactly one direct chord, and it is the switcher', () => {
      expect(DIRECT_CHORDS).toEqual([{ chord: 'Ctrl+Alt+I', action: 'focus-card-switcher' }]);
    });

    it('recognizes Ctrl+Alt+I from inside a focused terminal and stops it reaching the pane', () => {
      const textarea = document.createElement('textarea');
      const event = ctrlAltI();

      service.handleKeydown(event, textarea);

      expect(handle.focus).toHaveBeenCalled();
      expect(event.defaultPrevented).toBeTrue();
      expect(event.cancelBubble).toBeTrue();
    });

    it('passes an unlisted Ctrl+Alt chord through to the terminal untouched', () => {
      const textarea = document.createElement('textarea');
      const event = new KeyboardEvent('keydown', {
        key: 'k',
        ctrlKey: true,
        altKey: true,
        cancelable: true,
      });

      service.handleKeydown(event, textarea);

      expect(handle.focus).not.toHaveBeenCalled();
      expect(event.defaultPrevented).toBeFalse();
      expect(event.cancelBubble).toBeFalse();
    });

    it('passes Ctrl+Alt+I through untouched when there is no switcher to focus', () => {
      handle.available.and.returnValue(false);
      const event = ctrlAltI();

      service.handleKeydown(event, document.createElement('textarea'));

      expect(handle.focus).not.toHaveBeenCalled();
      expect(event.defaultPrevented).toBeFalse();
      expect(event.cancelBubble).toBeFalse();
    });

    it('lets a prefix of Ctrl+Alt+I arm the chord instead of focusing the switcher', () => {
      service.setPrefix('Ctrl+Alt+I');
      const event = ctrlAltI();

      service.handleKeydown(event, document.body);

      expect(handle.focus).not.toHaveBeenCalled();
      expect(service.chordActive()).toBeTrue();
    });

    it('focuses the switcher on prefix + i', () => {
      service.handleKeydown(keyEvent('b', { ctrlKey: true }), document.body);
      service.handleKeydown(keyEvent('i'), document.body);

      expect(handle.focus).toHaveBeenCalled();
    });

    it('hops to the next card on prefix + o, without opening the switcher', () => {
      service.handleKeydown(keyEvent('b', { ctrlKey: true }), document.body);
      service.handleKeydown(keyEvent('o'), document.body);

      expect(handle.nextCard).toHaveBeenCalled();
      expect(handle.focus).not.toHaveBeenCalled();
    });

    it('is a no-op on prefix + o in a tab of one', () => {
      handle.available.and.returnValue(false);
      service.handleKeydown(keyEvent('b', { ctrlKey: true }), document.body);
      service.handleKeydown(keyEvent('o'), document.body);

      expect(handle.nextCard).not.toHaveBeenCalled();
    });

    it('does nothing at all once pane detail has unregistered', () => {
      service.registerCardSwitcher(null);
      const event = ctrlAltI();

      service.handleKeydown(event, document.createElement('textarea'));

      expect(event.defaultPrevented).toBeFalse();
    });

    it('advertises both of the switcher bindings, and o as a chord only', () => {
      const switcher = service.shortcuts().get('focus-card-switcher');
      expect(formatBinding(switcher!, 'Ctrl+B')).toBe('Ctrl+B + i or Ctrl+Alt+I');

      const hop = service.shortcuts().get('next-sibling-card');
      expect(hop?.direct).toBeUndefined();
      expect(formatBinding(hop!, 'Ctrl+B')).toBe('Ctrl+B + o');
      expect(hop?.category).toBe('Navigation');
      expect(switcher?.category).toBe('Navigation');
    });
  });

  describe('prefix chord detection', () => {
    it("arms on Ctrl+B, then 'c' within the timeout fires new-pane (paneCreate lookup + splitPane)", () => {
      store.findHostForCapability.and.returnValue('local');

      service.handleKeydown(keyEvent('b', { ctrlKey: true }), document.body);
      expect(service.chordActive()).toBe(true);

      service.handleKeydown(keyEvent('c'), document.body);

      expect(service.chordActive()).toBe(false);
      expect(store.findHostForCapability).toHaveBeenCalledWith('paneCreate');
      expect(store.splitPane).toHaveBeenCalledWith('local', { direction: 'right' });
    });

    it("expires the chord after the 2s timeout, so a late 'c' does nothing", () => {
      jasmine.clock().install();
      try {
        store.findHostForCapability.and.returnValue('local');

        service.handleKeydown(keyEvent('b', { ctrlKey: true }), document.body);
        expect(service.chordActive()).toBe(true);

        jasmine.clock().tick(2001);
        expect(service.chordActive()).toBe(false);

        service.handleKeydown(keyEvent('c'), document.body);
        expect(store.splitPane).not.toHaveBeenCalled();
      } finally {
        jasmine.clock().uninstall();
      }
    });
  });

  describe('focused-input suppression', () => {
    it('does not arm the chord (or fire the bound action) while a text input has focus', () => {
      const input = document.createElement('input');
      store.findHostForCapability.and.returnValue('local');

      service.handleKeydown(keyEvent('b', { ctrlKey: true }), input);
      expect(service.chordActive())
        .withContext('Ctrl+B must reach the focused input untouched, not arm the prefix chord')
        .toBe(false);

      service.handleKeydown(keyEvent('c'), input);
      expect(store.splitPane).not.toHaveBeenCalled();
    });
  });

  describe("'?' help overlay", () => {
    it('opens when no text input has focus', () => {
      expect(service.helpOpen()).toBe(false);
      service.handleKeydown(keyEvent('?'), document.body);
      expect(service.helpOpen()).toBe(true);
    });

    it('does not open while a text input has focus', () => {
      const input = document.createElement('input');
      service.handleKeydown(keyEvent('?'), input);
      expect(service.helpOpen()).toBe(false);
    });

    it('Escape closes the overlay', () => {
      service.openHelp();
      expect(service.helpOpen()).toBe(true);
      service.handleKeydown(keyEvent('Escape'), document.body);
      expect(service.helpOpen()).toBe(false);
    });
  });

  describe('tab navigation (chord)', () => {
    it('prefix+n advances tabFilterSignal to the next tab in tabsSignal order', () => {
      store.setTabs([tab('local', 't1'), tab('local', 't2')]);
      store.setScope('local', 'w1', 't1');

      service.handleKeydown(keyEvent('b', { ctrlKey: true }), document.body);
      service.handleKeydown(keyEvent('n'), document.body);

      expect(store.tabFilterSignal()).toEqual({ host: 'local', tabId: 't2' });
    });

    it('hands prefix+n / prefix+p to the view when one registers a tab navigator', () => {
      // Pane detail registers this on mount. Before it existed, these keys
      // moved the BOARD's scope while the operator was looking at a
      // terminal — nothing on screen changed, so the keys read as dead.
      store.setTabs([tab('local', 't1'), tab('local', 't2')]);
      store.setScope('local', 'w1', 't1');
      const steps: number[] = [];
      service.registerTabNavigator({ available: () => true, step: (d) => steps.push(d) });

      service.handleKeydown(keyEvent('b', { ctrlKey: true }), document.body);
      service.handleKeydown(keyEvent('n'), document.body);
      service.handleKeydown(keyEvent('b', { ctrlKey: true }), document.body);
      service.handleKeydown(keyEvent('p'), document.body);

      expect(steps).toEqual([1, -1]);
      expect(store.setScope).withContext('the view moved, not the board').toHaveBeenCalledTimes(1);
    });

    it('keeps the board behaviour when the view has nothing to step through', () => {
      // A workspace of one tab: the navigator is registered but reports
      // unavailable, and the keys fall back rather than doing nothing.
      store.setTabs([tab('local', 't1'), tab('local', 't2')]);
      store.setScope('local', 'w1', 't1');
      service.registerTabNavigator({ available: () => false, step: () => fail('not reachable') });

      service.handleKeydown(keyEvent('b', { ctrlKey: true }), document.body);
      service.handleKeydown(keyEvent('n'), document.body);

      expect(store.tabFilterSignal()).toEqual({ host: 'local', tabId: 't2' });
    });

    it('returns the keys to the board when the view unregisters on destroy', () => {
      store.setTabs([tab('local', 't1'), tab('local', 't2')]);
      store.setScope('local', 'w1', 't1');
      service.registerTabNavigator({ available: () => true, step: () => fail('not reachable') });
      service.registerTabNavigator(null);

      service.handleKeydown(keyEvent('b', { ctrlKey: true }), document.body);
      service.handleKeydown(keyEvent('n'), document.body);

      expect(store.tabFilterSignal()).toEqual({ host: 'local', tabId: 't2' });
    });

    it('prefix+0..9 jumps to the tab at that index', () => {
      store.setTabs([tab('local', 't1'), tab('local', 't2'), tab('local', 't3')]);

      service.handleKeydown(keyEvent('b', { ctrlKey: true }), document.body);
      service.handleKeydown(keyEvent('2'), document.body);

      expect(store.tabFilterSignal()).toEqual({ host: 'local', tabId: 't3' });
    });
  });

  it('escape closes the theme panel, and only after the chrome above it', () => {
    const layout = TestBed.inject(LayoutService);
    layout.themePanelOpen.set(true);
    layout.plusMenuOpen.set(true);

    service.handleKeydown(keyEvent('Escape'), document.body);
    expect(layout.plusMenuOpen()).toBeFalse();
    expect(layout.themePanelOpen()).toBeTrue();

    service.handleKeydown(keyEvent('Escape'), document.body);
    expect(layout.themePanelOpen()).toBeFalse();
  });

  it("prefix+t (non-chord 't') toggles the theme directly, opening nothing", () => {
    const themeService = TestBed.inject(ThemeService);
    const layout = TestBed.inject(LayoutService);
    const before = themeService.theme();
    service.handleKeydown(keyEvent('t'), document.body);
    expect(themeService.theme()).not.toBe(before);
    // The header control opens a panel now; the shortcut deliberately does not.
    expect(layout.themePanelOpen()).toBeFalse();
  });

  describe('propagation (fix-keyboard-shortcut-suppression)', () => {
    it('stops propagation on the prefix keydown once it arms the chord', () => {
      const event = keyEvent('b', { ctrlKey: true });
      service.handleKeydown(event, document.body);
      expect(event.defaultPrevented).toBe(true);
      expect(event.cancelBubble).toBe(true);
    });

    it('stops propagation on a recognized bound action key', () => {
      service.handleKeydown(keyEvent('b', { ctrlKey: true }), document.body);
      const event = keyEvent('t'); // bound non-chord action
      service.handleKeydown(event, document.body);
      expect(event.defaultPrevented).toBe(true);
      expect(event.cancelBubble).toBe(true);
    });

    it('leaves an unrecognized key completely untouched', () => {
      const event = keyEvent('q'); // not bound to anything
      service.handleKeydown(event, document.body);
      expect(event.defaultPrevented).toBe(false);
      expect(event.cancelBubble).toBe(false);
    });

    it('leaves the prefix keystroke untouched while an input is focused', () => {
      const input = document.createElement('input');
      const event = keyEvent('b', { ctrlKey: true });
      service.handleKeydown(event, input);
      expect(event.defaultPrevented).toBe(false);
      expect(event.cancelBubble).toBe(false);
    });
  });
});

/**
 * Reproduces (and proves the fix for) the real-world symptom Juan diagnosed
 * live: Vimium/Vimium C — or any extension — installs a keydown listener at
 * `document` (or lower) in the CAPTURE phase, and calls `stopPropagation()`
 * when it recognizes a bound key (Vimium binds `Ctrl+B` to "scroll up a
 * page", the classic less/vi pager convention). No real extension is
 * installed in karma, so these tests simulate the mechanism directly with a
 * plain `document`-level capture listener standing in for it — this proves
 * the DOM event-ordering claim the fix relies on is real and testable, not
 * merely plausible.
 */
describe('keydown capture-phase ordering vs. a page-level extension (fix-keyboard-shortcut-suppression)', () => {
  let vimiumLike: (e: KeyboardEvent) => void;

  afterEach(() => {
    document.removeEventListener('keydown', vimiumLike, { capture: true });
  });

  function dispatchCtrlB(): void {
    const event = new KeyboardEvent('keydown', {
      key: 'b',
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    });
    document.dispatchEvent(event);
  }

  it('BUG repro: a document-capture listener that stops propagation prevents a window-BUBBLE listener (the old @HostListener shape) from firing', () => {
    let bubbleFired = false;
    vimiumLike = (e) => e.stopPropagation();
    const ourOldBubbleHandler = () => {
      bubbleFired = true;
    };
    document.addEventListener('keydown', vimiumLike, { capture: true });
    window.addEventListener('keydown', ourOldBubbleHandler); // bubble phase, capture: false (default) — mirrors the old @HostListener('window:keydown') attachment

    try {
      dispatchCtrlB();
      expect(bubbleFired)
        .withContext('old bubble-phase window listener never sees the stopped event')
        .toBe(false);
    } finally {
      window.removeEventListener('keydown', ourOldBubbleHandler);
    }
  });

  it('FIX proof: a window-CAPTURE listener fires before, and can pre-empt, a document-capture listener registered ahead of it', () => {
    let windowCaptureFired = false;
    let vimiumFired = false;
    vimiumLike = () => {
      vimiumFired = true;
    };
    const ourNewCaptureHandler = (e: KeyboardEvent) => {
      windowCaptureFired = true;
      e.stopPropagation(); // what KeyboardService.handleKeydown now does for a recognized key
    };
    // Registered BEFORE our listener, to prove this isn't about registration
    // order — window's capture phase always runs ahead of document's for
    // listeners on different nodes, regardless of which was attached first.
    document.addEventListener('keydown', vimiumLike, { capture: true });
    window.addEventListener('keydown', ourNewCaptureHandler, { capture: true });

    try {
      dispatchCtrlB();
      expect(windowCaptureFired).toBe(true);
      expect(vimiumFired)
        .withContext('window-capture stopPropagation pre-empts document-capture entirely')
        .toBe(false);
    } finally {
      window.removeEventListener('keydown', ourNewCaptureHandler, { capture: true });
    }
  });
});
