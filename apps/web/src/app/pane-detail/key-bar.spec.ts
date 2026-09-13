import { Component, provideZonelessChangeDetection, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import {
  KEY_BAR_LONG_PRESS_MS,
  KeyBar,
  SETTLE_CEILING_MS,
  SETTLE_STABLE_FRAMES,
  occludedBottom,
} from './key-bar';
import { DEFAULT_KEY_BAR_CELLS, KeyBarModifiers, type KeyBarCell } from './key-bar-cells';

@Component({
  imports: [KeyBar],
  template: `
    <div class="anchor">
      <input class="focus-target" />
      <app-key-bar
        [cells]="cells()"
        [modifiers]="modifiers"
        [expanded]="expanded()"
        (keys)="sent.push($event)"
        (toggled)="toggles = toggles + 1"
        (reserve)="reserve = $event"
      />
    </div>
  `,
})
class Host {
  readonly cells = signal<readonly KeyBarCell[]>(DEFAULT_KEY_BAR_CELLS);
  readonly modifiers = new KeyBarModifiers();
  readonly expanded = signal(true);
  sent: (readonly string[])[] = [];
  toggles = 0;
  reserve = 0;
}

describe('KeyBar', () => {
  let fixture: ComponentFixture<Host>;
  let host: Host;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Host],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();
    fixture = TestBed.createComponent(Host);
    host = fixture.componentInstance;
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
    await fixture.whenStable();
  });

  afterEach(() => (fixture.nativeElement as HTMLElement).remove());

  const el = () => fixture.nativeElement as HTMLElement;
  const key = (id: string) => el().querySelector<HTMLButtonElement>(`[data-cell="${id}"]`)!;
  const strip = () => el().querySelector<HTMLButtonElement>('.strip')!;

  function pointer(target: Element, type: string): PointerEvent {
    const event = new PointerEvent(type, { bubbles: true, cancelable: true, pointerType: 'touch' });
    target.dispatchEvent(event);
    return event;
  }

  function tap(target: Element): PointerEvent {
    const down = pointer(target, 'pointerdown');
    pointer(target, 'pointerup');
    fixture.detectChanges();
    return down;
  }

  it('renders the cells it is given, in order, as keycap text', () => {
    expect(Array.from(el().querySelectorAll('.key')).map((k) => k.textContent?.trim())).toEqual(
      DEFAULT_KEY_BAR_CELLS.map((c) => c.label)
    );
    host.cells.set([{ kind: 'keys', id: 'combo', label: 'C-b c', keys: ['ctrl+b', 'c'] }]);
    fixture.detectChanges();
    expect(el().querySelectorAll('.key').length).toBe(1);
  });

  it('emits a composite cell sequence whole and in order', () => {
    host.cells.set([{ kind: 'keys', id: 'combo', label: 'C-b c', keys: ['ctrl+b', 'c'] }]);
    fixture.detectChanges();
    tap(key('combo'));
    expect(host.sent).toEqual([['ctrl+b', 'c']]);
  });

  it('cancels pointerdown so a tap never moves focus off the terminal', () => {
    const input = el().querySelector<HTMLInputElement>('.focus-target')!;
    input.focus();
    const down = tap(key('esc'));
    expect(down.defaultPrevented).toBeTrue();
    expect(host.sent).toEqual([['esc']]);
  });

  it('drops a press that turned into a pan', () => {
    pointer(key('up'), 'pointerdown');
    pointer(key('up'), 'pointercancel');
    pointer(key('up'), 'pointerup');
    expect(host.sent).toEqual([]);
  });

  it('shows idle, armed and locked as three different states', async () => {
    const ctrl = key('ctrl');
    expect(ctrl.getAttribute('data-state')).toBe('idle');
    expect(ctrl.getAttribute('aria-pressed')).toBe('false');

    tap(ctrl);
    expect(ctrl.getAttribute('data-state')).toBe('armed');
    expect(ctrl.getAttribute('aria-pressed')).toBe('true');

    tap(ctrl);
    pointer(ctrl, 'pointerdown');
    await new Promise((resolve) => setTimeout(resolve, KEY_BAR_LONG_PRESS_MS + 50));
    pointer(ctrl, 'pointerup');
    fixture.detectChanges();
    expect(ctrl.getAttribute('data-state')).toBe('locked');
    expect(host.modifiers.stateOf('ctrl')).toBe('locked');
  });

  it('keeps a latch visible on the strip, even collapsed', () => {
    tap(key('ctrl'));
    host.expanded.set(false);
    fixture.detectChanges();
    expect(el().querySelector('.key')).toBeNull();
    const latch = strip().querySelector('.latch');
    expect(latch?.textContent?.trim()).toBe('ctrl');
    expect(latch?.getAttribute('data-state')).toBe('armed');
  });

  it('reads as its keycaps at rest, never blank', () => {
    expect(strip().textContent?.trim()).toBe(DEFAULT_KEY_BAR_CELLS.map((c) => c.label).join(' '));
  });

  it('toggles from the strip, by tap and by keyboard', () => {
    expect(strip().getAttribute('aria-expanded')).toBe('true');
    tap(strip());
    strip().dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 0 }));
    expect(host.toggles).toBe(2);
  });

  it('ignores the click a pointer tap also fires', () => {
    tap(key('tab'));
    key('tab').dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
    expect(host.sent).toEqual([['tab']]);
  });

  it('names glyph keycaps by the keys they send', () => {
    expect(key('up').getAttribute('aria-label')).toBe('up');
    expect(key('ctrl-b').getAttribute('aria-label')).toBe('ctrl+b');
  });

  it('reports a reserve of at least its own height', () => {
    expect(host.reserve).toBeGreaterThan(0);
  });

  describe('settle pass after focus moves', () => {
    type FakeViewport = EventTarget & { height: number; offsetTop: number; scale: number };
    let fake: FakeViewport;
    let original: PropertyDescriptor | undefined;
    const frames = (n: number) =>
      new Promise<void>((resolve) => {
        const step = (left: number) =>
          left === 0 ? resolve() : requestAnimationFrame(() => step(left - 1));
        step(n);
      });
    const bar = () => el().querySelector<HTMLElement>('app-key-bar')!;

    beforeEach(() => {
      original = Object.getOwnPropertyDescriptor(window, 'visualViewport');
      fake = Object.assign(new EventTarget(), {
        height: window.innerHeight,
        offsetTop: 0,
        scale: 1,
      });
      Object.defineProperty(window, 'visualViewport', { value: fake, configurable: true });
    });

    afterEach(() => {
      if (original) Object.defineProperty(window, 'visualViewport', original);
    });

    it('follows a keyboard that animates with no visualViewport event, and stops where it rests', async () => {
      document.dispatchEvent(new FocusEvent('focusin'));
      // The keyboard animates in steps and flaps, as Safari's timeline did —
      // and no resize/scroll event is dispatched at all.
      for (const height of [0.9, 0.5, 1, 0.5, 0.6].map((f) => Math.round(window.innerHeight * f))) {
        fake.height = height;
        await frames(3);
      }
      await frames(SETTLE_STABLE_FRAMES + 4);
      fixture.detectChanges();

      const expected = occludedBottom(window.innerHeight, fake);
      expect(expected).toBeGreaterThan(0);
      expect(bar().style.transform).toBe(`translateY(${-expected}px)`);
    });

    it('settles on the same value the visualViewport events produce', async () => {
      fake.height = Math.round(window.innerHeight * 0.55);
      // The event path: the listeners bound at init run the same `place()`.
      window.dispatchEvent(new Event('resize'));
      fixture.detectChanges();
      const byEvent = bar().style.transform;
      expect(byEvent).not.toBe('translateY(0px)');

      document.dispatchEvent(new FocusEvent('focusin'));
      fake.height = Math.round(window.innerHeight * 0.7);
      await frames(2);
      fake.height = Math.round(window.innerHeight * 0.55);
      await frames(SETTLE_STABLE_FRAMES + 4);
      fixture.detectChanges();
      expect(bar().style.transform).toBe(byEvent);
    });

    it('does not spin when nothing moves: it stops by the ceiling', async () => {
      const raf = spyOn(window, 'requestAnimationFrame').and.callThrough();
      document.dispatchEvent(new FocusEvent('focusin'));
      await new Promise((resolve) => setTimeout(resolve, SETTLE_CEILING_MS + 300));
      const calls = raf.calls.count();
      await new Promise((resolve) => setTimeout(resolve, 300));
      expect(raf.calls.count()).toBe(calls);
    });
  });

  describe('occludedBottom', () => {
    it('is the keyboard height when the visual viewport shrank', () => {
      expect(occludedBottom(844, { height: 508, offsetTop: 0 })).toBe(336);
    });

    it('accounts for a slid layout viewport', () => {
      expect(occludedBottom(844, { height: 508, offsetTop: 120 })).toBe(216);
    });

    it('is zero with no keyboard, with a layout viewport that shrank too, or with no API', () => {
      expect(occludedBottom(844, { height: 844, offsetTop: 0 })).toBe(0);
      expect(occludedBottom(508, { height: 508, offsetTop: 0 })).toBe(0);
      expect(occludedBottom(844, { height: 900, offsetTop: 0 })).toBe(0);
      expect(occludedBottom(844, null)).toBe(0);
    });
  });
});
