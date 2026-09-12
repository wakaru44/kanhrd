import { provideZonelessChangeDetection, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { BehaviorSubject, EMPTY, Subject } from 'rxjs';
import type { AgentStatus, WsEvent } from '@kanhrd/schema';
import { Board, SCOPE_RESOLVE_GRACE_MS, nearestVisibleStatus, pageIndex } from './board';
import { BoardReturnService } from '../state/board-return.service';
import { COPY } from '../shared/copy';
import { VIRTUAL_ITEM_SIZE, focusCard, isCompact, isVirtualized } from './column';
import { ParkedStore, loadParked } from '../state/parked.store';
import { ClockTick } from '../util/clock';
import { PanesStore, STATUS_COLUMN_ORDER, defaultFilters } from '../state/panes.store';
import { WsClient } from '../state/ws-client';
import { SettingsService } from '../state/settings.service';
import { KeyboardService } from '../state/keyboard.service';

/**
 * Full-stack integration test for the "+ -> New tab" flow, covering the
 * layers `panes.store.spec.ts`'s reducer-level tests don't reach: the real
 * `Board`/`Rail`/`Card` component tree, template `@if`/`@for` re-rendering
 * off the real `PanesStore`, and the actual DOM Playwright's
 * `apps/web/e2e/tier3.spec.ts` queries (`.tab-row`, `.card`) — not just the
 * signals underneath them.
 */
class FakeWsClient {
  readonly connected = signal(true);
  readonly lastError = signal<string | null>(null);
  readonly events$ = new Subject<WsEvent>();
  connect(): void {
    // no-op: test drives `connected` directly.
  }
  request = jasmine.createSpy('request');
}

async function flushMicrotasks(): Promise<void> {
  for (let i = 0; i < 5; i++) {
    await Promise.resolve();
  }
}

/**
 * `PanesStore` persists filters to `localStorage['kanhrd.filters']` through
 * an effect, and `loadFilters()` reads them back in every later store. The
 * suites below deliberately hide statuses, so without this the last one to
 * run leaves hidden statuses behind and whichever suite jasmine schedules
 * next renders a board with columns missing — a real, order-dependent flake
 * (jasmine randomises spec order), not a slow render.
 *
 * Resetting `filtersSignal` is not enough: the persist effect may not have
 * flushed by teardown. The key itself has to go.
 */
const FILTERS_STORAGE_KEY = 'kanhrd.filters';

beforeEach(() => localStorage.removeItem(FILTERS_STORAGE_KEY));
afterEach(() => localStorage.removeItem(FILTERS_STORAGE_KEY));

/** Same helper as panes.store.spec.ts: lets root effects (PanesStore's, created in its own constructor) flush. */
async function settle(fixture: ComponentFixture<unknown>): Promise<void> {
  await flushMicrotasks();
  await new Promise((resolve) => setTimeout(resolve, 0));
  await flushMicrotasks();
  fixture.detectChanges();
}

describe('Board + Rail integration: New tab flow (full component tree)', () => {
  let ws: FakeWsClient;
  let fixture: ComponentFixture<Board>;
  let httpMock: HttpTestingController;
  let store: PanesStore;

  beforeEach(async () => {
    ws = new FakeWsClient();
    await TestBed.configureTestingModule({
      imports: [Board],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: WsClient, useValue: ws },
      ],
    }).compileComponents();
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('clicking + -> New tab grows tabsSignal/panesSignal by 1 AND renders a new .tab-row in the rail and a new .card on the board', async () => {
    ws.request.and.callFake((_host: string, method: string) => {
      if (method === 'pane.list') {
        // A real herdr host always has at least one pre-existing pane/tab/
        // workspace by the time the SPA loads (never a totally empty host)
        // — seed one so `workspacesSignal`/`tabsSignal` already have "w6"
        // before "New tab" is clicked, matching the real E2E environment.
        return Promise.resolve({
          panes: [
            {
              id: 'p-existing',
              host: 'local',
              workspace: { id: 'w6', name: 'kanhrd' },
              tab: { id: 't-existing', name: '1' },
              agent_status: 'idle',
            },
          ],
        });
      }
      if (method === 'events.subscribe') return Promise.resolve({ subscription_id: 's1' });
      if (method === 'bridge.capabilities') {
        return Promise.resolve({
          tier: 3,
          terminal: true,
          paneResize: false,
          paneGraphics: false,
          outputPollIntervalMs: 150,
          paneCreate: true,
          paneClose: true,
          paneMove: true,
          tabCrud: true,
          workspaceCrud: true,
        });
      }
      if (method === 'tab.create') {
        // Mirrors the real bridge's tab.create result shape (CONTRACT-TIER3.md
        // §3): the pane's tab.name is the tab's pre-rename auto label.
        return Promise.resolve({
          tab: { id: 't-new', host: 'local', workspace: { id: 'w6' }, name: '6' },
          pane: {
            id: 'p-new',
            host: 'local',
            workspace: { id: 'w6', name: 'kanhrd' },
            tab: { id: 't-new', name: '6' },
            agent_status: 'unknown',
          },
        });
      }
      return Promise.reject(new Error(`unexpected method ${method}`));
    });

    fixture = TestBed.createComponent(Board);
    store = TestBed.inject(PanesStore);
    fixture.detectChanges();
    await settle(fixture);

    for (const req of httpMock.match('/api/hosts')) {
      if (!req.cancelled) {
        req.flush({ hosts: [{ name: 'local', connected: true }] });
      }
    }
    await settle(fixture);

    const el = fixture.nativeElement as HTMLElement;
    const tabRowsBefore = el.querySelectorAll('.tab-row').length;
    const cardsBefore = el.querySelectorAll('.card').length;
    const panesBefore = store.panesSignal().size;
    const tabsBefore = store.tabsSignal().size;

    el.querySelector<HTMLButtonElement>('.plus-button')?.click();
    fixture.detectChanges();

    const newTabButton = Array.from(
      el.querySelectorAll<HTMLButtonElement>('.plus-menu button')
    ).find((btn) => btn.textContent?.trim() === COPY.create.tab);
    expect(newTabButton)
      .withContext(`"${COPY.create.tab}" should render once tabCrud capability is true`)
      .toBeTruthy();
    newTabButton?.click();
    fixture.detectChanges();

    await settle(fixture);

    expect(store.tabsSignal().size)
      .withContext('tabsSignal should grow by 1')
      .toBe(tabsBefore + 1);
    expect(store.panesSignal().size)
      .withContext('panesSignal should grow by 1')
      .toBe(panesBefore + 1);
    expect(el.querySelectorAll('.tab-row').length)
      .withContext('rail DOM should have one more .tab-row')
      .toBe(tabRowsBefore + 1);
    expect(el.querySelectorAll('.card').length)
      .withContext('board DOM should have one more .card')
      .toBe(cardsBefore + 1);
  });

  // The board's chrome used to inline its own strings: "Create", "New pane",
  // "New tab", "New workspace", "Clear scope" — Title Case, herdr's
  // vocabulary, and invisible to `copy.ts`. `style-lint.spec.ts` guards that
  // no literal came back; these guard what the user actually reads.

  /** Mounts the board against a host advertising every tier-3 create capability. */
  async function mountWithCreateCapabilities(): Promise<HTMLElement> {
    ws.request.and.callFake((_host: string, method: string) => {
      if (method === 'pane.list') {
        return Promise.resolve({
          panes: [
            {
              id: 'p-existing',
              host: 'local',
              workspace: { id: 'w6', name: 'kanhrd' },
              tab: { id: 't-existing', name: '1' },
              agent_status: 'idle',
            },
          ],
        });
      }
      if (method === 'events.subscribe') return Promise.resolve({ subscription_id: 's1' });
      return Promise.resolve({
        tier: 3,
        terminal: true,
        paneResize: false,
        paneGraphics: false,
        outputPollIntervalMs: 150,
        paneCreate: true,
        paneClose: true,
        paneMove: true,
        paneRename: true,
        tabCrud: true,
        workspaceCrud: true,
      });
    });

    fixture = TestBed.createComponent(Board);
    fixture.detectChanges();
    await settle(fixture);
    for (const req of httpMock.match('/api/hosts')) {
      if (!req.cancelled) {
        req.flush({ hosts: [{ name: 'local', connected: true }] });
      }
    }
    await settle(fixture);
    return fixture.nativeElement as HTMLElement;
  }

  it("labels the create menu from copy.ts, in herdr's vocabulary", async () => {
    const el = await mountWithCreateCapabilities();
    el.querySelector<HTMLButtonElement>('.plus-button')?.click();
    fixture.detectChanges();

    const labels = Array.from(el.querySelectorAll<HTMLButtonElement>('.plus-menu button')).map(
      (button) => button.textContent?.trim() ?? ''
    );
    expect(labels).toEqual([COPY.create.pane, COPY.create.tab, COPY.create.workspace]);
    for (const label of labels) {
      expect(label).withContext(`"${label}" must be lowercase`).toBe(label.toLowerCase());
      expect(label)
        .withContext(`"${label}" must speak herdr's vocabulary`)
        .not.toMatch(/\bpen\b|\bfield\b|\blane\b/);
    }
  });

  it('names the create trigger itself, rather than leaning on a title attribute', async () => {
    const trigger = (await mountWithCreateCapabilities()).querySelector('.plus-button');
    expect(trigger?.getAttribute('aria-label')).toBe(COPY.create.menu);
    expect(trigger?.getAttribute('title')).toBe(COPY.create.menu);
  });

  it("names the scope pill's clear control from the key that already existed", () => {
    // `emptyState.scopeEmptyAction` is the approved string for this action;
    // the pill had its own hand-typed "Clear scope" beside it.
    expect(COPY.emptyState.scopeEmptyAction).toBe('clear scope');
  });
});

describe('Board: two panes sharing one tab (split view) both render as separate cards', () => {
  // Regression per a real-world report: workspace w6, tab w6:t2 has TWO
  // panes side by side (a split tab, e.g. two Claude instances). herdr's
  // own `pane list` and the bridge's `pane.list`/REST both return all 4
  // panes across 3 tabs with distinct ids, sharing `tab.id: "w6:t2"` for
  // two of them — this reproduces that exact shape end to end through the
  // real Board/Column/Card component tree, not just the store signal.
  let ws: FakeWsClient;
  let fixture: ComponentFixture<Board>;
  let httpMock: HttpTestingController;
  let store: PanesStore;

  beforeEach(async () => {
    ws = new FakeWsClient();
    await TestBed.configureTestingModule({
      imports: [Board],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: WsClient, useValue: ws },
      ],
    }).compileComponents();
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('renders 4 cards for 4 panes across 3 tabs, including both panes sharing tab w6:t2', async () => {
    ws.request.and.callFake((_host: string, method: string) => {
      if (method === 'pane.list') {
        return Promise.resolve({
          panes: [
            {
              id: 'w6:p1',
              host: 'local',
              workspace: { id: 'w6', name: 'jmorales' },
              tab: { id: 'w6:t1', name: '1' },
              agent_status: 'idle',
            },
            {
              id: 'w6:p2',
              host: 'local',
              workspace: { id: 'w6', name: 'jmorales' },
              tab: { id: 'w6:t2', name: '2' },
              agent_status: 'working',
            },
            {
              id: 'w6:p90',
              host: 'local',
              workspace: { id: 'w6', name: 'jmorales' },
              tab: { id: 'w6:t2', name: '2' },
              agent_status: 'working',
            },
            {
              id: 'w6:pA1',
              host: 'local',
              workspace: { id: 'w6', name: 'jmorales' },
              tab: { id: 'w6:t26', name: '3' },
              agent_status: 'idle',
            },
          ],
        });
      }
      if (method === 'events.subscribe') return Promise.resolve({ subscription_id: 's1' });
      if (method === 'bridge.capabilities') {
        return Promise.resolve({
          tier: 3,
          terminal: true,
          paneResize: false,
          paneGraphics: false,
          outputPollIntervalMs: 150,
          paneCreate: true,
          paneClose: true,
          paneMove: true,
          tabCrud: true,
          workspaceCrud: true,
        });
      }
      return Promise.reject(new Error(`unexpected method ${method}`));
    });

    fixture = TestBed.createComponent(Board);
    store = TestBed.inject(PanesStore);
    fixture.detectChanges();
    await settle(fixture);

    for (const req of httpMock.match('/api/hosts')) {
      if (!req.cancelled) {
        req.flush({ hosts: [{ name: 'local', connected: true }] });
      }
    }
    await settle(fixture);

    expect(store.panesSignal().size).withContext('panesSignal should hold all 4 panes').toBe(4);

    const el = fixture.nativeElement as HTMLElement;
    const cards = el.querySelectorAll('.card');
    expect(cards.length).withContext('board DOM should render 4 .card elements').toBe(4);

    // Specifically: both panes sharing tab w6:t2 must each render their own
    // card, not collapse into one.
    const hrefs = Array.from(el.querySelectorAll('a.card-open'))
      .map((c) => c.getAttribute('href'))
      .filter((h): h is string => h !== null);
    expect(hrefs).toContain('/pane/local/w6:p2');
    expect(hrefs).toContain('/pane/local/w6:p90');
  });

  it('a second pane arriving later via pane.created (split within the same tab) still renders alongside the first, not replacing it', async () => {
    ws.request.and.callFake((_host: string, method: string) => {
      if (method === 'pane.list') {
        // Initial load only sees ONE pane in w6:t2 — the split happens
        // AFTER the SPA is already subscribed, arriving only as a
        // `pane.created` event, exactly like a user splitting a pane inside
        // herdr's own TUI while kanhrd is open.
        return Promise.resolve({
          panes: [
            {
              id: 'w6:p2',
              host: 'local',
              workspace: { id: 'w6', name: 'jmorales' },
              tab: { id: 'w6:t2', name: '2' },
              agent_status: 'working',
            },
          ],
        });
      }
      if (method === 'events.subscribe') return Promise.resolve({ subscription_id: 's1' });
      if (method === 'bridge.capabilities') {
        return Promise.resolve({
          tier: 3,
          terminal: true,
          paneResize: false,
          paneGraphics: false,
          outputPollIntervalMs: 150,
          paneCreate: true,
          paneClose: true,
          paneMove: true,
          tabCrud: true,
          workspaceCrud: true,
        });
      }
      return Promise.reject(new Error(`unexpected method ${method}`));
    });

    fixture = TestBed.createComponent(Board);
    store = TestBed.inject(PanesStore);
    fixture.detectChanges();
    await settle(fixture);

    for (const req of httpMock.match('/api/hosts')) {
      if (!req.cancelled) {
        req.flush({ hosts: [{ name: 'local', connected: true }] });
      }
    }
    await settle(fixture);

    expect(store.panesSignal().size).toBe(1);

    ws.events$.next({
      host: 'local',
      event: 'pane.created',
      payload: {
        pane: {
          id: 'w6:p90',
          host: 'local',
          workspace: { id: 'w6', name: 'jmorales' },
          tab: { id: 'w6:t2', name: '2' },
          agent_status: 'working',
        },
      },
    });
    await settle(fixture);

    expect(store.panesSignal().size).withContext('panesSignal should hold both panes').toBe(2);

    const el = fixture.nativeElement as HTMLElement;
    const cards = el.querySelectorAll('.card');
    const hrefs = Array.from(el.querySelectorAll('a.card-open'))
      .map((c) => c.getAttribute('href'))
      .filter((h): h is string => h !== null);
    expect(hrefs)
      .withContext('both panes should each render their own card')
      .toContain('/pane/local/w6:p2');
    expect(hrefs).toContain('/pane/local/w6:p90');
    expect(cards.length).toBe(2);
  });
});

describe('Board: URL scope (rail = navigator, decision locked)', () => {
  // `Board` derives `PanesStore.scopeSignal` from `ActivatedRoute.paramMap`
  // rather than the rail writing it on click — this exercises that derivation
  // plus the scope pill and its Escape-dismiss wiring, without pulling in a
  // full RouterTestingHarness: a fake `ActivatedRoute` backed by a
  // `BehaviorSubject` stands in for real navigation, and `Router.navigate` is
  // a spy so the pill's "×"/Escape path can be asserted without depending on
  // route resolution actually completing.
  let ws: FakeWsClient;
  let fixture: ComponentFixture<Board>;
  let httpMock: HttpTestingController;
  let store: PanesStore;
  let paramMap$: BehaviorSubject<ReturnType<typeof convertToParamMap>>;
  let navigateSpy: jasmine.Spy;

  beforeEach(async () => {
    ws = new FakeWsClient();
    paramMap$ = new BehaviorSubject(convertToParamMap({}));
    navigateSpy = jasmine.createSpy('navigate').and.resolveTo(true);

    ws.request.and.callFake((_host: string, method: string) => {
      if (method === 'pane.list') {
        return Promise.resolve({
          panes: [
            {
              id: 'w6:p1',
              host: 'local',
              workspace: { id: 'w6', name: 'jmorales' },
              tab: { id: 'w6:t1', name: 'one' },
              agent_status: 'idle',
            },
            {
              id: 'w6:p2',
              host: 'local',
              workspace: { id: 'w6', name: 'jmorales' },
              tab: { id: 'w6:t2', name: 'two' },
              agent_status: 'working',
            },
          ],
        });
      }
      if (method === 'events.subscribe') return Promise.resolve({ subscription_id: 's1' });
      if (method === 'bridge.capabilities') {
        return Promise.resolve({
          tier: 1,
          terminal: false,
          paneResize: false,
          paneGraphics: false,
          outputPollIntervalMs: 0,
          paneCreate: false,
          paneClose: false,
          paneMove: false,
          paneRename: false,
          tabCrud: false,
          workspaceCrud: false,
        });
      }
      return Promise.reject(new Error(`unexpected method ${method}`));
    });

    await TestBed.configureTestingModule({
      imports: [Board],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: WsClient, useValue: ws },
        { provide: ActivatedRoute, useValue: { paramMap: paramMap$.asObservable() } },
        // `url` + `events` because `BoardReturnService` watches navigation itself.
        { provide: Router, useValue: { navigate: navigateSpy, url: '/', events: EMPTY } },
      ],
    }).compileComponents();
    httpMock = TestBed.inject(HttpTestingController);

    fixture = TestBed.createComponent(Board);
    store = TestBed.inject(PanesStore);
    fixture.detectChanges();
    await settle(fixture);
    for (const req of httpMock.match('/api/hosts')) {
      if (!req.cancelled) {
        req.flush({ hosts: [{ name: 'local', connected: true }] });
      }
    }
    await settle(fixture);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('navigating to /workspace/:id/tab/:id sets scopeSignal and renders the scope pill', async () => {
    paramMap$.next(convertToParamMap({ workspaceId: 'w6', tabId: 'w6:t2' }));
    await settle(fixture);

    expect(store.scopeSignal()).toEqual({ host: 'local', workspaceId: 'w6', tabId: 'w6:t2' });

    const el = fixture.nativeElement as HTMLElement;
    const pill = el.querySelector('.scope-pill');
    expect(pill).withContext('scope pill should render once scoped').toBeTruthy();
    expect(pill?.textContent).toContain('jmorales / two');

    // Scoped to one tab: only that tab's card should render.
    const cards = el.querySelectorAll('.card');
    expect(cards.length).toBe(1);
  });

  it("clicking the scope pill's × navigates back to /", async () => {
    paramMap$.next(convertToParamMap({ workspaceId: 'w6', tabId: 'w6:t2' }));
    await settle(fixture);

    const el = fixture.nativeElement as HTMLElement;
    el.querySelector<HTMLButtonElement>('.scope-pill-close')?.click();

    expect(navigateSpy).toHaveBeenCalledWith(['/']);
  });

  it('Escape clears the scope by navigating back to /', async () => {
    paramMap$.next(convertToParamMap({ workspaceId: 'w6', tabId: 'w6:t2' }));
    await settle(fixture);
    navigateSpy.calls.reset();

    const keyboard = TestBed.inject(KeyboardService);
    keyboard.handleKeydown(new KeyboardEvent('keydown', { key: 'Escape' }), document.body);

    expect(navigateSpy).toHaveBeenCalledWith(['/']);
  });

  it('no workspaceId in the route means no scope and no pill', async () => {
    const el = fixture.nativeElement as HTMLElement;
    expect(store.scopeSignal()).toBeNull();
    expect(el.querySelector('.scope-pill')).toBeNull();
  });
});

describe('Board pager: pure paging + density rules', () => {
  it('pageIndex is Math.round(scrollLeft / clientWidth), and 0 before layout', () => {
    expect(pageIndex(0, 390)).toBe(0);
    expect(pageIndex(390, 390)).toBe(1);
    expect(pageIndex(1170, 390)).toBe(3);
    // Mid-gesture readings round to the nearer page; a settled strip is exact.
    expect(pageIndex(400, 390)).toBe(1);
    expect(pageIndex(560, 390)).toBe(1);
    expect(pageIndex(600, 390)).toBe(2);
    expect(pageIndex(100, 0)).toBe(0);
  });

  it('nearestVisibleStatus keeps the current column when it is still visible', () => {
    expect(nearestVisibleStatus('idle', ['working', 'blocked', 'idle', 'done', 'unknown'])).toBe(
      'idle'
    );
  });

  it('nearestVisibleStatus falls back to the nearest visible column to the LEFT', () => {
    // `idle` hidden while shown -> `blocked` (its left neighbour in STATUS_COLUMN_ORDER)
    expect(nearestVisibleStatus('idle', ['working', 'blocked', 'done', 'unknown'])).toBe('blocked');
    // both left neighbours hidden too -> keeps walking left
    expect(nearestVisibleStatus('done', ['working', 'unknown'])).toBe('working');
  });

  it('nearestVisibleStatus falls back to the FIRST visible column when nothing is to the left', () => {
    expect(nearestVisibleStatus('working', ['idle', 'done'])).toBe('idle');
  });

  it('nearestVisibleStatus reports nothing when every status is hidden', () => {
    expect(nearestVisibleStatus('working', [])).toBeNull();
  });

  it('compact at > 20 and virtualization at > 50 are distinct thresholds', () => {
    expect(isCompact(20, false)).toBe(false);
    expect(isCompact(21, false)).toBe(true);
    expect(isVirtualized(20)).toBe(false);
    expect(isVirtualized(21)).toBe(false);
    expect(isVirtualized(50)).toBe(false);
    expect(isVirtualized(51)).toBe(true);
  });

  it('everything is compact below the mobile breakpoint, whatever the count', () => {
    expect(isCompact(0, true)).toBe(true);
    expect(isCompact(1, true)).toBe(true);
  });

  it('itemSize is the compact row height plus its gap, or virtualized rows clip', () => {
    expect(VIRTUAL_ITEM_SIZE).toBe(52);
  });
});

describe('Board: filter interaction with the pager', () => {
  // Same fake-route scaffolding as the URL-scope suite above: what is under
  // test here is which status columns render, and what replaces them when
  // every one of them is hidden.
  let ws: FakeWsClient;
  let fixture: ComponentFixture<Board>;
  let httpMock: HttpTestingController;
  let store: PanesStore;

  function renderedStatuses(): string[] {
    const el = fixture.nativeElement as HTMLElement;
    return Array.from(el.querySelectorAll('app-column')).map(
      (column) => column.querySelector('.column')?.getAttribute('data-status') ?? ''
    );
  }

  beforeEach(async () => {
    ws = new FakeWsClient();
    ws.request.and.callFake((_host: string, method: string) => {
      if (method === 'pane.list') {
        return Promise.resolve({
          panes: [
            {
              id: 'p1',
              host: 'local',
              workspace: { id: 'w6', name: 'jmorales' },
              tab: { id: 't1', name: 'one' },
              agent_status: 'idle',
            },
            {
              id: 'p2',
              host: 'local',
              workspace: { id: 'w6', name: 'jmorales' },
              tab: { id: 't1', name: 'one' },
              agent_status: 'working',
            },
          ],
        });
      }
      if (method === 'events.subscribe') return Promise.resolve({ subscription_id: 's1' });
      if (method === 'bridge.capabilities') {
        return Promise.resolve({
          tier: 1,
          terminal: false,
          paneResize: false,
          paneGraphics: false,
          outputPollIntervalMs: 0,
          paneCreate: false,
          paneClose: false,
          paneMove: false,
          paneRename: false,
          tabCrud: false,
          workspaceCrud: false,
        });
      }
      return Promise.reject(new Error(`unexpected method ${method}`));
    });

    await TestBed.configureTestingModule({
      imports: [Board],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: WsClient, useValue: ws },
        {
          provide: ActivatedRoute,
          useValue: { paramMap: new BehaviorSubject(convertToParamMap({})).asObservable() },
        },
        {
          provide: Router,
          useValue: {
            navigate: jasmine.createSpy('navigate').and.resolveTo(true),
            url: '/',
            events: EMPTY,
          },
        },
      ],
    }).compileComponents();
    httpMock = TestBed.inject(HttpTestingController);

    fixture = TestBed.createComponent(Board);
    store = TestBed.inject(PanesStore);
    store.filtersSignal.set(defaultFilters());
    fixture.detectChanges();
    await settle(fixture);
    for (const req of httpMock.match('/api/hosts')) {
      if (!req.cancelled) {
        req.flush({ hosts: [{ name: 'local', connected: true }] });
      }
    }
    await settle(fixture);
  });

  afterEach(() => {
    httpMock.verify();
    store.filtersSignal.set(defaultFilters());
  });

  it('renders one page per status, in STATUS_COLUMN_ORDER, including the empty ones', async () => {
    expect(renderedStatuses()).toEqual(['working', 'blocked', 'idle', 'done', 'unknown']);
  });

  it('hiding a status removes its page and leaves the order unchanged', async () => {
    store.toggleColumn('idle');
    await settle(fixture);

    expect(renderedStatuses()).toEqual(['working', 'blocked', 'done', 'unknown']);
  });

  it('un-hiding re-inserts the page at its STATUS_COLUMN_ORDER position', async () => {
    store.toggleColumn('idle');
    await settle(fixture);
    store.toggleColumn('idle');
    await settle(fixture);

    expect(renderedStatuses()).toEqual(['working', 'blocked', 'idle', 'done', 'unknown']);
  });

  it('hiding every status shows the no-matches empty state with a clear action, not an empty pager', async () => {
    for (const status of STATUS_COLUMN_ORDER) {
      store.toggleColumn(status);
    }
    await settle(fixture);

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.board-strip')).withContext('no empty pager').toBeNull();
    expect(el.querySelector('app-status-switcher')).toBeNull();
    const noMatches = el.querySelector('.no-matches');
    expect(noMatches?.textContent).toContain('nothing matches these filters.');

    const clear = noMatches?.querySelector<HTMLButtonElement>('.action');
    expect(clear?.textContent?.trim()).toBe('clear filters');
    clear?.click();
    await settle(fixture);

    expect(renderedStatuses()).toEqual(['working', 'blocked', 'idle', 'done', 'unknown']);
  });

  it('exposes no drag affordance on a board with no user-defined column', async () => {
    const el = fixture.nativeElement as HTMLElement;
    // The amended rule (docs/UX-GUIDELINES.md assertion 22, Q1): with no
    // parked column nothing is ENABLED — every card's drag and every list
    // is off, so no card can be picked up and no column can receive one.
    for (const card of Array.from(el.querySelectorAll('app-card.cdk-drag'))) {
      expect(card.classList.contains('cdk-drag-disabled')).withContext('drag off').toBeTrue();
      expect(getComputedStyle(card).cursor).not.toBe('grab');
    }
    for (const list of Array.from(el.querySelectorAll('.cdk-drop-list'))) {
      expect(list.classList.contains('cdk-drop-list-disabled')).withContext('list off').toBeTrue();
    }
    expect(el.querySelector('.drag-handle')).toBeNull();
    expect(el.querySelector("[draggable='true']")).toBeNull();
  });
});

describe('Board: an invalid scope is reported, never silently swallowed', () => {
  let ws: FakeWsClient;
  let fixture: ComponentFixture<Board>;
  let httpMock: HttpTestingController;
  let store: PanesStore;
  let clock: ClockTick;
  let paramMap$: BehaviorSubject<ReturnType<typeof convertToParamMap>>;

  beforeEach(async () => {
    ws = new FakeWsClient();
    paramMap$ = new BehaviorSubject(convertToParamMap({}));
    ws.request.and.callFake((_host: string, method: string) => {
      if (method === 'pane.list') {
        return Promise.resolve({
          panes: [
            {
              id: 'p1',
              host: 'local',
              workspace: { id: 'w6', name: 'jmorales' },
              tab: { id: 't1', name: 'one' },
              agent_status: 'idle',
            },
          ],
        });
      }
      if (method === 'events.subscribe') return Promise.resolve({ subscription_id: 's1' });
      if (method === 'bridge.capabilities') {
        return Promise.resolve({
          tier: 1,
          terminal: false,
          paneResize: false,
          paneGraphics: false,
          outputPollIntervalMs: 0,
          paneCreate: false,
          paneClose: false,
          paneMove: false,
          paneRename: false,
          tabCrud: false,
          workspaceCrud: false,
        });
      }
      return Promise.reject(new Error(`unexpected method ${method}`));
    });

    await TestBed.configureTestingModule({
      imports: [Board],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: WsClient, useValue: ws },
        { provide: ActivatedRoute, useValue: { paramMap: paramMap$.asObservable() } },
        {
          provide: Router,
          useValue: {
            navigate: jasmine.createSpy('navigate').and.resolveTo(true),
            url: '/',
            events: EMPTY,
          },
        },
      ],
    }).compileComponents();
    httpMock = TestBed.inject(HttpTestingController);

    fixture = TestBed.createComponent(Board);
    store = TestBed.inject(PanesStore);
    clock = TestBed.inject(ClockTick);
    fixture.detectChanges();
    await settle(fixture);
    for (const req of httpMock.match('/api/hosts')) {
      if (!req.cancelled) {
        req.flush({ hosts: [{ name: 'local', connected: true }] });
      }
    }
    await settle(fixture);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it("shows the skeleton, not the previous scope's board, while a scoped id is still unresolved", async () => {
    paramMap$.next(convertToParamMap({ workspaceId: 'w6' }));
    await settle(fixture);
    expect(store.scopeSignal()).toEqual({ host: 'local', workspaceId: 'w6', tabId: null });

    paramMap$.next(convertToParamMap({ workspaceId: 'gone' }));
    await settle(fixture);

    const el = fixture.nativeElement as HTMLElement;
    expect(store.scopeSignal()).withContext('the old scope is dropped immediately').toBeNull();
    expect(el.querySelector('.board-skeleton')).not.toBeNull();
    expect(el.querySelector('.board-strip')).toBeNull();
    expect(el.querySelector('.scope-pill')).toBeNull();
  });

  it('says the workspace is no longer here once the id has stayed unresolved', async () => {
    paramMap$.next(convertToParamMap({ workspaceId: 'gone' }));
    await settle(fixture);

    clock.now.set(Date.now() + SCOPE_RESOLVE_GRACE_MS + 1000);
    await settle(fixture);

    const el = fixture.nativeElement as HTMLElement;
    const state = el.querySelector('.state-unavailable');
    expect(state?.textContent).toContain('that workspace is no longer here.');
    expect(state?.querySelector('button')?.textContent?.trim()).toBe('back to the board');
    expect(el.querySelector('.board-strip')).withContext('no silent fallback board').toBeNull();
  });

  it('recovers without a reload once the scoped workspace resolves', async () => {
    paramMap$.next(convertToParamMap({ workspaceId: 'gone' }));
    await settle(fixture);
    clock.now.set(Date.now() + SCOPE_RESOLVE_GRACE_MS + 1000);
    await settle(fixture);
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('.state-unavailable')
    ).not.toBeNull();

    paramMap$.next(convertToParamMap({ workspaceId: 'w6' }));
    await settle(fixture);

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.state-unavailable')).toBeNull();
    expect(el.querySelector('.board-strip')).not.toBeNull();
    expect(store.scopeSignal()).toEqual({ host: 'local', workspaceId: 'w6', tabId: null });
  });
});

/**
 * Section 17.6: coming out of a pane puts the user back where they were.
 *
 * The protocol itself — the URL match, the grace deadline, the retry pump,
 * scroll before focus, the neighbour fallback — is `BoardReturnService`'s,
 * and is tested against a fake port in `board-return.service.spec.ts`. What
 * is left here is only what needs a real board: that the port is wired to a
 * real DOM, and that a real click, teardown and remount travel through it.
 *
 * `PanesStore` is root-provided, so it survives between the two fixtures
 * here exactly as it survives a real navigation: the second board mounts
 * against the same store, already loaded. That is the point — the return is
 * a remount, not a reload.
 */
describe('Board: returning from a pane', () => {
  let ws: FakeWsClient;
  let fixture: ComponentFixture<Board>;
  let httpMock: HttpTestingController;
  let boardReturn: BoardReturnService;
  let currentUrl: string;

  const BOARD_URL = '/workspace/w6';

  function pane(id: string, status = 'working') {
    return {
      id,
      host: 'local',
      workspace: { id: 'w6', name: 'jmorales' },
      tab: { id: 'w6:t1', name: 'one' },
      agent_status: status,
    };
  }

  const PANES = [pane('w6:p1'), pane('w6:p2')];

  async function createBoard(): Promise<ComponentFixture<Board>> {
    const created = TestBed.createComponent(Board);
    created.detectChanges();
    await settle(created);
    for (const req of httpMock.match('/api/hosts')) {
      if (!req.cancelled) {
        req.flush({ hosts: [{ name: 'local', connected: true }] });
      }
    }
    await settle(created);
    return created;
  }

  /** Lets the restore pump's retry timer fire, and the resulting render land. */
  async function pump(target: ComponentFixture<Board>): Promise<void> {
    for (let i = 0; i < 4; i++) {
      await new Promise((resolve) => setTimeout(resolve, 60));
      await settle(target);
    }
  }

  function openCard(target: ComponentFixture<Board>, key: string): void {
    const link = (target.nativeElement as HTMLElement).querySelector<HTMLElement>(
      `app-card[data-pane="${key}"] a.card-open`
    );
    expect(link).withContext(`${key} must render as a link`).not.toBeNull();
    link!.click();
  }

  function focusedPane(): string | null | undefined {
    return document.activeElement?.closest('app-card')?.getAttribute('data-pane');
  }

  beforeEach(async () => {
    ws = new FakeWsClient();
    ws.request.and.callFake((_host: string, method: string) => {
      if (method === 'pane.list') return Promise.resolve({ panes: PANES });
      if (method === 'events.subscribe') return Promise.resolve({ subscription_id: 's1' });
      if (method === 'bridge.capabilities') {
        return Promise.resolve({
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
        });
      }
      return Promise.reject(new Error(`unexpected method ${method}`));
    });

    await TestBed.configureTestingModule({
      imports: [Board],
      providers: [
        provideZonelessChangeDetection(),
        // Catch-all so a card's `routerLink` resolves: this suite asserts
        // what the click RECORDS, not where the router lands.
        provideRouter([{ path: '**', children: [] }]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: WsClient, useValue: ws },
        {
          provide: ActivatedRoute,
          useValue: { paramMap: new BehaviorSubject(convertToParamMap({})) },
        },
      ],
    }).compileComponents();

    httpMock = TestBed.inject(HttpTestingController);

    // The real Router, so `routerLink` on the cards works, with a drivable
    // `url` shadowing the getter that would otherwise read the test page's.
    // Shadowed before `BoardReturnService` is constructed: the service seeds
    // its board URL from the router rather than being handed one.
    currentUrl = BOARD_URL;
    Object.defineProperty(TestBed.inject(Router), 'url', {
      get: () => currentUrl,
      configurable: true,
    });
    boardReturn = TestBed.inject(BoardReturnService);

    fixture = await createBoard();
  });

  afterEach(() => {
    boardReturn.clear();
  });

  it('renders the two cards the rest of this suite depends on', () => {
    const cards = (fixture.nativeElement as HTMLElement).querySelectorAll('app-card[data-pane]');
    expect(Array.from(cards).map((c) => c.getAttribute('data-pane'))).toEqual([
      'local:w6:p1',
      'local:w6:p2',
    ]);
  });

  it('writes down the board URL it is leaving, so the pane can come back to it', () => {
    expect(boardReturn.boardUrl()).withContext('nothing remembered yet').toBe('/');
    fixture.destroy();
    expect(boardReturn.boardUrl()).toBe(BOARD_URL);
  });

  it('puts focus back on the card that was opened', async () => {
    openCard(fixture, 'local:w6:p2');
    fixture.destroy();

    const returned = await createBoard();
    await pump(returned);

    expect(focusedPane()).toBe('local:w6:p2');
    returned.destroy();
  });

  it('does not take focus the user has already placed somewhere else', async () => {
    openCard(fixture, 'local:w6:p2');
    fixture.destroy();

    const elsewhere = document.createElement('button');
    document.body.appendChild(elsewhere);
    elsewhere.focus();

    const returned = await createBoard();
    await pump(returned);

    expect(document.activeElement).toBe(elsewhere);
    elsewhere.remove();
    returned.destroy();
  });
});

/**
 * Swimlanes — openspec change `add-swimlane-grouping`, spec
 * `board-swimlanes`. The board's side of the feature: what the DOM looks
 * like with grouping off (unchanged), with grouping on (one band per
 * distinct value, each holding the full visible column set), and what a
 * band may never grow (a drag affordance).
 */
describe('Board: swimlanes', () => {
  let ws: FakeWsClient;
  let fixture: ComponentFixture<Board>;
  let httpMock: HttpTestingController;
  let store: PanesStore;
  let settings: SettingsService;

  const SETTINGS_STORAGE_KEY = 'kanhrd.settings';

  function pane(
    id: string,
    host: string,
    status: AgentStatus,
    tab: { id: string; name: string },
    project?: { repo_name: string; checkout_path: string; is_linked_worktree: boolean }
  ) {
    return {
      id,
      host,
      workspace: { id: `${host}-w`, name: host },
      tab,
      agent_status: status,
      ...(project ? { project } : {}),
    };
  }

  const KANHRD = { repo_name: 'kanhrd', checkout_path: '~/src/kanhrd', is_linked_worktree: false };
  const KANHRD_WT = {
    repo_name: 'kanhrd',
    checkout_path: '~/src/kanhrd-wt',
    is_linked_worktree: true,
  };

  const PANES = [
    pane('p1', 'local', 'working', { id: 't1', name: 'main' }, KANHRD),
    pane('p2', 'local', 'blocked', { id: 't1', name: 'main' }, KANHRD_WT),
    pane('p3', 'remote', 'idle', { id: 't2', name: 'main' }, KANHRD),
    // No `project` at all: the ungrouped band's reason to exist.
    pane('p4', 'remote', 'done', { id: 't2', name: 'main' }),
  ];

  function bands(): HTMLElement[] {
    return Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('app-swimlane'));
  }

  function bandLabelsRendered(): string[] {
    return bands().map((band) => band.querySelector('.swimlane-title')?.textContent?.trim() ?? '');
  }

  function columnsIn(band: HTMLElement): string[] {
    return Array.from(band.querySelectorAll('app-column')).map(
      (column) => column.querySelector('.column')?.getAttribute('data-status') ?? ''
    );
  }

  beforeEach(async () => {
    localStorage.removeItem(SETTINGS_STORAGE_KEY);
    ws = new FakeWsClient();
    ws.request.and.callFake((host: string, method: string) => {
      if (method === 'pane.list') {
        return Promise.resolve({ panes: PANES.filter((p) => p.host === host) });
      }
      if (method === 'events.subscribe') return Promise.resolve({ subscription_id: `s-${host}` });
      if (method === 'bridge.capabilities') {
        return Promise.resolve({
          tier: 1,
          terminal: false,
          paneResize: false,
          paneGraphics: false,
          outputPollIntervalMs: 0,
          paneCreate: false,
          paneClose: false,
          paneMove: false,
          paneRename: false,
          tabCrud: false,
          workspaceCrud: false,
        });
      }
      return Promise.reject(new Error(`unexpected method ${method}`));
    });

    await TestBed.configureTestingModule({
      imports: [Board],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: WsClient, useValue: ws },
        {
          provide: ActivatedRoute,
          useValue: { paramMap: new BehaviorSubject(convertToParamMap({})).asObservable() },
        },
        {
          provide: Router,
          useValue: {
            navigate: jasmine.createSpy('navigate').and.resolveTo(true),
            url: '/',
            events: EMPTY,
          },
        },
      ],
    }).compileComponents();
    httpMock = TestBed.inject(HttpTestingController);

    fixture = TestBed.createComponent(Board);
    store = TestBed.inject(PanesStore);
    settings = TestBed.inject(SettingsService);
    store.filtersSignal.set(defaultFilters());
    fixture.detectChanges();
    await settle(fixture);
    for (const req of httpMock.match('/api/hosts')) {
      if (!req.cancelled) {
        req.flush({
          hosts: [
            { name: 'local', connected: true },
            { name: 'remote', connected: true },
          ],
        });
      }
    }
    await settle(fixture);
  });

  afterEach(() => {
    httpMock.verify();
    settings.setSwimlaneDimension('none');
    store.filtersSignal.set(defaultFilters());
    localStorage.removeItem(SETTINGS_STORAGE_KEY);
  });

  it('renders the four seeded cards, which the rest of this suite depends on', () => {
    expect((fixture.nativeElement as HTMLElement).querySelectorAll('app-card').length).toBe(4);
  });

  // --- parked columns (openspec add-parked-columns) -----------------------

  describe('parked columns', () => {
    let parked: ParkedStore;

    beforeEach(() => {
      parked = TestBed.inject(ParkedStore);
      parked.clear();
    });

    afterEach(() => {
      parked.clear();
      localStorage.removeItem('kanhrd.parked-columns');
    });

    function columnKinds(root: ParentNode): string[] {
      return Array.from(root.querySelectorAll('app-column .column')).map(
        (column) =>
          column.getAttribute('data-status') ?? `parked:${column.getAttribute('data-parked')}`
      );
    }

    it("renders parked columns after `unknown`, in the operator's order", async () => {
      const archived = parked.createColumn('archived', 'never');
      const parking = parked.createColumn('parking');
      await settle(fixture);

      expect(columnKinds(fixture.nativeElement as HTMLElement)).toEqual([
        'working',
        'blocked',
        'idle',
        'done',
        'unknown',
        `parked:${archived.id}`,
        `parked:${parking.id}`,
      ]);
    });

    it('moves a parked card out of its status column, keeping it on the board once', async () => {
      const column = parked.createColumn('archived', 'never');
      parked.park('local:p1', column.id);
      await settle(fixture);

      const el = fixture.nativeElement as HTMLElement;
      const parkedColumn = el.querySelector(`.column[data-parked="${column.id}"]`)!;
      expect(parkedColumn.querySelectorAll('app-card').length).toBe(1);
      expect(el.querySelectorAll('app-card[data-pane="local:p1"]').length).toBe(1);
      expect(
        el.querySelector('.column[data-status="working"]')!.querySelectorAll('app-card').length
      ).toBe(0);
      // The card is still found by its stable pane identity, wherever it sits.
      expect(focusCard(el, 'local:p1')).toBeTrue();
    });

    it('gives the mobile switcher one segment per column, parked included', async () => {
      const column = parked.createColumn('archived', 'never');
      await settle(fixture);

      const segments = Array.from(
        (fixture.nativeElement as HTMLElement).querySelectorAll('.switcher [role="tab"]')
      );
      expect(segments.length).toBe(6);
      expect(segments[5].querySelector('.segment-label')?.textContent?.trim()).toBe('archived');
      expect(segments[5].id).toBe(`switcher-tab-parked:${column.id}`);
    });

    it('draws every parked column in every band when grouping is on', async () => {
      const column = parked.createColumn('archived', 'never');
      parked.park('local:p1', column.id);
      settings.setSwimlaneDimension('host');
      await settle(fixture);

      expect(bands().length).toBe(2);
      for (const band of bands()) {
        expect(columnKinds(band)).toEqual([
          'working',
          'blocked',
          'idle',
          'done',
          'unknown',
          `parked:${column.id}`,
        ]);
      }
      // The parked card bands by its own host, like every other card; the
      // other band shows the same column, empty.
      expect(
        bands()[0].querySelector(`.column[data-parked="${column.id}"] app-card`)
      ).not.toBeNull();
      expect(bands()[1].querySelector(`.column[data-parked="${column.id}"] app-card`)).toBeNull();
    });

    it('connects every column in a strip into one drop group, bands included', async () => {
      parked.createColumn('archived', 'never');
      await settle(fixture);
      const el = fixture.nativeElement as HTMLElement;

      // One group per strip: a card can be dragged from a status column
      // into a parked one without the board hand-wiring list ids, and a
      // card can never be dragged out of the band it belongs to.
      expect(el.querySelector('.board-strip[cdkDropListGroup]')).not.toBeNull();
      const lists = Array.from(el.querySelectorAll('.column-body'));
      expect(lists.length).toBe(6);
      for (const list of lists) {
        expect(list.classList.contains('cdk-drop-list')).toBeTrue();
      }

      settings.setSwimlaneDimension('host');
      await settle(fixture);
      for (const band of bands()) {
        expect(band.querySelector('.swimlane-strip[cdkDropListGroup]')).not.toBeNull();
        expect(band.querySelectorAll('.column-body.cdk-drop-list').length).toBe(6);
      }
    });

    it('carries a column-reorder list per strip, unconnected to the card lists', async () => {
      parked.createColumn('archived', 'never');
      parked.createColumn('parking', 'never');
      await settle(fixture);
      const el = fixture.nativeElement as HTMLElement;

      // The reorder list is mounted on the REGION, not on the strip: the
      // strip's `cdkDropListGroup` is what connects the card lists, and
      // `CdkDropList` shadows that token on its own element. The two lists
      // therefore share no group and name each other in no `connectedTo`,
      // which is what keeps a card out of the strip and a column out of a
      // column's cards.
      const region = el.querySelector('.board-region')!;
      expect(region.classList.contains('cdk-drop-list')).toBeTrue();
      expect(region.hasAttribute('cdkDropListGroup')).toBeFalse();
      expect(el.querySelector('.board-strip[cdkDropListGroup]')).not.toBeNull();
      expect(el.querySelector('.board-strip')!.classList.contains('cdk-drop-list')).toBeFalse();

      settings.setSwimlaneDimension('host');
      await settle(fixture);
      for (const band of bands()) {
        expect(band.querySelector('.swimlane')!.classList.contains('cdk-drop-list')).toBeTrue();
        expect(band.querySelector('.swimlane-strip[cdkDropListGroup]')).not.toBeNull();
        expect(
          band.querySelector('.swimlane-strip')!.classList.contains('cdk-drop-list')
        ).toBeFalse();
      }
    });

    it('makes only the parked columns drag sources, and only their headers handles', async () => {
      parked.createColumn('archived', 'never');
      parked.createColumn('parking', 'never');
      await settle(fixture);
      const el = fixture.nativeElement as HTMLElement;

      // Karma's viewport is below `--breakpoint-mobile`, so EVERY column
      // drag is inert here and the enabled half is proven as arithmetic
      // (`canReorderColumns`, column.spec.ts). What the DOM proves is who
      // could ever be a source: a status column carries no handle at all,
      // and its `cdkDrag` is disabled whatever the viewport says.
      const columns = Array.from(el.querySelectorAll('app-column'));
      expect(columns.length).toBe(7);
      for (const column of columns) {
        expect(column.classList.contains('cdk-drag')).toBeTrue();
        expect(column.classList.contains('cdk-drag-disabled')).toBeTrue();
      }
      const handles = Array.from(el.querySelectorAll('.column-header.cdk-drag-handle'));
      expect(handles.length).withContext('one per parked column').toBe(2);
      for (const handle of handles) {
        expect(
          handle.closest('app-column')!.querySelector('.column')!.getAttribute('data-parked')
        ).not.toBeNull();
      }
    });

    it('applies a drop on the strip to the store, by position', async () => {
      const archived = parked.createColumn('archived', 'never');
      const parking = parked.createColumn('parking', 'never');
      await settle(fixture);
      const board = fixture.componentInstance as unknown as {
        onColumnDropped(event: { previousIndex: number; currentIndex: number }): void;
        columnSortPredicate(index: number): boolean;
      };

      // Five status columns, so the parked pair is at 5 and 6. A drop is
      // read as "land where the column now at `currentIndex` is".
      expect(board.columnSortPredicate(4)).withContext('among the statuses').toBeFalse();
      expect(board.columnSortPredicate(5)).toBeTrue();

      board.onColumnDropped({ previousIndex: 6, currentIndex: 5 });
      await settle(fixture);

      expect(parked.columns().map((c) => c.id)).toEqual([parking.id, archived.id]);

      // A drop that came to rest on a status column moves nothing at all.
      board.onColumnDropped({ previousIndex: 6, currentIndex: 2 });
      await settle(fixture);
      expect(parked.columns().map((c) => c.id)).toEqual([parking.id, archived.id]);
    });

    it('draws a reordered column in the same place on every strip', async () => {
      const archived = parked.createColumn('archived', 'never');
      const parking = parked.createColumn('parking', 'never');
      parked.moveColumn(archived.id, 1);
      await settle(fixture);

      expect(columnKinds(fixture.nativeElement as HTMLElement)).toEqual([
        'working',
        'blocked',
        'idle',
        'done',
        'unknown',
        `parked:${parking.id}`,
        `parked:${archived.id}`,
      ]);

      // One `order`, every band: a reorder is the board's, not a band's.
      settings.setSwimlaneDimension('host');
      await settle(fixture);
      for (const band of bands()) {
        expect(columnKinds(band).slice(5)).toEqual([
          `parked:${parking.id}`,
          `parked:${archived.id}`,
        ]);
      }
    });

    it('survives a reload of the page-level state: the store re-reads localStorage', async () => {
      const column = parked.createColumn('archived', 'never');
      parked.park('local:p1', column.id);
      TestBed.tick();

      const reloaded = loadParked();
      expect(reloaded.columns.map((c) => c.name)).toEqual(['archived']);
      expect(reloaded.membership['local:p1']).toBe(column.id);
    });
  });

  // --- grouping off: the board is exactly the board ----------------------

  it('renders NO band chrome and the single strip when grouping is none', () => {
    const el = fixture.nativeElement as HTMLElement;
    expect(bands()).withContext('no band component at all').toEqual([]);
    expect(el.querySelector('.swimlane-title')).toBeNull();
    expect(el.querySelector('.swimlanes')).toBeNull();
    expect(el.querySelector('.board-strip')).not.toBeNull();
    expect(el.querySelectorAll('app-column').length).toBe(5);
  });

  it('turning grouping off restores the single strip', async () => {
    settings.setSwimlaneDimension('host');
    await settle(fixture);
    expect(bands().length).toBe(2);

    settings.setSwimlaneDimension('none');
    await settle(fixture);

    const el = fixture.nativeElement as HTMLElement;
    expect(bands()).toEqual([]);
    expect(el.querySelector('.board-strip')).not.toBeNull();
    expect(el.querySelectorAll('app-column').length).toBe(5);
  });

  // --- grouping on -------------------------------------------------------

  it('groups by host: one band per host, each holding every visible column', async () => {
    settings.setSwimlaneDimension('host');
    await settle(fixture);

    expect(bandLabelsRendered()).toEqual(['local', 'remote']);
    for (const band of bands()) {
      expect(columnsIn(band)).toEqual(['working', 'blocked', 'idle', 'done', 'unknown']);
    }
    // The board's own strip is gone: grouping replaces it, never wraps it.
    expect((fixture.nativeElement as HTMLElement).querySelector('.board-strip')).toBeNull();
  });

  it("a band's count is its own cards, not the board's", async () => {
    settings.setSwimlaneDimension('host');
    await settle(fixture);

    const counts = bands().map((band) =>
      band.querySelector('.swimlane-count')?.textContent?.trim()
    );
    expect(counts).toEqual(['2', '2']);
  });

  it("keeps status columns' order and empty slots inside every band", async () => {
    settings.setSwimlaneDimension('host');
    await settle(fixture);

    const local = bands()[0]!;
    // `local` holds one working and one blocked card; the other three
    // columns are empty and keep their slots.
    expect(columnsIn(local)).toEqual(['working', 'blocked', 'idle', 'done', 'unknown']);
    expect(local.querySelectorAll('app-card').length).toBe(2);
  });

  it('hiding a status removes that column from EVERY band, order unchanged', async () => {
    settings.setSwimlaneDimension('host');
    await settle(fixture);
    store.toggleColumn('idle');
    await settle(fixture);

    for (const band of bands()) {
      expect(columnsIn(band)).toEqual(['working', 'blocked', 'done', 'unknown']);
    }
  });

  it('does not render a band left with no cards by the filters', async () => {
    settings.setSwimlaneDimension('host');
    await settle(fixture);
    expect(bandLabelsRendered()).toEqual(['local', 'remote']);

    store.toggleHost('local');
    await settle(fixture);

    expect(bandLabelsRendered()).withContext('the emptied band closes up').toEqual(['remote']);
  });

  it('groups by repository: linked worktrees of one repo share a band', async () => {
    settings.setSwimlaneDimension('repository');
    await settle(fixture);

    // p1/p2/p3 are all `kanhrd`; p4 has no project at all.
    expect(bandLabelsRendered()).toEqual(['kanhrd', COPY.swimlane.ungrouped]);
    expect(bands()[0]!.querySelectorAll('app-card').length).toBe(3);
  });

  it('groups by checkout path: the same worktrees separate', async () => {
    settings.setSwimlaneDimension('checkout');
    await settle(fixture);

    expect(bandLabelsRendered()).toEqual([
      '~/src/kanhrd',
      '~/src/kanhrd-wt',
      COPY.swimlane.ungrouped,
    ]);
  });

  it('puts the no-project band last and names it from copy, never from an empty label', async () => {
    settings.setSwimlaneDimension('repository');
    await settle(fixture);

    const labels = bandLabelsRendered();
    expect(labels[labels.length - 1]).toBe(COPY.swimlane.ungrouped);
    expect(labels).not.toContain('');
  });

  it('qualifies a tab band with its host only when the tab name collides', async () => {
    settings.setSwimlaneDimension('tab');
    await settle(fixture);

    // Both hosts have a tab called `main`, so both headings say which host.
    expect(bandLabelsRendered()).toEqual(['local / main', 'remote / main']);
  });

  it('exposes no ENABLED drag affordance on a band with no user-defined column', async () => {
    settings.setSwimlaneDimension('host');
    await settle(fixture);

    const el = fixture.nativeElement as HTMLElement;
    for (const card of Array.from(el.querySelectorAll('app-card.cdk-drag'))) {
      expect(card.classList.contains('cdk-drag-disabled')).toBeTrue();
    }
    for (const list of Array.from(el.querySelectorAll('.cdk-drop-list'))) {
      expect(list.classList.contains('cdk-drop-list-disabled')).toBeTrue();
    }
    expect(el.querySelector('.drag-handle')).toBeNull();
    for (const band of bands()) {
      expect(band.getAttribute('draggable')).toBeNull();
      expect(band.querySelector("[draggable='true']")).toBeNull();
    }
  });

  it('shows the no-matches empty state rather than a blank region when every band is filtered away', async () => {
    settings.setSwimlaneDimension('host');
    await settle(fixture);
    store.toggleHost('local');
    store.toggleHost('remote');
    await settle(fixture);

    const el = fixture.nativeElement as HTMLElement;
    expect(bands()).toEqual([]);
    expect(el.querySelector('.no-matches')?.textContent).toContain(COPY.emptyState.noMatches);
  });
});

/**
 * Task 4.2 / proposal Q5: virtualization is per column *per band*, so bands
 * multiply the scrollers. This pins the count at the documented 600-pane
 * fixture shape (`apps/web/e2e/fixtures/six-hundred-panes.ts`: 3 hosts × 4
 * workspaces × 5 tabs × 10 panes, on the same status cycle) so a later
 * change to the thresholds or the banding cannot quietly multiply them.
 */
describe('Board: scroller count at the 600-pane fixture', () => {
  let ws: FakeWsClient;
  let fixture: ComponentFixture<Board>;
  let httpMock: HttpTestingController;
  let settings: SettingsService;

  const SETTINGS_STORAGE_KEY = 'kanhrd.settings';
  const HOSTS = ['local', 'remote-a', 'remote-b'];
  const STATUS_CYCLE: AgentStatus[] = [
    'working',
    'working',
    'idle',
    'idle',
    'blocked',
    'done',
    'done',
    'unknown',
    'working',
    'idle',
  ];

  function sixHundredPanes() {
    const panes: unknown[] = [];
    let i = 0;
    for (const host of HOSTS) {
      for (let w = 0; w < 4; w++) {
        for (let t = 0; t < 5; t++) {
          for (let p = 0; p < 10; p++) {
            panes.push({
              id: `${host}-w${w}-t${t}-p${p}`,
              host,
              workspace: { id: `${host}-ws${w}`, name: `workspace ${w}` },
              tab: { id: `${host}-ws${w}-tab${t}`, name: `tab ${t}` },
              agent_status: STATUS_CYCLE[i % STATUS_CYCLE.length],
            });
            i++;
          }
        }
      }
    }
    return panes as { host: string }[];
  }

  const ALL = sixHundredPanes();

  function scrollers(): number {
    return (fixture.nativeElement as HTMLElement).querySelectorAll('cdk-virtual-scroll-viewport')
      .length;
  }

  beforeEach(async () => {
    localStorage.removeItem(SETTINGS_STORAGE_KEY);
    ws = new FakeWsClient();
    ws.request.and.callFake((host: string, method: string) => {
      if (method === 'pane.list') {
        return Promise.resolve({ panes: ALL.filter((p) => p.host === host) });
      }
      if (method === 'events.subscribe') return Promise.resolve({ subscription_id: `s-${host}` });
      if (method === 'bridge.capabilities') {
        return Promise.resolve({
          tier: 1,
          terminal: false,
          paneResize: false,
          paneGraphics: false,
          outputPollIntervalMs: 0,
          paneCreate: false,
          paneClose: false,
          paneMove: false,
          paneRename: false,
          tabCrud: false,
          workspaceCrud: false,
        });
      }
      return Promise.reject(new Error(`unexpected method ${method}`));
    });

    await TestBed.configureTestingModule({
      imports: [Board],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: WsClient, useValue: ws },
        {
          provide: ActivatedRoute,
          useValue: { paramMap: new BehaviorSubject(convertToParamMap({})).asObservable() },
        },
        {
          provide: Router,
          useValue: {
            navigate: jasmine.createSpy('navigate').and.resolveTo(true),
            url: '/',
            events: EMPTY,
          },
        },
      ],
    }).compileComponents();
    httpMock = TestBed.inject(HttpTestingController);

    fixture = TestBed.createComponent(Board);
    settings = TestBed.inject(SettingsService);
    TestBed.inject(PanesStore).filtersSignal.set(defaultFilters());
    fixture.detectChanges();
    await settle(fixture);
    for (const req of httpMock.match('/api/hosts')) {
      if (!req.cancelled) {
        req.flush({ hosts: HOSTS.map((name) => ({ name, connected: true })) });
      }
    }
    await settle(fixture);
  });

  afterEach(() => {
    httpMock.verify();
    settings.setSwimlaneDimension('none');
    localStorage.removeItem(SETTINGS_STORAGE_KEY);
  });

  it('seeds all 600 panes', () => {
    expect(ALL.length).toBe(600);
  });

  it('ungrouped: five columns, every one of them over the threshold — 5 scrollers', () => {
    // working 180, idle 180, done 120, blocked 60, unknown 60.
    expect(scrollers()).toBe(5);
  });

  it('grouped by host: 200 panes a band puts two columns a band over it — 6 scrollers', async () => {
    settings.setSwimlaneDimension('host');
    await settle(fixture);

    // Per band: working 60, idle 60 (virtualized); blocked 20, done 40,
    // unknown 20 (plain). Three bands.
    expect((fixture.nativeElement as HTMLElement).querySelectorAll('app-swimlane').length).toBe(3);
    expect(scrollers()).toBe(6);
  });
});
