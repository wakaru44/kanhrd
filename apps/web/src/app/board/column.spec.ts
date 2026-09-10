import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { CdkVirtualScrollViewport } from '@angular/cdk/scrolling';
import { provideRouter } from '@angular/router';
import type { AgentStatus, BridgeCapabilities, Pane } from '@kanhrd/schema';
import { COMPACT_THRESHOLD, Column, VIRTUALIZE_THRESHOLD, VIRTUAL_ITEM_SIZE } from './column';
import { PanesStore } from '../state/panes.store';

/**
 * Section 17.5, in the DOM. `board.spec.ts` proves the two thresholds as
 * arithmetic (`isCompact` / `isVirtualized`); this proves the column
 * actually changes shape when they are crossed, that the header count keeps
 * reporting the complete collection once rows are virtualized, and that a
 * card focused with the keyboard is not silently swallowed when
 * `cdkVirtualFor` recycles its view.
 *
 * The 20 -> 21 boundary is asserted here only in the form that holds at the
 * karma viewport. Karma's context iframe is narrower than
 * `--breakpoint-mobile`, where compact is MANDATORY at any count
 * (`isCompact(n, true)` is always true, and `mobileViewportSignal()` is a
 * module-level memo of a live `matchMedia`, so a spec cannot widen it).
 * The count-driven half of that boundary is proven as arithmetic in
 * `board.spec.ts` ("compact at > 20 and virtualization at > 50 are distinct
 * thresholds"); what is proven here is that the column really does render
 * every row compact below the breakpoint.
 */

class FakePanesStore {
  readonly closePane = jasmine.createSpy('closePane');
  readonly splitPane = jasmine.createSpy('splitPane');
}

function panes(count: number, status: AgentStatus = 'working'): Pane[] {
  return Array.from({ length: count }, (_unused, index) => ({
    id: `pane-${index}`,
    host: 'laptop',
    workspace: { id: 'w1', name: 'kanhrd' },
    tab: { id: 't1', name: 'main' },
    agent_status: status,
    agent: { name: `agent-${index}` },
  }));
}

/**
 * Tier-2 only: the cards need `terminal` so each one renders its opening
 * `<a>` — that link is the focusable the column restores after recycling.
 * No tier-3 flags, because these specs are about geometry, not actions.
 */
function capabilities(): ReadonlyMap<string, BridgeCapabilities> {
  const tier2 = {
    tier: 2,
    terminal: true,
    outputPollIntervalMs: 150,
  } as unknown as BridgeCapabilities;
  return new Map([['laptop', tier2]]);
}

describe('Column', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Column],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        { provide: PanesStore, useValue: new FakePanesStore() },
      ],
    }).compileComponents();
  });

  async function render(count: number): Promise<ComponentFixture<Column>> {
    const fixture = TestBed.createComponent(Column);
    // The virtual viewport derives its rendered range from its own measured
    // box, and a detached fixture has none until it is given one.
    const host = fixture.nativeElement as HTMLElement;
    host.style.display = 'block';
    host.style.height = '600px';
    fixture.componentRef.setInput('status', 'working');
    fixture.componentRef.setInput('panes', panes(count));
    fixture.componentRef.setInput('capabilities', capabilities());
    fixture.detectChanges();

    const viewport = fixture.debugElement.query(By.directive(CdkVirtualScrollViewport));
    if (viewport) {
      (viewport.nativeElement as HTMLElement).style.height = '600px';
      viewport.injector.get(CdkVirtualScrollViewport).checkViewportSize();
      // The CDK measures and emits its rendered range outside change
      // detection; the rows exist one macrotask later, not synchronously.
      await new Promise((resolve) => setTimeout(resolve, 0));
      fixture.detectChanges();
    }
    return fixture;
  }

  function el(fixture: ComponentFixture<Column>): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  // --- density boundary: 20 -> 21 ----------------------------------------

  it('renders below the mobile breakpoint, where compact is mandatory', async () => {
    // Guards the premise of the two tests below: if karma ever ran wide,
    // they would be asserting the desktop rule while claiming the mobile one.
    expect(window.matchMedia('(max-width: 900px)').matches).toBeTrue();
  });

  it('renders every card compact below the breakpoint, at and past the count threshold', async () => {
    for (const count of [COMPACT_THRESHOLD, COMPACT_THRESHOLD + 1]) {
      const root = el(await render(count));
      const cards = root.querySelectorAll('app-card');

      expect(cards.length).withContext(String(count)).toBe(count);
      expect(root.querySelectorAll('app-card.compact').length)
        .withContext(String(count))
        .toBe(count);
      expect(root.querySelector('.column')?.classList.contains('compact'))
        .withContext(String(count))
        .toBeTrue();
    }
  });

  it('renders a small column compact too, because the breakpoint outranks the count', async () => {
    const root = el(await render(3));
    expect(root.querySelectorAll('app-card.compact').length).toBe(3);
  });

  // --- virtualization boundary: 50 -> 51 ---------------------------------

  it('renders every card in the DOM at exactly the virtualization threshold', async () => {
    const root = el(await render(VIRTUALIZE_THRESHOLD));

    expect(root.querySelector('cdk-virtual-scroll-viewport')).toBeNull();
    expect(root.querySelectorAll('app-card').length).toBe(VIRTUALIZE_THRESHOLD);
  });

  it('switches to a virtual viewport one card past the threshold', async () => {
    const root = el(await render(VIRTUALIZE_THRESHOLD + 1));
    const viewport = root.querySelector('cdk-virtual-scroll-viewport');

    expect(viewport).toBeTruthy();
    // Virtualized means fewer rendered rows than panes — that is the point.
    expect(root.querySelectorAll('app-card').length).toBeLessThan(VIRTUALIZE_THRESHOLD + 1);
    expect(root.querySelectorAll('app-card').length).toBeGreaterThan(0);
  });

  it('counts the complete collection in the header, not the rendered range', async () => {
    const root = el(await render(VIRTUALIZE_THRESHOLD + 1));

    expect(root.querySelector('.count')?.textContent?.trim()).toBe(
      String(VIRTUALIZE_THRESHOLD + 1)
    );
    expect(root.querySelectorAll('app-card').length).toBeLessThan(VIRTUALIZE_THRESHOLD + 1);
  });

  it('pins the virtualized row box to the itemSize it promised the CDK', async () => {
    const root = el(await render(VIRTUALIZE_THRESHOLD + 1));
    const card = root.querySelector('.cdk-virtual-scroll-content-wrapper app-card');
    expect(card).toBeTruthy();

    const style = getComputedStyle(card as Element);
    const height = Number.parseFloat(style.height);
    const gap = Number.parseFloat(style.marginBottom);
    expect(height + gap).toBe(VIRTUAL_ITEM_SIZE);
  });

  it('is compact on every virtualized row, since virtualization only happens past the compact threshold', async () => {
    const root = el(await render(VIRTUALIZE_THRESHOLD + 1));
    const cards = Array.from(root.querySelectorAll('app-card'));

    expect(cards.length).toBeGreaterThan(0);
    for (const card of cards) {
      expect(card.classList.contains('compact')).toBeTrue();
    }
  });

  // --- keyboard focus survives recycling ---------------------------------

  it('gives every card a stable identity attribute for focus restoration', async () => {
    const root = el(await render(VIRTUALIZE_THRESHOLD + 1));
    const keys = Array.from(root.querySelectorAll('app-card')).map((c) =>
      c.getAttribute('data-pane')
    );

    expect(keys.every((key) => key?.startsWith('laptop:pane-'))).toBeTrue();
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('restores focus to the same card after a scroll recycles its view', async () => {
    const fixture = await render(VIRTUALIZE_THRESHOLD + 1);
    const root = el(fixture);
    const viewport = root.querySelector('cdk-virtual-scroll-viewport') as HTMLElement;
    const card = root.querySelector('app-card') as HTMLElement;
    const key = card.getAttribute('data-pane');
    const focusable = card.querySelector<HTMLElement>('a[href], button');
    expect(focusable).withContext('a card must expose something focusable').toBeTruthy();

    focusable!.focus();
    expect(document.activeElement).toBe(focusable!);

    // Scrolling, then losing focus to nothing, is exactly the recycling
    // signature the column watches for (a deliberate move away carries a
    // relatedTarget and is left alone).
    viewport.dispatchEvent(new Event('scroll'));
    focusable!.blur();
    card.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: null }));
    expect(document.activeElement).toBe(document.body);

    viewport.dispatchEvent(new Event('scroll'));
    await new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));

    const restored = document.activeElement as HTMLElement;
    expect(restored.closest('app-card')?.getAttribute('data-pane')).toBe(key);
  });

  it('leaves a deliberate focus move alone', async () => {
    const fixture = await render(VIRTUALIZE_THRESHOLD + 1);
    const root = el(fixture);
    const viewport = root.querySelector('cdk-virtual-scroll-viewport') as HTMLElement;
    const card = root.querySelector('app-card') as HTMLElement;
    const focusable = card.querySelector<HTMLElement>('a[href], button')!;

    const elsewhere = document.createElement('button');
    document.body.appendChild(elsewhere);

    focusable.focus();
    viewport.dispatchEvent(new Event('scroll'));
    elsewhere.focus();
    card.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: elsewhere }));

    viewport.dispatchEvent(new Event('scroll'));
    await new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));

    expect(document.activeElement).toBe(elsewhere);
    elsewhere.remove();
  });

  // --- empty column keeps its slot ---------------------------------------

  it('keeps its header and a zero count when it has no cards, with no prose', async () => {
    const root = el(await render(0));

    expect(root.querySelector('.column-header')).toBeTruthy();
    expect(root.querySelector('.count')?.textContent?.trim()).toBe('0');
    expect(root.querySelectorAll('app-card').length).toBe(0);
    expect(root.querySelector('.column-body')?.classList.contains('is-empty')).toBeTrue();
    expect(root.textContent?.replace(/working|0/g, '').trim()).toBe('');
  });
});
