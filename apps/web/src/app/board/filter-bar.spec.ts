import { provideZonelessChangeDetection, signal, type WritableSignal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import type { AgentStatus } from '@kanhrd/schema';
import { FilterBar } from './filter-bar';
import { PanesStore, defaultFilters, type Filters } from '../state/panes.store';
import { SettingsService } from '../state/settings.service';
import { COPY } from '../shared/copy';
import { WsClient } from '../state/ws-client';

/**
 * The status chips each carry a live pane count trailing the label — see
 * `docs/UX-GUIDELINES.md` "Status chip counts". The count must survive a
 * chip being toggled off (only the label gets the strike-through), and it
 * has to reflect the store's own scope- and host-filtered totals, ignoring
 * the status-visibility filter it itself controls.
 */

type StatusCounts = Record<AgentStatus, number>;

class FakePanesStore {
  readonly hostsSignal = signal<{ name: string; connected: boolean; last_error?: string | null }[]>(
    []
  );
  readonly filtersSignal: WritableSignal<Filters> = signal(defaultFilters());
  readonly statusCountsSignal: WritableSignal<StatusCounts> = signal({
    working: 0,
    blocked: 0,
    idle: 0,
    done: 0,
    unknown: 0,
  });
  toggleHost = jasmine.createSpy('toggleHost');
  toggleStatus = jasmine.createSpy('toggleStatus');
}

describe('FilterBar status chip counts', () => {
  let fixture: ComponentFixture<FilterBar>;
  let store: FakePanesStore;

  beforeEach(async () => {
    store = new FakePanesStore();
    await TestBed.configureTestingModule({
      imports: [FilterBar],
      providers: [
        provideZonelessChangeDetection(),
        { provide: PanesStore, useValue: store },
        { provide: WsClient, useValue: {} },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(FilterBar);
    fixture.detectChanges();
  });

  function chip(status: AgentStatus): HTMLButtonElement {
    const el = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(
      `.status-chip[data-status="${status}"]`
    );
    if (!el) throw new Error(`no chip for ${status}`);
    return el;
  }

  function countText(status: AgentStatus): string {
    return chip(status).querySelector('.chip-count')?.textContent?.trim() ?? '';
  }

  it('renders a live count next to each status chip label', () => {
    store.statusCountsSignal.set({ working: 3, blocked: 1, idle: 7, done: 2, unknown: 0 });
    fixture.detectChanges();

    expect(countText('working')).toBe('3');
    expect(countText('blocked')).toBe('1');
    expect(countText('idle')).toBe('7');
    expect(countText('done')).toBe('2');
    // Zero-count chips still render "0" — watching the drop is the point.
    expect(countText('unknown')).toBe('0');
  });

  it('keeps the count visible and unstruck when the chip is toggled off', () => {
    store.statusCountsSignal.set({ working: 5, blocked: 0, idle: 0, done: 0, unknown: 0 });
    store.filtersSignal.set({
      excludedHosts: new Set(),
      hiddenStatuses: new Set<AgentStatus>(['working']),
    });
    fixture.detectChanges();

    const workingChip = chip('working');
    expect(workingChip.classList).toContain('excluded');
    expect(workingChip.getAttribute('aria-pressed')).toBe('false');

    const label = workingChip.querySelector<HTMLElement>('.chip-label');
    const count = workingChip.querySelector<HTMLElement>('.chip-count');
    expect(label).not.toBeNull();
    expect(count).not.toBeNull();
    expect(label!.textContent?.trim()).toBe('working');
    expect(count!.textContent?.trim()).toBe('5');
    // The strike-through is on the label element, never on the count.
    expect(label!.classList.contains('chip-count')).toBeFalse();
    expect(count!.classList.contains('chip-label')).toBeFalse();
  });

  it("updates the count reactively as the store's totals change", () => {
    store.statusCountsSignal.set({ working: 1, blocked: 0, idle: 0, done: 0, unknown: 0 });
    fixture.detectChanges();
    expect(countText('working')).toBe('1');

    store.statusCountsSignal.set({ working: 4, blocked: 0, idle: 0, done: 0, unknown: 0 });
    fixture.detectChanges();
    expect(countText('working')).toBe('4');
  });
});

/**
 * The `group by` control (openspec change `add-swimlane-grouping`, task
 * 3.2). It is a third chip row in the filter bar — a visible affordance the
 * operator reaches while reading the board, never an overflow menu and
 * never hover-only (docs/UX-GUIDELINES.md).
 */
describe('FilterBar group-by row', () => {
  let fixture: ComponentFixture<FilterBar>;
  let settings: SettingsService;

  const SETTINGS_STORAGE_KEY = 'kanhrd.settings';

  beforeEach(async () => {
    localStorage.removeItem(SETTINGS_STORAGE_KEY);
    await TestBed.configureTestingModule({
      imports: [FilterBar],
      providers: [
        provideZonelessChangeDetection(),
        { provide: PanesStore, useValue: new FakePanesStore() },
        { provide: WsClient, useValue: {} },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(FilterBar);
    settings = TestBed.inject(SettingsService);
    settings.setSwimlaneDimension('none');
    fixture.detectChanges();
  });

  afterEach(() => {
    settings.setSwimlaneDimension('none');
    localStorage.removeItem(SETTINGS_STORAGE_KEY);
  });

  function chips(): HTMLButtonElement[] {
    return Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('.group-chip')
    );
  }

  it('renders every dimension as a visible chip, labelled by the row', () => {
    expect(chips().map((c) => c.textContent?.trim())).toEqual([
      COPY.swimlane.none,
      COPY.swimlane.host,
      COPY.swimlane.repository,
      COPY.swimlane.checkout,
      COPY.swimlane.tab,
    ]);

    const row = (fixture.nativeElement as HTMLElement).querySelector('.group-row');
    expect(row?.getAttribute('aria-label')).toBe(COPY.swimlane.groupBy);
    expect(row?.querySelector('.row-label')?.textContent?.trim()).toBe(COPY.swimlane.groupBy);
  });

  it('is a keyboard-reachable button row, not a menu', () => {
    for (const chip of chips()) {
      expect(chip.tagName).toBe('BUTTON');
      expect(chip.getAttribute('type')).toBe('button');
      expect(chip.hasAttribute('disabled')).toBeFalse();
    }
  });

  it('marks the chosen dimension selected — exactly one at a time', () => {
    expect(chips().filter((c) => c.getAttribute('aria-pressed') === 'true').length).toBe(1);
    expect(chips()[0]!.classList).toContain('selected');

    chips()[1]!.click();
    fixture.detectChanges();

    expect(settings.settings().swimlaneDimension).toBe('host');
    expect(chips()[1]!.classList).toContain('selected');
    expect(chips()[0]!.classList).not.toContain('selected');
    expect(chips().filter((c) => c.getAttribute('aria-pressed') === 'true').length).toBe(1);
  });

  it('never strikes a chip through: this row is a choice, not five filters', () => {
    chips()[2]!.click();
    fixture.detectChanges();
    for (const chip of chips()) {
      expect(chip.classList).not.toContain('excluded');
    }
  });
});
