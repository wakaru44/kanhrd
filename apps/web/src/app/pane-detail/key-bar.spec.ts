import { Component, provideZonelessChangeDetection, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { KEY_BAR_LONG_PRESS_MS, KeyBar, occludedBottom } from './key-bar';
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
