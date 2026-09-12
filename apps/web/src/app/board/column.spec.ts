import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { CdkVirtualScrollViewport } from '@angular/cdk/scrolling';
import { provideRouter } from '@angular/router';
import type { AgentStatus, BridgeCapabilities, Pane } from '@kanhrd/schema';
import type { CdkDrag, CdkDragDrop, CdkDropList } from '@angular/cdk/drag-drop';
import {
  COMPACT_THRESHOLD,
  Column,
  VIRTUALIZE_THRESHOLD,
  VIRTUAL_ITEM_SIZE,
  canDrag,
  canReorderColumns,
  columnReorderDelta,
  firstParkedIndex,
  type BoardColumnRef,
} from './column';
import { PanesStore, defaultFilters } from '../state/panes.store';
import { PARKED_STORAGE_KEY, ParkedStore, type ParkedColumn } from '../state/parked.store';
import { COPY } from '../shared/copy';

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
  /**
   * The column reads the per-column filter chips (commit `2ecdf61`) to decide
   * which way a `move column` item may go: a hidden neighbour is stepped
   * over, so the store's hidden set is part of the column's contract now.
   */
  readonly filtersSignal = signal(defaultFilters());
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

  // --- the parked column header ------------------------------------------
  //
  // A parked column is the same column component with the operator's own
  // header: name, count, the exit rule as text, and one visible menu
  // trigger. The status header above must be untouched by all of it.

  function archived(overrides: Partial<ParkedColumn> = {}): ParkedColumn {
    return { id: 'p1', name: 'archived', exitRule: 'never', order: 0, ...overrides };
  }

  async function renderParked(column = archived()): Promise<ComponentFixture<Column>> {
    const fixture = TestBed.createComponent(Column);
    fixture.componentRef.setInput('parked', column);
    fixture.componentRef.setInput('panes', panes(1, 'idle'));
    fixture.componentRef.setInput('capabilities', capabilities());
    fixture.detectChanges();
    return fixture;
  }

  function menuOf(fixture: ComponentFixture<Column>): HTMLElement | null {
    const id = el(fixture).querySelector('.column-menu-trigger')?.getAttribute('aria-controls');
    return id ? document.getElementById(id) : null;
  }

  it("renders the operator's name and the exit rule as visible text", async () => {
    const fixture = await renderParked();
    const root = el(fixture);

    expect(root.querySelector('.column-title')?.textContent?.trim()).toBe('archived');
    expect(root.querySelector('.exit-rule')?.textContent?.trim()).toBe(COPY.park.rule.never);
    expect(root.querySelector('.column')?.getAttribute('data-parked')).toBe('p1');
    expect(root.querySelector('.column')?.getAttribute('data-status')).toBeNull();
  });

  it('carries no header menu or rule text on a status column', async () => {
    const root = el(await render(1));

    expect(root.querySelector('.exit-rule')).toBeNull();
    expect(root.querySelector('.column-menu-trigger')).toBeNull();
  });

  it('offers the menu trigger on first render, with no hover', async () => {
    const trigger = el(await renderParked()).querySelector<HTMLButtonElement>(
      '.column-menu-trigger'
    );

    expect(trigger).toBeTruthy();
    expect(trigger!.getAttribute('aria-haspopup')).toBe('menu');
    expect(trigger!.getAttribute('aria-expanded')).toBe('false');
    expect(getComputedStyle(trigger!).opacity).toBe('1');
  });

  it('opens a menu of the two rules, the two moves and remove, and marks the current rule', async () => {
    const fixture = await renderParked();
    el(fixture).querySelector<HTMLButtonElement>('.column-menu-trigger')!.click();
    fixture.detectChanges();

    const menu = menuOf(fixture)!;
    expect(menu.getAttribute('role')).toBe('menu');
    const items = Array.from(
      menu.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"], [role="menuitem"]')
    );
    expect(items.map((i) => i.textContent?.trim())).toEqual([
      COPY.park.renameColumn,
      COPY.park.rule.never,
      COPY.park.rule.agentActivity,
      COPY.park.moveColumnLeft,
      COPY.park.moveColumnRight,
      COPY.park.removeColumn,
    ]);
    const radios = Array.from(menu.querySelectorAll('[role="menuitemradio"]'));
    expect(radios.map((r) => r.getAttribute('aria-checked'))).toEqual(['true', 'false']);
  });

  it('completes a rule change by keyboard and returns focus to the trigger', async () => {
    localStorage.removeItem(PARKED_STORAGE_KEY);
    const parked = TestBed.inject(ParkedStore);
    const column = parked.createColumn('archived', 'never');
    const fixture = await renderParked({ ...archived(), id: column.id });
    const trigger = el(fixture).querySelector<HTMLButtonElement>('.column-menu-trigger')!;
    document.body.appendChild(el(fixture));

    trigger.click();
    fixture.detectChanges();
    const menu = menuOf(fixture)!;

    // Focus lands on the first item; arrows walk the radios like any item.
    expect(document.activeElement).toBe(menu.querySelector('[role="menuitem"]'));
    menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    (document.activeElement as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(parked.columns()[0].exitRule).toBe('agent-activity');
    expect(menuOf(fixture)).toBeFalsy();
    expect(document.activeElement).toBe(trigger);
    el(fixture).remove();
    localStorage.removeItem(PARKED_STORAGE_KEY);
  });

  it('dismisses the menu on Escape without changing anything', async () => {
    const fixture = await renderParked();
    const trigger = el(fixture).querySelector<HTMLButtonElement>('.column-menu-trigger')!;
    document.body.appendChild(el(fixture));

    trigger.click();
    fixture.detectChanges();
    menuOf(fixture)!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();

    expect(menuOf(fixture)).toBeFalsy();
    expect(document.activeElement).toBe(trigger);
    el(fixture).remove();
  });

  it('asks before removing a column, and says where the cards go', async () => {
    localStorage.removeItem(PARKED_STORAGE_KEY);
    const parked = TestBed.inject(ParkedStore);
    const column = parked.createColumn('archived', 'never');
    parked.park('laptop:pane-0', column.id);
    const fixture = await renderParked({ ...archived(), id: column.id });

    el(fixture).querySelector<HTMLButtonElement>('.column-menu-trigger')!.click();
    fixture.detectChanges();
    menuOf(fixture)!.querySelector<HTMLButtonElement>('.remove')!.click();
    fixture.detectChanges();

    const modal = el(fixture).querySelector('app-confirm-modal');
    expect(modal).toBeTruthy();
    expect(modal!.textContent).toContain(COPY.park.removeColumnBody);
    // No care verb, and nothing claiming an undo.
    expect(modal!.textContent).not.toMatch(/rest|undone|pause/);
    expect(parked.columns().length).withContext('not removed until confirmed').toBe(1);

    modal!.querySelector<HTMLButtonElement>('.btn.primary, .btn.danger')!.click();
    fixture.detectChanges();

    expect(parked.columns()).toEqual([]);
    expect(parked.columnOf('laptop:pane-0')).toBeNull();
    localStorage.removeItem(PARKED_STORAGE_KEY);
  });

  it("keeps an empty parked column's slot: header, count, no prose", async () => {
    const fixture = TestBed.createComponent(Column);
    fixture.componentRef.setInput('parked', archived());
    fixture.componentRef.setInput('panes', []);
    fixture.componentRef.setInput('capabilities', capabilities());
    fixture.detectChanges();
    const root = el(fixture);

    expect(root.querySelector('.column-header')).toBeTruthy();
    expect(root.querySelector('.count')?.textContent?.trim()).toBe('0');
    expect(root.querySelectorAll('app-card').length).toBe(0);
  });

  // --- rename (task 4.2) --------------------------------------------------

  it('renames a column from its header menu, seeded with the current name', async () => {
    localStorage.removeItem(PARKED_STORAGE_KEY);
    const parked = TestBed.inject(ParkedStore);
    const column = parked.createColumn('archived', 'never');
    const fixture = await renderParked({ ...archived(), id: column.id });

    el(fixture).querySelector<HTMLButtonElement>('.column-menu-trigger')!.click();
    fixture.detectChanges();
    menuOf(fixture)!.querySelector<HTMLButtonElement>('.rename')!.click();
    fixture.detectChanges();

    const modal = el(fixture).querySelector('app-rename-modal')!;
    expect(modal.querySelector('.modal-title')?.textContent?.trim()).toBe(COPY.park.renameColumn);
    const field = modal.querySelector<HTMLInputElement>('.field')!;
    expect(field.value).withContext('seeded with the name it has').toBe('archived');

    field.value = 'cold storage';
    field.dispatchEvent(new Event('input'));
    modal.querySelector<HTMLButtonElement>('.btn.primary')!.click();
    fixture.detectChanges();

    expect(parked.columns()[0].name).toBe('cold storage');
    expect(el(fixture).querySelector('app-rename-modal')).toBeFalsy();
    localStorage.removeItem(PARKED_STORAGE_KEY);
  });

  it('falls back to the default name rather than leaving a nameless column', async () => {
    localStorage.removeItem(PARKED_STORAGE_KEY);
    const parked = TestBed.inject(ParkedStore);
    const column = parked.createColumn('archived', 'never');
    const fixture = await renderParked({ ...archived(), id: column.id });

    el(fixture).querySelector<HTMLButtonElement>('.column-menu-trigger')!.click();
    fixture.detectChanges();
    menuOf(fixture)!.querySelector<HTMLButtonElement>('.rename')!.click();
    fixture.detectChanges();
    // `clear name` on a column is not a clear: a column always has a name.
    el(fixture).querySelectorAll<HTMLButtonElement>('app-rename-modal .btn')[1].click();
    fixture.detectChanges();

    expect(parked.columns()[0].name).toBe(COPY.park.defaultName);
    localStorage.removeItem(PARKED_STORAGE_KEY);
  });

  // --- drag and drop (task 5.2) -------------------------------------------
  //
  // The enabled half is arithmetic: karma's viewport is permanently below
  // `--breakpoint-mobile` (asserted at the top of this file), where drag
  // deliberately does not appear at all. What the DOM here can prove is the
  // other half — that the board with no parked column, and every board on a
  // phone, is inert — plus the two decisions that are this component's own:
  // who may receive a card, and what a drop does.

  interface ColumnInternals {
    enterPredicate(drag: CdkDrag, drop: CdkDropList): boolean;
    onCardDropped(event: CdkDragDrop<unknown>): void;
  }

  function internals(fixture: ComponentFixture<Column>): ColumnInternals {
    return fixture.componentInstance as unknown as ColumnInternals;
  }

  it('makes a card a drag source only with a parked column, and never on a phone', () => {
    expect(canDrag(false, false)).withContext('nothing to drag into').toBeFalse();
    expect(canDrag(true, true)).withContext('the pager owns the phone').toBeFalse();
    expect(canDrag(false, true)).toBeFalse();
    expect(canDrag(true, false)).toBeTrue();
  });

  it('leaves every list and every card inert where drag does not apply', async () => {
    const root = el(await render(3));
    const body = root.querySelector('.column-body')!;

    expect(body.classList.contains('cdk-drop-list')).withContext('a source list').toBeTrue();
    expect(body.classList.contains('cdk-drop-list-disabled')).toBeTrue();
    for (const card of Array.from(root.querySelectorAll('app-card'))) {
      expect(card.classList.contains('cdk-drag-disabled')).toBeTrue();
      expect(getComputedStyle(card).cursor).not.toBe('grab');
    }
  });

  it('refuses every foreign card on a status column, and only lets its own go home', async () => {
    const fixture = await render(1);
    const own = { dropContainer: {} } as unknown as CdkDrag;
    const home = own.dropContainer as unknown as CdkDropList;
    const foreign = { dropContainer: {} } as unknown as CdkDrag;

    expect(internals(fixture).enterPredicate(foreign, home))
      .withContext('a status column is never a drop target')
      .toBeFalse();
    expect(internals(fixture).enterPredicate(own, home))
      .withContext('a card released over its own column just goes home')
      .toBeTrue();
  });

  it('accepts any card on a parked column, and only a card', async () => {
    const fixture = await renderParked();
    const card = { dropContainer: {}, data: panes(1)[0] } as unknown as CdkDrag;
    const columnDrag = { dropContainer: {}, data: archived() } as unknown as CdkDrag;
    const elsewhereList = {} as unknown as CdkDropList;

    expect(internals(fixture).enterPredicate(card, elsewhereList)).toBeTrue();
    // The strip's column-reorder list is neither in this list's group nor
    // connected to it, so a column drag cannot reach here at all; requiring a
    // pane in `cdkDragData` makes that true independently of the wiring.
    expect(internals(fixture).enterPredicate(columnDrag, elsewhereList))
      .withContext('a column is not a card')
      .toBeFalse();
  });

  // --- column reorder (add-parked-column-reorder) -------------------------
  //
  // Same split as the card drag above: the enabled half of the drag is
  // arithmetic, because karma's viewport is permanently below
  // `--breakpoint-mobile`. What the DOM proves here is the keyboard path,
  // which exists at EVERY width, and that a status column is neither a
  // reorder source nor a handle.

  function refs(...keys: readonly string[]): readonly BoardColumnRef[] {
    return keys.map((key) =>
      key.startsWith('parked:')
        ? {
            key,
            label: key,
            status: null,
            parked: archived({ id: key.slice('parked:'.length) }),
          }
        : { key, label: key, status: 'idle' as const, parked: null }
    );
  }

  it('makes a column draggable only with two of them, and never on a phone', () => {
    expect(canReorderColumns(0, false)).withContext('nothing to rearrange').toBeFalse();
    expect(canReorderColumns(1, false)).withContext('one column is an order').toBeFalse();
    expect(canReorderColumns(2, true)).withContext('the pager owns the phone').toBeFalse();
    expect(canReorderColumns(2, false)).toBeTrue();
  });

  it('refuses every index left of the first parked column', () => {
    // The strip's sort predicate is `index >= firstParkedIndex`, so nothing
    // can come to rest among the status columns.
    expect(firstParkedIndex(refs('working', 'idle', 'parked:p1', 'parked:p2'))).toBe(2);
    expect(firstParkedIndex(refs('working', 'idle')))
      .withContext('no parked column')
      .toBe(2);
    expect(firstParkedIndex(refs('parked:p1'))).toBe(0);
  });

  it('reads a drop on the visible strip as a delta in the full stored order', () => {
    const visible = refs('working', 'parked:p1', 'parked:p3');
    // `p2` is hidden by its filter chip, so it is not in the strip at all;
    // the delta must still be measured against the full order.
    const order = ['p1', 'p2', 'p3'];

    expect(columnReorderDelta(visible, order, 1, 2)).toEqual({ id: 'p1', delta: 2 });
    expect(columnReorderDelta(visible, order, 2, 1)).toEqual({ id: 'p3', delta: -2 });
  });

  it('reads a drop that moved nothing, or moved a status column, as no move at all', () => {
    const visible = refs('working', 'parked:p1', 'parked:p2');
    const order = ['p1', 'p2'];

    expect(columnReorderDelta(visible, order, 1, 1)).toBeNull();
    expect(columnReorderDelta(visible, order, 1, 0))
      .withContext('onto a status column')
      .toBeNull();
    expect(columnReorderDelta(visible, order, 0, 2))
      .withContext('from a status column')
      .toBeNull();
    expect(columnReorderDelta(visible, order, 9, 1)).toBeNull();
  });

  it('moves the column from its header menu, and returns focus to the trigger', async () => {
    localStorage.removeItem(PARKED_STORAGE_KEY);
    const parked = TestBed.inject(ParkedStore);
    const first = parked.createColumn('archived', 'never');
    parked.createColumn('parking', 'never');
    const fixture = await renderParked({ ...archived(), id: first.id });
    const trigger = el(fixture).querySelector<HTMLButtonElement>('.column-menu-trigger')!;
    document.body.appendChild(el(fixture));

    trigger.click();
    fixture.detectChanges();
    menuOf(fixture)!.querySelector<HTMLButtonElement>('.move-right')!.click();
    fixture.detectChanges();

    expect(parked.columns().map((c) => c.name)).toEqual(['parking', 'archived']);
    expect(menuOf(fixture)).toBeFalsy();
    expect(document.activeElement).toBe(trigger);
    el(fixture).remove();
    localStorage.removeItem(PARKED_STORAGE_KEY);
  });

  it('marks the end of the row aria-disabled, and activating it does nothing', async () => {
    localStorage.removeItem(PARKED_STORAGE_KEY);
    const parked = TestBed.inject(ParkedStore);
    const first = parked.createColumn('archived', 'never');
    parked.createColumn('parking', 'never');
    const fixture = await renderParked({ ...archived(), id: first.id });

    el(fixture).querySelector<HTMLButtonElement>('.column-menu-trigger')!.click();
    fixture.detectChanges();
    const menu = menuOf(fixture)!;
    const left = menu.querySelector<HTMLButtonElement>('.move-left')!;

    expect(left.getAttribute('aria-disabled')).withContext('leftmost column').toBe('true');
    expect(menu.querySelector('.move-right')!.getAttribute('aria-disabled')).toBe('false');
    // Focusable on purpose: a real `disabled` button would swallow an arrow
    // key and trap the user on it (shared/menu-keys.ts walks what it finds).
    expect(left.hasAttribute('disabled')).toBeFalse();

    left.click();
    fixture.detectChanges();

    expect(parked.columns().map((c) => c.name)).toEqual(['archived', 'parking']);
    expect(menuOf(fixture)).withContext('a dead item does not even close the menu').toBeTruthy();
    localStorage.removeItem(PARKED_STORAGE_KEY);
  });

  it('steps a move over a column the filter bar has hidden', async () => {
    localStorage.removeItem(PARKED_STORAGE_KEY);
    const parked = TestBed.inject(ParkedStore);
    const first = parked.createColumn('archived', 'never');
    const hidden = parked.createColumn('hidden', 'never');
    parked.createColumn('parking', 'never');
    const panesStore = TestBed.inject(PanesStore) as unknown as FakePanesStore;
    panesStore.filtersSignal.set({
      ...defaultFilters(),
      hiddenColumns: new Set([`parked:${hidden.id}`]),
    });
    const fixture = await renderParked({ ...archived(), id: first.id });

    el(fixture).querySelector<HTMLButtonElement>('.column-menu-trigger')!.click();
    fixture.detectChanges();
    menuOf(fixture)!.querySelector<HTMLButtonElement>('.move-right')!.click();
    fixture.detectChanges();

    // Past the hidden column, not into a swap nobody could see.
    expect(parked.columns().map((c) => c.name)).toEqual(['hidden', 'parking', 'archived']);
    panesStore.filtersSignal.set(defaultFilters());
    localStorage.removeItem(PARKED_STORAGE_KEY);
  });

  it('gives a status column no drag handle at all', async () => {
    const status = el(await render(1));
    expect(status.querySelector('.column-header')!.classList.contains('cdk-drag-handle'))
      .withContext('a status column is never a reorder source')
      .toBeFalse();

    const parkedRoot = el(await renderParked());
    expect(
      parkedRoot.querySelector('.column-header')!.classList.contains('cdk-drag-handle')
    ).toBeTrue();
  });

  it('parks the dropped card, without touching anything on the host', async () => {
    localStorage.removeItem(PARKED_STORAGE_KEY);
    const parked = TestBed.inject(ParkedStore);
    const column = parked.createColumn('archived', 'never');
    const fixture = await renderParked({ ...archived(), id: column.id });

    internals(fixture).onCardDropped({
      previousContainer: {},
      container: {},
      item: { data: panes(1)[0] },
    } as unknown as CdkDragDrop<unknown>);

    expect(parked.columnOf('laptop:pane-0')).toBe(column.id);
    localStorage.removeItem(PARKED_STORAGE_KEY);
  });

  it('does nothing when a card is dropped back into the list it came from', async () => {
    localStorage.removeItem(PARKED_STORAGE_KEY);
    const parked = TestBed.inject(ParkedStore);
    const column = parked.createColumn('archived', 'never');
    const fixture = await renderParked({ ...archived(), id: column.id });
    const same = {};

    internals(fixture).onCardDropped({
      previousContainer: same,
      container: same,
      item: { data: panes(1)[0] },
    } as unknown as CdkDragDrop<unknown>);

    expect(parked.columnOf('laptop:pane-0')).toBeNull();
    localStorage.removeItem(PARKED_STORAGE_KEY);
  });

  it("never parks from a status column's own drop handler", async () => {
    localStorage.removeItem(PARKED_STORAGE_KEY);
    const parked = TestBed.inject(ParkedStore);
    parked.createColumn('archived', 'never');
    const fixture = await render(1);

    internals(fixture).onCardDropped({
      previousContainer: {},
      container: {},
      item: { data: panes(1)[0] },
    } as unknown as CdkDragDrop<unknown>);

    expect(parked.columnOf('laptop:pane-0'))
      .withContext("no drag ever changes a card's status")
      .toBeNull();
    localStorage.removeItem(PARKED_STORAGE_KEY);
  });
});
