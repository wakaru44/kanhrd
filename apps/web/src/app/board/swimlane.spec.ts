import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { AgentStatus, Pane } from '@kanhrd/schema';
import { COPY } from '../shared/copy';
import type { Swimlane as SwimlaneBand } from '../state/panes.store';
import { PanesStore } from '../state/panes.store';
import { boardColumnRefs } from './column';
import type { ParkedColumn } from '../state/parked.store';
import { CHECKOUT_LABEL_MAX, Swimlane, bandLabels, pageIndex } from './swimlane';

/** The cards inside the band's columns reach for the store; nothing here calls it. */
class FakePanesStore {
  readonly closePane = jasmine.createSpy('closePane');
  readonly splitPane = jasmine.createSpy('splitPane');
}

/**
 * The band's own unit tests. Grouping itself lives in `panes.store.spec.ts`
 * — what is under test here is the view's half of the contract: which
 * heading a band shows (copy, host qualification, path elision), what a
 * band counts, and what it must never render.
 */

function paneAt(status: AgentStatus, id: string): Pane {
  return {
    id,
    host: 'local',
    workspace: { id: 'w1', name: 'local' },
    tab: { id: 't1', name: 'main' },
    agent_status: status,
  } as Pane;
}

function band(
  key: string,
  label: string,
  panes: Partial<Record<AgentStatus, Pane[]>> = {},
  parked: ReadonlyMap<string, Pane[]> = new Map()
): SwimlaneBand {
  return {
    key,
    label,
    columns: {
      idle: [],
      working: [],
      blocked: [],
      done: [],
      unknown: [],
      ...panes,
    },
    parked,
  };
}

describe('swimlane: band headings', () => {
  it('names the no-project band from copy, whatever label the store left on it', () => {
    const [resolved] = bandLabels([band('ungrouped', '')], 'repository');
    expect(resolved!.label).toBe(COPY.swimlane.ungrouped);
    expect(resolved!.title).toBeNull();
  });

  it('leaves an unambiguous label exactly as the store wrote it', () => {
    const labels = bandLabels([band('local', 'local'), band('remote', 'remote')], 'host');
    expect(labels.map((l) => l.label)).toEqual(['local', 'remote']);
  });

  it('qualifies a colliding tab name with its host, and only the colliding ones', () => {
    const labels = bandLabels(
      [band('local:t1', 'main'), band('remote:t2', 'main'), band('local:t3', 'review')],
      'tab'
    );
    // Two `main` tabs on two hosts would otherwise render two identical,
    // adjacent headings; `review` is unique and stays bare.
    expect(labels.map((l) => l.label)).toEqual(['local / main', 'remote / main', 'review']);
  });

  it('elides a long checkout path at the HEAD, keeping the distinguishing tail', () => {
    const long = `~/very/long/working/root/that/goes/on${'/deeper'.repeat(4)}/aservice`;
    expect(long.length).toBeGreaterThan(CHECKOUT_LABEL_MAX);

    const [resolved] = bandLabels([band(long, long)], 'checkout');
    expect(resolved!.label.startsWith('…')).toBeTrue();
    expect(resolved!.label.endsWith('/aservice'))
      .withContext('the tail tells checkouts apart')
      .toBeTrue();
    // The whole path stays reachable rather than being thrown away.
    expect(resolved!.title).toBe(long);
  });

  it('leaves a short checkout path whole, with no tooltip to explain it', () => {
    const [resolved] = bandLabels([band('~/src/kanhrd', '~/src/kanhrd')], 'checkout');
    expect(resolved!.label).toBe('~/src/kanhrd');
    expect(resolved!.title).toBeNull();
  });
});

describe('swimlane: paging arithmetic', () => {
  it('pageIndex rounds a settled scroll position to a whole page', () => {
    expect(pageIndex(0, 390)).toBe(0);
    expect(pageIndex(390, 390)).toBe(1);
    expect(pageIndex(600, 390)).toBe(2);
  });

  it('pageIndex is 0 before the strip has a width', () => {
    expect(pageIndex(120, 0)).toBe(0);
  });
});

describe('Swimlane component', () => {
  let fixture: ComponentFixture<Swimlane>;

  const STATUSES: readonly AgentStatus[] = ['working', 'blocked', 'idle', 'done', 'unknown'];

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Swimlane],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        { provide: PanesStore, useValue: new FakePanesStore() },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(Swimlane);
    fixture.componentRef.setInput(
      'lane',
      band('local', 'local', {
        working: [paneAt('working', 'p1'), paneAt('working', 'p2')],
        blocked: [paneAt('blocked', 'p3')],
      })
    );
    fixture.componentRef.setInput('label', 'local');
    fixture.componentRef.setInput('columns', boardColumnRefs(STATUSES, []));
    fixture.componentRef.setInput('capabilities', new Map());
    fixture.detectChanges();
  });

  function el(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  it('renders one column per visible status — whatever set it is handed', () => {
    expect(el().querySelectorAll('app-column').length).toBe(5);

    fixture.componentRef.setInput('columns', boardColumnRefs(['working', 'blocked'], []));
    fixture.detectChanges();
    expect(el().querySelectorAll('app-column').length)
      .withContext('nothing here assumes five status columns')
      .toBe(2);
  });

  it('counts only its own cards, across the visible columns', () => {
    expect(el().querySelector('.swimlane-count')?.textContent?.trim()).toBe('3');
  });

  it('shows the heading it is handed, not the raw band label', () => {
    fixture.componentRef.setInput('label', COPY.swimlane.ungrouped);
    fixture.detectChanges();
    expect(el().querySelector('.swimlane-title')?.textContent?.trim()).toBe(
      COPY.swimlane.ungrouped
    );
  });

  it('renders every parked column in the band, empty ones included', () => {
    const archived: ParkedColumn = { id: 'p1', name: 'archived', exitRule: 'never', order: 0 };
    const parking: ParkedColumn = {
      id: 'p2',
      name: 'parking',
      exitRule: 'agent-activity',
      order: 1,
    };
    fixture.componentRef.setInput(
      'lane',
      band(
        'local',
        'local',
        { working: [paneAt('working', 'p1')] },
        new Map([
          ['p1', [paneAt('idle', 'p9')]],
          ['p2', []],
        ])
      )
    );
    fixture.componentRef.setInput('columns', boardColumnRefs(STATUSES, [archived, parking]));
    fixture.detectChanges();

    const columns = Array.from(el().querySelectorAll('.column'));
    expect(columns.length).toBe(7);
    // Parked columns come after `unknown`, in the operator's order, and the
    // empty one keeps its slot.
    expect(columns.slice(5).map((c) => c.getAttribute('data-parked'))).toEqual(['p1', 'p2']);
    expect(columns[5].querySelector('.column-title')?.textContent?.trim()).toBe('archived');
    expect(columns[6].querySelector('.count')?.textContent?.trim()).toBe('0');
    // The band counts its parked cards too — one working card plus one parked.
    expect(el().querySelector('.swimlane-count')?.textContent?.trim()).toBe('2');
  });

  it('exposes no drag handle, no enabled drop list and nothing draggable', () => {
    // The band itself is never draggable and never a drop target; with no
    // parked column its columns' lists are all disabled (Q1's amended rule).
    expect(el().querySelector("[draggable='true']")).toBeNull();
    expect(el().querySelector('.drag-handle')).toBeNull();
    expect(el().querySelector('.swimlane.cdk-drag, .swimlane.cdk-drop-list')).toBeNull();
    for (const list of Array.from(el().querySelectorAll('.cdk-drop-list'))) {
      expect(list.classList.contains('cdk-drop-list-disabled')).toBeTrue();
    }
  });
});
