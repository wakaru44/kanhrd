import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { Pane } from '@kanhrd/schema';
import { CardSwitcher } from './card-switcher';
import { COPY, fill } from '../shared/copy';

function pane(id: string, over: Partial<Pane> = {}): Pane {
  return {
    id,
    host: 'laptop',
    workspace: { id: 'w1', name: 'kanhrd' },
    tab: { id: 't1', name: 'build' },
    agent_status: 'idle',
    ...over,
  };
}

describe('CardSwitcher', () => {
  let fixture: ComponentFixture<CardSwitcher>;

  async function render(siblings: Pane[], currentId: string): Promise<HTMLElement> {
    await TestBed.configureTestingModule({
      imports: [CardSwitcher],
      providers: [provideZonelessChangeDetection(), provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(CardSwitcher);
    fixture.componentRef.setInput('siblings', siblings);
    fixture.componentRef.setInput('currentId', currentId);
    // Attached to the document: focus and :focus-visible are meaningless detached.
    document.body.appendChild(fixture.nativeElement as HTMLElement);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  afterEach(() => {
    (fixture?.nativeElement as HTMLElement | undefined)?.remove();
    TestBed.resetTestingModule();
  });

  function entries(el: HTMLElement): HTMLAnchorElement[] {
    return Array.from(el.querySelectorAll<HTMLAnchorElement>('a.entry'));
  }

  it('renders one entry per sibling, in the order it was given', async () => {
    const el = await render([pane('a'), pane('b'), pane('c')], 'b');

    expect(entries(el).map((a) => a.getAttribute('href'))).toEqual([
      '/pane/laptop/a',
      '/pane/laptop/b',
      '/pane/laptop/c',
    ]);
  });

  it('marks the current card, and only it', async () => {
    const el = await render([pane('a'), pane('b')], 'b');
    const [first, second] = entries(el);

    expect(second.getAttribute('aria-current')).toBe('page');
    expect(second.classList).toContain('current');
    expect(first.getAttribute('aria-current')).toBeNull();
    // Roving tabindex: one stop in the tab order, and it is the current card.
    expect(first.getAttribute('tabindex')).toBe('-1');
    expect(second.getAttribute('tabindex')).toBe('0');
  });

  it('names the strip and every entry from copy.ts, carrying the status word', async () => {
    const el = await render(
      [pane('a', { agent_status: 'blocked', title: 'migrate' }), pane('b')],
      'b'
    );

    expect(el.querySelector('.card-switcher')?.getAttribute('aria-label')).toBe(
      COPY.nav.cardSwitcher
    );
    // Status is never the dot's colour alone.
    expect(entries(el)[0].getAttribute('aria-label')).toBe(
      fill(COPY.nav.cardSwitcherItem, { name: 'migrate', status: COPY.status.blocked })
    );
  });

  it("names each entry with the same precedence the header title uses — the operator's label first", async () => {
    const el = await render(
      [pane('a', { label: 'fix the storm', agent: { name: 'claude' } })],
      'a'
    );

    expect(el.querySelector('.entry-name')?.textContent?.trim()).toBe('fix the storm');
  });

  it('moves focus with the arrow keys and Home/End without navigating', async () => {
    const el = await render([pane('a'), pane('b'), pane('c')], 'a');
    const strip = el.querySelector('.card-switcher') as HTMLElement;
    const items = entries(el);
    items[0].focus();

    const press = (key: string): boolean => {
      const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
      strip.dispatchEvent(event);
      fixture.detectChanges();
      return event.defaultPrevented;
    };

    expect(press('ArrowRight')).toBeTrue();
    expect(document.activeElement).toBe(items[1]);
    expect(press('End')).toBeTrue();
    expect(document.activeElement).toBe(items[2]);
    expect(press('ArrowRight')).toBeTrue();
    expect(document.activeElement).toBe(items[0]);
    expect(press('ArrowLeft')).toBeTrue();
    expect(document.activeElement).toBe(items[2]);
    expect(press('Home')).toBeTrue();
    expect(document.activeElement).toBe(items[0]);

    // Focus only: the route marker has not moved and no entry was activated.
    expect(el.querySelector('[aria-current="page"]')).toBe(items[0]);
  });

  it('navigates on Enter by being a link, not by a handler that could disagree with the href', async () => {
    const el = await render([pane('a'), pane('b')], 'a');

    for (const entry of entries(el)) {
      expect(entry.tagName).toBe('A');
      expect(entry.getAttribute('href')).toBeTruthy();
    }
  });

  it('activates the focused entry on Space', async () => {
    const el = await render([pane('a'), pane('b')], 'a');
    const items = entries(el);
    const clicked = spyOn(items[1], 'click');
    items[1].focus();

    const event = new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true });
    (el.querySelector('.card-switcher') as HTMLElement).dispatchEvent(event);

    expect(event.defaultPrevented).toBeTrue();
    expect(clicked).toHaveBeenCalled();
  });

  it('hands the keyboard back on Escape, and closes nothing else on the way', async () => {
    const el = await render([pane('a'), pane('b')], 'a');
    let escaped = 0;
    fixture.componentInstance.escaped.subscribe(() => (escaped += 1));
    entries(el)[0].focus();

    // The app's own Escape handling lives on a window listener; standing in
    // for it here proves the strip's Escape is scoped and closes nothing else.
    const global = jasmine.createSpy('global escape');
    window.addEventListener('keydown', global);

    const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    (el.querySelector('.card-switcher') as HTMLElement).dispatchEvent(event);
    window.removeEventListener('keydown', global);

    expect(escaped).toBe(1);
    expect(global).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBeTrue();
  });

  it('scrolls sideways inside the strip, never widening the page', async () => {
    const el = await render(
      Array.from({ length: 12 }, (_, i) =>
        pane(`p${i}`, { title: `a rather long card name ${i}` })
      ),
      'p0'
    );
    const strip = el.querySelector('.strip') as HTMLElement;

    expect(getComputedStyle(strip).overflowX).toBe('auto');
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(
      document.documentElement.clientWidth
    );
  });

  it('keeps every entry at the touch minimum under a coarse pointer', async () => {
    // karma's headless Chrome reports a fine pointer, so the rule is
    // asserted against the compiled stylesheet rather than a computed box.
    // The Playwright `mobile` project measures the real one.
    await render([pane('a'), pane('b')], 'a');
    const styles = (
      (CardSwitcher as unknown as { ɵcmp: { styles?: string[] } }).ɵcmp.styles ?? []
    ).join('');

    expect(styles).toContain('pointer: coarse');
    expect(styles).toContain('var(--touch-target-min)');
  });
});
