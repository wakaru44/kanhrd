import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Subject } from 'rxjs';
import type { Pane, TabSummary, WorkspaceSummary, WsEvent } from '@kanhrd/schema';
import {
  applyEvent,
  applyLifecycleEvent,
  applyPaneAgentStatusChanged,
  applyPaneClosed,
  applyPaneCreated,
  defaultFilters,
  fallbackCapabilities,
  groupByStatus,
  isWorkspaceGroupCloseRequiredError,
  PanesStore,
  paneKey,
  type LifecycleState,
  type PaneMap,
} from './panes.store';
import { WsClient } from './ws-client';

function pane(overrides: Partial<Pane> = {}): Pane {
  return {
    id: 'p1',
    host: 'laptop',
    workspace: { id: 'w1', name: 'workspace-1' },
    tab: { id: 't1', name: 'tab-1' },
    agent_status: 'idle',
    ...overrides,
  };
}

describe('panes.store reducers', () => {
  it('applyPaneCreated adds a pane keyed by host:id', () => {
    const empty: PaneMap = new Map();
    const p = pane();
    const next = applyPaneCreated(empty, p);
    expect(next.get(paneKey(p.host, p.id))).toEqual(p);
    expect(empty.size).toBe(0); // pure: original untouched
  });

  it('applyPaneCreated overwrites an existing pane with the same key', () => {
    const p = pane();
    const withPane = applyPaneCreated(new Map(), p);
    const updated = pane({ agent_status: 'working' });
    const next = applyPaneCreated(withPane, updated);
    expect(next.get(paneKey(p.host, p.id))?.agent_status).toBe('working');
    expect(next.size).toBe(1);
  });

  it('applyPaneClosed removes a pane by id/host', () => {
    const p = pane();
    const withPane = applyPaneCreated(new Map(), p);
    const next = applyPaneClosed(withPane, { id: p.id, host: p.host });
    expect(next.has(paneKey(p.host, p.id))).toBe(false);
  });

  it('applyPaneClosed on an unknown pane is a no-op', () => {
    const empty: PaneMap = new Map();
    const next = applyPaneClosed(empty, { id: 'missing', host: 'laptop' });
    expect(next).toBe(empty);
  });

  it('applyPaneAgentStatusChanged updates only agent_status', () => {
    const p = pane({ title: 'kept' });
    const withPane = applyPaneCreated(new Map(), p);
    const next = applyPaneAgentStatusChanged(withPane, {
      id: p.id,
      host: p.host,
      agent_status: 'blocked',
    });
    const updated = next.get(paneKey(p.host, p.id));
    expect(updated?.agent_status).toBe('blocked');
    expect(updated?.title).toBe('kept');
  });

  it('applyPaneAgentStatusChanged on an unknown pane is a no-op', () => {
    const empty: PaneMap = new Map();
    const next = applyPaneAgentStatusChanged(empty, {
      id: 'missing',
      host: 'laptop',
      agent_status: 'done',
    });
    expect(next).toBe(empty);
  });

  it('applyEvent dispatches pane.created/pane.closed/pane.agent_status_changed', () => {
    const p = pane();
    let panes: PaneMap = new Map();
    panes = applyEvent(panes, { host: p.host, event: 'pane.created', payload: { pane: p } });
    expect(panes.size).toBe(1);

    panes = applyEvent(panes, {
      host: p.host,
      event: 'pane.agent_status_changed',
      payload: { id: p.id, host: p.host, agent_status: 'done' },
    });
    expect(panes.get(paneKey(p.host, p.id))?.agent_status).toBe('done');

    panes = applyEvent(panes, {
      host: p.host,
      event: 'pane.closed',
      payload: { id: p.id, host: p.host, workspace: { id: p.workspace.id } },
    });
    expect(panes.size).toBe(0);
  });

  it('applyEvent upserts a renamed pane in place on pane.updated', () => {
    const p = pane();
    let panes: PaneMap = new Map();
    panes = applyEvent(panes, { host: p.host, event: 'pane.created', payload: { pane: p } });

    panes = applyEvent(panes, {
      host: p.host,
      event: 'pane.updated',
      payload: { pane: { ...p, label: 'fix the backlog storm' } },
    });

    expect(panes.size).toBe(1);
    expect(panes.get(paneKey(p.host, p.id))?.label).toBe('fix the backlog storm');
  });
});

describe('groupByStatus', () => {
  it('buckets panes by agent_status', () => {
    const panes = [
      pane({ id: 'a', agent_status: 'working' }),
      pane({ id: 'b', agent_status: 'idle' }),
      pane({ id: 'c', agent_status: 'working' }),
    ];
    const groups = groupByStatus(panes, defaultFilters());
    expect(groups.working.map((p) => p.id)).toEqual(['a', 'c']);
    expect(groups.idle.map((p) => p.id)).toEqual(['b']);
    expect(groups.blocked).toEqual([]);
  });

  it('excludes panes from hidden hosts', () => {
    const panes = [pane({ id: 'a', host: 'laptop' }), pane({ id: 'b', host: 'desktop' })];
    const groups = groupByStatus(panes, {
      excludedHosts: new Set(['desktop']),
      hiddenStatuses: new Set(),
    });
    expect(groups.idle.map((p) => p.id)).toEqual(['a']);
  });

  it('excludes panes from hidden status columns', () => {
    const panes = [pane({ id: 'a', agent_status: 'working' })];
    const groups = groupByStatus(panes, {
      excludedHosts: new Set(),
      hiddenStatuses: new Set(['working']),
    });
    expect(groups.working).toEqual([]);
  });
});

class FakeWsClient {
  readonly connected = signal(true);
  readonly lastError = signal<string | null>(null);
  readonly events$ = new Subject<WsEvent>();
  connect(): void {
    // no-op: tests drive `connected` directly.
  }
  request = jasmine.createSpy('request');
}

async function flushMicrotasks(): Promise<void> {
  for (let i = 0; i < 5; i++) {
    await Promise.resolve();
  }
}

/** Lets root effects (created outside a component tree, e.g. in an `@Injectable`) flush. */
async function settle(): Promise<void> {
  await flushMicrotasks();
  await new Promise((resolve) => setTimeout(resolve, 0));
  await flushMicrotasks();
}

describe('PanesStore capabilities probing', () => {
  let ws: FakeWsClient;

  function setUp(): { store: PanesStore; httpMock: HttpTestingController } {
    ws = new FakeWsClient();
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: WsClient, useValue: ws },
      ],
    });
    const store = TestBed.inject(PanesStore);
    const httpMock = TestBed.inject(HttpTestingController);
    return { store, httpMock };
  }

  afterEach(() => {
    TestBed.inject(HttpTestingController).verify();
  });

  it('records the probed capabilities for a tier-2 bridge that answers bridge.capabilities', async () => {
    const { store, httpMock } = setUp();
    ws.request.and.callFake((_host: string, method: string) => {
      if (method === 'pane.list') return Promise.resolve({ panes: [] });
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

    // `hostsResource` re-fires whenever `connectTick` bumps (once for the
    // initial computation, again once the `ws.connected` effect runs); the
    // resource cancels the now-stale first request when that happens, so
    // only the still-live request(s) can actually be flushed.
    await settle();
    for (const req of httpMock.match('/api/hosts')) {
      if (!req.cancelled) {
        req.flush({ hosts: [{ name: 'laptop', connected: true }] });
      }
    }
    await settle();

    expect(store.capabilitiesSignal().get('laptop')).toEqual({
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
  });

  it('falls back to disabled terminal support when bridge.capabilities errors (tier-1 bridge)', async () => {
    const { store, httpMock } = setUp();
    ws.request.and.callFake((_host: string, method: string) => {
      if (method === 'pane.list') return Promise.resolve({ panes: [] });
      if (method === 'events.subscribe') return Promise.resolve({ subscription_id: 's1' });
      if (method === 'bridge.capabilities') {
        return Promise.reject(new Error('unknown_method: bridge.capabilities'));
      }
      return Promise.reject(new Error(`unexpected method ${method}`));
    });

    // `hostsResource` re-fires whenever `connectTick` bumps (once for the
    // initial computation, again once the `ws.connected` effect runs); the
    // resource cancels the now-stale first request when that happens, so
    // only the still-live request(s) can actually be flushed.
    await settle();
    for (const req of httpMock.match('/api/hosts')) {
      if (!req.cancelled) {
        req.flush({ hosts: [{ name: 'laptop', connected: true }] });
      }
    }
    await settle();

    expect(store.capabilitiesSignal().get('laptop')).toEqual(fallbackCapabilities());
  });
});

describe('isWorkspaceGroupCloseRequiredError', () => {
  it('matches the wire error code workspace.close returns for a linked-worktree group', () => {
    expect(
      isWorkspaceGroupCloseRequiredError(
        new Error('workspace_group_close_required: this workspace shares a linked worktree')
      )
    ).toBe(true);
  });

  it('does not match other errors', () => {
    expect(isWorkspaceGroupCloseRequiredError(new Error('some_other_error'))).toBe(false);
    expect(isWorkspaceGroupCloseRequiredError('not an Error')).toBe(false);
  });
});

describe('applyLifecycleEvent', () => {
  function workspace(overrides: Partial<WorkspaceSummary> = {}): WorkspaceSummary {
    return { id: 'w1', host: 'laptop', name: 'workspace-1', ...overrides };
  }

  function tab(overrides: Partial<TabSummary> = {}): TabSummary {
    return { id: 't1', host: 'laptop', workspace: { id: 'w1' }, name: 'tab-1', ...overrides };
  }

  function seededState(): LifecycleState {
    const p1 = pane({
      id: 'p1',
      workspace: { id: 'w1', name: 'workspace-1' },
      tab: { id: 't1', name: 'tab-1' },
    });
    const p2 = pane({
      id: 'p2',
      workspace: { id: 'w1', name: 'workspace-1' },
      tab: { id: 't2', name: 'tab-2' },
    });
    return {
      panes: new Map([
        [paneKey(p1.host, p1.id), p1],
        [paneKey(p2.host, p2.id), p2],
      ]),
      workspaces: new Map([[paneKey('laptop', 'w1'), workspace()]]),
      tabs: new Map([
        [paneKey('laptop', 't1'), tab({ id: 't1' })],
        [paneKey('laptop', 't2'), tab({ id: 't2' })],
      ]),
    };
  }

  it('workspace.closed purges the workspace and every nested tab/pane, even with no matching tab.closed/pane.closed', () => {
    const state = seededState();
    const next = applyLifecycleEvent(state, {
      host: 'laptop',
      event: 'workspace.closed',
      payload: { id: 'w1', host: 'laptop' },
    });

    expect(next.workspaces.size).toBe(0);
    expect(next.tabs.size).toBe(0);
    expect(next.panes.size).toBe(0);
  });

  it("workspace.closed leaves other hosts'/workspaces' resources untouched", () => {
    const state = seededState();
    const otherWorkspace = workspace({ id: 'w2', host: 'desktop' });
    const otherTab = tab({ id: 't3', host: 'desktop', workspace: { id: 'w2' } });
    const otherPane = pane({
      id: 'p3',
      host: 'desktop',
      workspace: { id: 'w2', name: 'other' },
      tab: { id: 't3', name: 'other-tab' },
    });
    const seeded: LifecycleState = {
      panes: new Map([...state.panes, [paneKey(otherPane.host, otherPane.id), otherPane]]),
      workspaces: new Map([...state.workspaces, [paneKey('desktop', 'w2'), otherWorkspace]]),
      tabs: new Map([...state.tabs, [paneKey('desktop', 't3'), otherTab]]),
    };

    const next = applyLifecycleEvent(seeded, {
      host: 'laptop',
      event: 'workspace.closed',
      payload: { id: 'w1', host: 'laptop' },
    });

    expect(next.workspaces.get(paneKey('desktop', 'w2'))).toEqual(otherWorkspace);
    expect(next.tabs.get(paneKey('desktop', 't3'))).toEqual(otherTab);
    expect(next.panes.get(paneKey('desktop', 'p3'))).toEqual(otherPane);
  });

  it("tab.closed purges only that tab's panes, not sibling tabs in the same workspace", () => {
    const state = seededState();
    const next = applyLifecycleEvent(state, {
      host: 'laptop',
      event: 'tab.closed',
      payload: { id: 't1', host: 'laptop', workspace: { id: 'w1' } },
    });

    expect(next.tabs.has(paneKey('laptop', 't1'))).toBe(false);
    expect(next.tabs.has(paneKey('laptop', 't2'))).toBe(true);
    expect(next.panes.has(paneKey('laptop', 'p1'))).toBe(false);
    expect(next.panes.has(paneKey('laptop', 'p2'))).toBe(true);
    // workspace itself is untouched — only the closed tab and its panes purge.
    expect(next.workspaces.has(paneKey('laptop', 'w1'))).toBe(true);
  });

  it("pane.moved updates the pane's workspace/tab refs in place", () => {
    const state = seededState();
    const movedPane = pane({
      id: 'p1',
      workspace: { id: 'w1', name: 'workspace-1' },
      tab: { id: 't2', name: 'tab-2' },
    });
    const next = applyLifecycleEvent(state, {
      host: 'laptop',
      event: 'pane.moved',
      payload: {
        pane: movedPane,
        previous_workspace_id: 'w1',
        previous_tab_id: 't1',
      },
    });

    expect(next.panes.get(paneKey('laptop', 'p1'))).toEqual(movedPane);
    expect(next.panes.size).toBe(2);
  });

  it('pane.moved inserts created_workspace/created_tab and purges closed_workspace_id/closed_tab_id', () => {
    const state = seededState();
    const newWorkspace = workspace({ id: 'w9', name: 'brand-new' });
    const newTab = tab({ id: 't9', workspace: { id: 'w9' }, name: 'brand-new-tab' });
    const movedPane = pane({
      id: 'p2',
      workspace: { id: 'w9', name: 'brand-new' },
      tab: { id: 't9', name: 'brand-new-tab' },
    });

    const next = applyLifecycleEvent(state, {
      host: 'laptop',
      event: 'pane.moved',
      payload: {
        pane: movedPane,
        previous_workspace_id: 'w1',
        previous_tab_id: 't2',
        created_workspace: newWorkspace,
        created_tab: newTab,
        // t2 was the only other pane in w1/t2 before the move, so tearing
        // it out closed both the tab and (in this contrived example) the
        // workspace too.
        closed_workspace_id: undefined,
        closed_tab_id: 't2',
      },
    });

    expect(next.workspaces.get(paneKey('laptop', 'w9'))).toEqual(newWorkspace);
    expect(next.tabs.get(paneKey('laptop', 't9'))).toEqual(newTab);
    expect(next.tabs.has(paneKey('laptop', 't2'))).toBe(false);
    expect(next.panes.get(paneKey('laptop', 'p2'))).toEqual(movedPane);
  });

  it('workspace.created/renamed and tab.created/renamed update their maps', () => {
    let state: LifecycleState = { panes: new Map(), workspaces: new Map(), tabs: new Map() };

    state = applyLifecycleEvent(state, {
      host: 'laptop',
      event: 'workspace.created',
      payload: { workspace: workspace() },
    });
    expect(state.workspaces.get(paneKey('laptop', 'w1'))?.name).toBe('workspace-1');

    state = applyLifecycleEvent(state, {
      host: 'laptop',
      event: 'workspace.renamed',
      payload: { id: 'w1', host: 'laptop', name: 'renamed-workspace' },
    });
    expect(state.workspaces.get(paneKey('laptop', 'w1'))?.name).toBe('renamed-workspace');

    state = applyLifecycleEvent(state, {
      host: 'laptop',
      event: 'tab.created',
      payload: { tab: tab() },
    });
    expect(state.tabs.get(paneKey('laptop', 't1'))?.name).toBe('tab-1');

    state = applyLifecycleEvent(state, {
      host: 'laptop',
      event: 'tab.renamed',
      payload: { id: 't1', host: 'laptop', workspace: { id: 'w1' }, name: 'renamed-tab' },
    });
    expect(state.tabs.get(paneKey('laptop', 't1'))?.name).toBe('renamed-tab');
  });

  it('tab.moved replaces the whole tab list for that workspace', () => {
    const state = seededState();
    const reordered = [tab({ id: 't2' }), tab({ id: 't1' })];

    const next = applyLifecycleEvent(state, {
      host: 'laptop',
      event: 'tab.moved',
      payload: { host: 'laptop', workspace: { id: 'w1' }, tabs: reordered },
    });

    expect([...next.tabs.values()].map((t) => t.id).sort()).toEqual(['t1', 't2']);
  });
});

describe('PanesStore createTab/createWorkspace', () => {
  let ws: FakeWsClient;

  function setUp(): { store: PanesStore; httpMock: HttpTestingController } {
    ws = new FakeWsClient();
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: WsClient, useValue: ws },
      ],
    });
    const store = TestBed.inject(PanesStore);
    const httpMock = TestBed.inject(HttpTestingController);
    return { store, httpMock };
  }

  afterEach(() => {
    TestBed.inject(HttpTestingController).verify();
  });

  // Regression: the "New tab"/"New workspace" header actions call
  // `requestPendingRename` right after these resolve so the rail can
  // auto-open the item's inline rename field. That only works if the item
  // is ALREADY in `tabsSignal`/`workspacesSignal` by the time the promise
  // resolves — waiting on the separate `tab.created`/`workspace.created`
  // broadcast event instead is a race (E2E caught it: the event can lag
  // behind the request's own response, or never arrive to the sender in
  // time), so these must insert from the method's own result directly.
  it('createTab inserts the new tab (and root pane) into the store synchronously with the response, without any event', async () => {
    const { store, httpMock } = setUp();
    ws.request.and.callFake((_host: string, method: string) => {
      if (method === 'pane.list') return Promise.resolve({ panes: [] });
      if (method === 'events.subscribe') return Promise.resolve({ subscription_id: 's1' });
      if (method === 'tab.create') {
        return Promise.resolve({
          tab: { id: 't-new', host: 'laptop', workspace: { id: 'w1' }, name: 'tab-3' },
          pane: pane({
            id: 'p-new',
            workspace: { id: 'w1', name: 'w' },
            tab: { id: 't-new', name: 'tab-3' },
          }),
        });
      }
      return Promise.reject(new Error(`unexpected method ${method}`));
    });
    await settle();
    for (const req of httpMock.match('/api/hosts')) {
      if (!req.cancelled) req.flush({ hosts: [{ name: 'laptop', connected: true }] });
    }
    await settle();

    const result = await store.createTab('laptop', { workspace_id: 'w1' });

    // No `tab.created` event was ever emitted on `ws.events$` — the insert
    // must come from the response alone.
    expect(store.tabsSignal().get(paneKey('laptop', 't-new'))).toEqual(result!.tab);
    expect(store.panesSignal().get(paneKey('laptop', 'p-new'))).toEqual(result!.pane);
  });

  it('createWorkspace inserts the new workspace/tab/pane into the store synchronously with the response, without any event', async () => {
    const { store, httpMock } = setUp();
    ws.request.and.callFake((_host: string, method: string) => {
      if (method === 'pane.list') return Promise.resolve({ panes: [] });
      if (method === 'events.subscribe') return Promise.resolve({ subscription_id: 's1' });
      if (method === 'workspace.create') {
        return Promise.resolve({
          workspace: { id: 'w-new', host: 'laptop', name: 'workspace-3' },
          tab: { id: 't-new', host: 'laptop', workspace: { id: 'w-new' }, name: 'tab-1' },
          pane: pane({
            id: 'p-new',
            workspace: { id: 'w-new', name: 'workspace-3' },
            tab: { id: 't-new', name: 'tab-1' },
          }),
        });
      }
      return Promise.reject(new Error(`unexpected method ${method}`));
    });
    await settle();
    for (const req of httpMock.match('/api/hosts')) {
      if (!req.cancelled) req.flush({ hosts: [{ name: 'laptop', connected: true }] });
    }
    await settle();

    const result = await store.createWorkspace('laptop', {});

    expect(store.workspacesSignal().get(paneKey('laptop', 'w-new'))).toEqual(result!.workspace);
    expect(store.tabsSignal().get(paneKey('laptop', 't-new'))).toEqual(result!.tab);
    expect(store.panesSignal().get(paneKey('laptop', 'p-new'))).toEqual(result!.pane);
  });
});

// Regression coverage for the MLP gate's 4 E2E failures (tier3.spec.ts):
// (1) pointer-events was a misdiagnosis in a throwaway script, not a real
//     app bug — reverted in card.scss/rail.scss, no store-level test needed.
// (2) tab.closed purging via the STORE's actual event subscription (not
//     just the pure `applyLifecycleEvent` reducer already covered above),
//     plus making close actions themselves optimistic so the UI doesn't
//     depend on that event's round-trip latency at all.
// (3+4) tab.create's/workspace.create's response pane carries the tab's
//     PRE-rename label (create-then-rename is two round trips) — a card
//     matched by the renamed name never appeared because nothing refreshed
//     `Pane.tab.name`/`Pane.workspace.name` when a `tab.renamed`/
//     `workspace.renamed` event landed.
describe('applyLifecycleEvent: rename refreshes denormalized pane names', () => {
  function seeded(): LifecycleState {
    const p = pane({
      id: 'p1',
      host: 'laptop',
      workspace: { id: 'w1', name: 'old-workspace-name' },
      tab: { id: 't1', name: 'old-tab-name' },
    });
    return {
      panes: new Map([[paneKey('laptop', 'p1'), p]]),
      workspaces: new Map([
        [paneKey('laptop', 'w1'), { id: 'w1', host: 'laptop', name: 'old-workspace-name' }],
      ]),
      tabs: new Map([
        [
          paneKey('laptop', 't1'),
          { id: 't1', host: 'laptop', workspace: { id: 'w1' }, name: 'old-tab-name' },
        ],
      ]),
    };
  }

  it("tab.renamed updates tabsSignal AND every pane whose tab.id matches (the E2E-visible symptom: a card's .path text never picks up the renamed tab)", () => {
    const before = seeded();
    // Before this fix, `pane.tab.name` on p1 stayed "old-tab-name" forever —
    // this is the exact state a card's `hasText: newName` locator failed
    // to match against in tier3.spec.ts:306/365.
    expect(before.panes.get(paneKey('laptop', 'p1'))?.tab.name).toBe('old-tab-name');

    const after = applyLifecycleEvent(before, {
      host: 'laptop',
      event: 'tab.renamed',
      payload: { id: 't1', host: 'laptop', workspace: { id: 'w1' }, name: 'kanhrd-e2e-123' },
    });

    expect(after.tabs.get(paneKey('laptop', 't1'))?.name).toBe('kanhrd-e2e-123');
    expect(after.panes.get(paneKey('laptop', 'p1'))?.tab.name).toBe('kanhrd-e2e-123');
    // Nothing else about the pane changed.
    expect(after.panes.get(paneKey('laptop', 'p1'))?.workspace.name).toBe('old-workspace-name');
  });

  it('workspace.renamed updates workspacesSignal AND every pane whose workspace.id matches', () => {
    const before = seeded();

    const after = applyLifecycleEvent(before, {
      host: 'laptop',
      event: 'workspace.renamed',
      payload: { id: 'w1', host: 'laptop', name: 'renamed-workspace' },
    });

    expect(after.workspaces.get(paneKey('laptop', 'w1'))?.name).toBe('renamed-workspace');
    expect(after.panes.get(paneKey('laptop', 'p1'))?.workspace.name).toBe('renamed-workspace');
    expect(after.panes.get(paneKey('laptop', 'p1'))?.tab.name).toBe('old-tab-name');
  });

  it('tab.renamed for an unrelated tab/host leaves the pane untouched (same map instance)', () => {
    const before = seeded();
    const after = applyLifecycleEvent(before, {
      host: 'laptop',
      event: 'tab.renamed',
      payload: { id: 't-other', host: 'laptop', workspace: { id: 'w1' }, name: 'irrelevant' },
    });
    expect(after.panes).toBe(before.panes);
  });
});

describe('PanesStore tab.closed: real event-subscription wiring (not just the pure reducer)', () => {
  let ws: FakeWsClient;

  function setUp(): { store: PanesStore; httpMock: HttpTestingController } {
    ws = new FakeWsClient();
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: WsClient, useValue: ws },
      ],
    });
    const store = TestBed.inject(PanesStore);
    const httpMock = TestBed.inject(HttpTestingController);
    return { store, httpMock };
  }

  afterEach(() => {
    TestBed.inject(HttpTestingController).verify();
  });

  it('a tab.closed event received on ws.events$ purges the tab and its panes from the live store signals', async () => {
    const { store, httpMock } = setUp();
    const seededPane = pane({
      id: 'p1',
      host: 'laptop',
      workspace: { id: 'w1', name: 'w' },
      tab: { id: 't1', name: 'doomed-tab' },
    });
    ws.request.and.callFake((_host: string, method: string) => {
      if (method === 'pane.list') return Promise.resolve({ panes: [seededPane] });
      if (method === 'events.subscribe') return Promise.resolve({ subscription_id: 's1' });
      return Promise.reject(new Error(`unexpected method ${method}`));
    });
    await settle();
    for (const req of httpMock.match('/api/hosts')) {
      if (!req.cancelled) req.flush({ hosts: [{ name: 'laptop', connected: true }] });
    }
    await settle();

    // Preconditions: the initial pane.list-derived seeding put both in.
    expect(store.tabsSignal().get(paneKey('laptop', 't1'))).toBeTruthy();
    expect(store.panesSignal().get(paneKey('laptop', 'p1'))).toBeTruthy();

    ws.events$.next({
      host: 'laptop',
      event: 'tab.closed',
      payload: { id: 't1', host: 'laptop', workspace: { id: 'w1' } },
    });
    await settle();

    expect(store.tabsSignal().has(paneKey('laptop', 't1'))).toBe(false);
    expect(store.panesSignal().has(paneKey('laptop', 'p1'))).toBe(false);
  });
});

describe("PanesStore close actions are optimistic (don't wait on the broadcast event)", () => {
  let ws: FakeWsClient;

  function setUp(): { store: PanesStore; httpMock: HttpTestingController } {
    ws = new FakeWsClient();
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: WsClient, useValue: ws },
      ],
    });
    const store = TestBed.inject(PanesStore);
    const httpMock = TestBed.inject(HttpTestingController);
    return { store, httpMock };
  }

  afterEach(() => {
    TestBed.inject(HttpTestingController).verify();
  });

  it('closeTab removes the tab and its panes as soon as the request resolves — no tab.closed event fired', async () => {
    const { store, httpMock } = setUp();
    const seededPane = pane({
      id: 'p1',
      host: 'laptop',
      workspace: { id: 'w1', name: 'w' },
      tab: { id: 't1', name: 'doomed-tab' },
    });
    ws.request.and.callFake((_host: string, method: string) => {
      if (method === 'pane.list') return Promise.resolve({ panes: [seededPane] });
      if (method === 'events.subscribe') return Promise.resolve({ subscription_id: 's1' });
      if (method === 'tab.close') return Promise.resolve({});
      return Promise.reject(new Error(`unexpected method ${method}`));
    });
    await settle();
    for (const req of httpMock.match('/api/hosts')) {
      if (!req.cancelled) req.flush({ hosts: [{ name: 'laptop', connected: true }] });
    }
    await settle();
    expect(store.tabsSignal().has(paneKey('laptop', 't1'))).toBe(true);

    await store.closeTab('laptop', 't1');

    // No event was ever emitted — purge came from the response alone.
    expect(store.tabsSignal().has(paneKey('laptop', 't1'))).toBe(false);
    expect(store.panesSignal().has(paneKey('laptop', 'p1'))).toBe(false);
  });

  it('renamePane applies the returned label without waiting for the pane.updated broadcast', async () => {
    const { store, httpMock } = setUp();
    const seededPane = pane({ id: 'p1', host: 'laptop' });
    ws.request.and.callFake((_host: string, method: string, params?: unknown) => {
      if (method === 'pane.list') return Promise.resolve({ panes: [seededPane] });
      if (method === 'events.subscribe') return Promise.resolve({ subscription_id: 's1' });
      if (method === 'pane.rename') {
        const label = (params as { label: string | null }).label;
        return Promise.resolve({
          pane: label === null ? seededPane : { ...seededPane, label },
        });
      }
      return Promise.reject(new Error(`unexpected method ${method}`));
    });
    await settle();
    for (const req of httpMock.match('/api/hosts')) {
      if (!req.cancelled) req.flush({ hosts: [{ name: 'laptop', connected: true }] });
    }
    await settle();

    await store.renamePane('laptop', 'p1', 'fix the backlog storm');
    expect(store.panesSignal().get(paneKey('laptop', 'p1'))?.label).toBe('fix the backlog storm');

    // Clearing round-trips too: herdr answers with a pane that has no label.
    await store.renamePane('laptop', 'p1', null);
    expect(store.panesSignal().get(paneKey('laptop', 'p1'))?.label).toBeUndefined();
  });

  it('closePane removes the pane as soon as the request resolves — no pane.closed event fired', async () => {
    const { store, httpMock } = setUp();
    const seededPane = pane({ id: 'p1', host: 'laptop' });
    ws.request.and.callFake((_host: string, method: string) => {
      if (method === 'pane.list') return Promise.resolve({ panes: [seededPane] });
      if (method === 'events.subscribe') return Promise.resolve({ subscription_id: 's1' });
      if (method === 'pane.close') return Promise.resolve({});
      return Promise.reject(new Error(`unexpected method ${method}`));
    });
    await settle();
    for (const req of httpMock.match('/api/hosts')) {
      if (!req.cancelled) req.flush({ hosts: [{ name: 'laptop', connected: true }] });
    }
    await settle();
    expect(store.panesSignal().has(paneKey('laptop', 'p1'))).toBe(true);

    await store.closePane('laptop', 'p1');

    expect(store.panesSignal().has(paneKey('laptop', 'p1'))).toBe(false);
  });

  // Round-4 regression: live-bridge diagnosis (trace evidence in the round-4
  // report) showed `tab.rename`'s own WS response resolves with the correct
  // new name, but the paired `tab.renamed` broadcast event never arrives for
  // a tab created earlier in the SAME session — only for tabs that already
  // existed when the client subscribed. Waiting on that event (the design
  // prior to this fix) left the rail's create-then-rename flow permanently
  // stuck showing the pre-rename label. `renameTab`/`renameWorkspace` must
  // apply their own response directly, exactly like every other tier-3
  // action here.
  it('renameTab updates tabsSignal AND the denormalized pane.tab.name as soon as the request resolves — no tab.renamed event fired', async () => {
    const { store, httpMock } = setUp();
    const seededPane = pane({
      id: 'p1',
      host: 'laptop',
      workspace: { id: 'w1', name: 'w' },
      tab: { id: 't1', name: '4' },
    });
    ws.request.and.callFake((_host: string, method: string) => {
      if (method === 'pane.list') return Promise.resolve({ panes: [seededPane] });
      if (method === 'events.subscribe') return Promise.resolve({ subscription_id: 's1' });
      if (method === 'tab.rename') {
        return Promise.resolve({
          tab: { id: 't1', host: 'laptop', workspace: { id: 'w1' }, name: 'renamed' },
        });
      }
      return Promise.reject(new Error(`unexpected method ${method}`));
    });
    await settle();
    for (const req of httpMock.match('/api/hosts')) {
      if (!req.cancelled) req.flush({ hosts: [{ name: 'laptop', connected: true }] });
    }
    await settle();
    expect(store.tabsSignal().get(paneKey('laptop', 't1'))?.name).toBe('4');

    await store.renameTab('laptop', 't1', 'renamed');

    // No event was ever emitted on ws.events$ — the update came from the
    // tab.rename response alone.
    expect(store.tabsSignal().get(paneKey('laptop', 't1'))?.name).toBe('renamed');
    expect(store.panesSignal().get(paneKey('laptop', 'p1'))?.tab.name).toBe('renamed');
  });

  it('renameWorkspace updates workspacesSignal AND the denormalized pane.workspace.name as soon as the request resolves — no workspace.renamed event fired', async () => {
    const { store, httpMock } = setUp();
    const seededPane = pane({
      id: 'p1',
      host: 'laptop',
      workspace: { id: 'w1', name: 'old' },
      tab: { id: 't1', name: 't' },
    });
    ws.request.and.callFake((_host: string, method: string) => {
      if (method === 'pane.list') return Promise.resolve({ panes: [seededPane] });
      if (method === 'events.subscribe') return Promise.resolve({ subscription_id: 's1' });
      if (method === 'workspace.rename') {
        return Promise.resolve({ workspace: { id: 'w1', host: 'laptop', name: 'renamed-ws' } });
      }
      return Promise.reject(new Error(`unexpected method ${method}`));
    });
    await settle();
    for (const req of httpMock.match('/api/hosts')) {
      if (!req.cancelled) req.flush({ hosts: [{ name: 'laptop', connected: true }] });
    }
    await settle();

    await store.renameWorkspace('laptop', 'w1', 'renamed-ws');

    expect(store.workspacesSignal().get(paneKey('laptop', 'w1'))?.name).toBe('renamed-ws');
    expect(store.panesSignal().get(paneKey('laptop', 'p1'))?.workspace.name).toBe('renamed-ws');
  });
});
