import { WritableSignal, provideZonelessChangeDetection, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { BehaviorSubject, Subject, of } from 'rxjs';
import type { BridgeCapabilities, HostSummary, Pane, WsEvent } from '@kanhrd/schema';
import { Terminal } from '@xterm/xterm';
import type { ITheme } from '@xterm/xterm';
import { PaneDetail, nextSiblingCard } from './pane-detail';
import { SPLIT_STORAGE_KEY, loadSplit } from './file-panel-split';
import { TerminalThemeService } from '../state/terminal-theme.service';
import { TerminalFontSizeService } from '../state/terminal-font-size.service';
import { TerminalScrollbackService } from '../state/terminal-scrollback.service';
import { BoardReturnService } from '../state/board-return.service';
import { COPY, fill } from '../shared/copy';
import { PanesStore } from '../state/panes.store';
import { WsClient } from '../state/ws-client';

/**
 * What is left here after the terminal moved into `PaneTerminal`: the things
 * that genuinely need a mounted component — the route driving which pane is
 * shown, the header and meta strip, the back paths, and the one reliability
 * state this component owns rather than the terminal (`unavailable`, from
 * host connectivity).
 *
 * Painting, input, the send queue, fit/touch/theme/font handling and the
 * state ladder itself are unit-tested against `PaneTerminal` directly in
 * `pane-terminal.spec.ts` — no fixture, no TestBed.
 */

class FakeWsClient {
  readonly connected = signal(true);
  readonly events$ = new Subject<WsEvent>();
  readonly request = jasmine.createSpy('request').and.callFake((_host: string, method: string) => {
    switch (method) {
      case 'pane.read':
        return Promise.resolve({
          content: 'hello',
          revision: 1,
          truncated: false,
          format: 'ansi',
          source: 'recent',
        });
      case 'pane.subscribe_output':
        return Promise.resolve({ subscription_id: 'sub-1' });
      default:
        return Promise.resolve({});
    }
  });
}

async function flushMicrotasks(): Promise<void> {
  for (let i = 0; i < 15; i++) {
    await Promise.resolve();
  }
}

/**
 * Metadata strip: herdr's own git provenance for the pane's workspace,
 * rendered in FULL here (the board card shows a computed tail instead) and
 * omitted entirely — no placeholder row — when the workspace resolves
 * outside a repository. Own TestBed so the shared one below keeps its empty
 * pane map.
 */
describe('PaneDetail metadata strip — project provenance', () => {
  const CHECKOUT = '/home/op/workspace/src/github.com/wakaru44/kanhrd';

  async function renderWith(pane: Partial<Pane> | null): Promise<HTMLElement> {
    const panes = new Map<string, Pane>();
    if (pane) {
      panes.set('laptop:pane-1', {
        id: 'pane-1',
        host: 'laptop',
        workspace: { id: 'w1', name: 'kanhrd' },
        tab: { id: 't1', name: 'main' },
        agent_status: 'working',
        ...pane,
      });
    }

    await TestBed.configureTestingModule({
      imports: [PaneDetail],
      providers: [
        provideZonelessChangeDetection(),
        { provide: WsClient, useValue: new FakeWsClient() },
        {
          provide: PanesStore,
          useValue: {
            panesSignal: () => panes,
            // The bar draws herdr's tab level from this (add-pane-tab-hierarchy).
            tabsSignal: () => new Map(),
            capabilitiesSignal: () => new Map(),
            hostsSignal: () => [{ name: 'laptop', connected: true }],
          },
        },
        {
          provide: ActivatedRoute,
          useValue: { paramMap: of(convertToParamMap({ host: 'laptop', id: 'pane-1' })) },
        },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(PaneDetail);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  afterEach(() => TestBed.resetTestingModule());

  it("shows the repo name and the whole checkout path, not the card's truncated form", async () => {
    const el = await renderWith({
      project: { repo_name: 'kanhrd', checkout_path: CHECKOUT, is_linked_worktree: false },
    });

    expect(el.querySelector('.meta-strip .repo-name')?.textContent?.trim()).toBe('kanhrd');
    expect(el.querySelector('.meta-strip .checkout-path')?.textContent?.trim()).toBe(CHECKOUT);
  });

  it('omits both rows entirely when the pane has no project', async () => {
    const el = await renderWith({});

    expect(el.querySelector('.meta-strip .repo-name')).toBeNull();
    expect(el.querySelector('.meta-strip .checkout-path')).toBeNull();
  });

  it("titles the header with the operator's own label when there is one", async () => {
    const el = await renderWith({ label: 'fix the backlog storm', agent: { name: 'claude' } });

    expect(el.querySelector('.pane-title')?.textContent?.trim()).toBe('fix the backlog storm');
  });
});

/**
 * The top bar: the workspace / tab breadcrumb, the sibling-card switcher and
 * the next-card button. All three are derived from panes already in
 * `PanesStore` — the assertions below include the one that says so (no
 * request beyond the existing `pane.read` / `pane.subscribe_output` pair).
 *
 * karma's viewport sits permanently below `--breakpoint-mobile`, so every
 * render here IS the phone case: a switcher that failed maintainer decision
 * D1 by hiding at phone width would fail these tests, not pass them.
 */
describe('PaneDetail top bar', () => {
  let ws: FakeWsClient;
  let fixture: ComponentFixture<PaneDetail>;
  let panes: Map<string, Pane>;

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

  async function render(
    list: Pane[],
    currentId = 'pane-1',
    tabs: { id: string; host: string; name: string; workspace: { id: string } }[] = []
  ): Promise<HTMLElement> {
    ws = new FakeWsClient();
    panes = new Map(list.map((p) => [`${p.host}:${p.id}`, p]));
    const tabMap = new Map(tabs.map((t) => [`${t.host}:${t.id}`, t]));

    await TestBed.configureTestingModule({
      imports: [PaneDetail],
      providers: [
        provideZonelessChangeDetection(),
        { provide: WsClient, useValue: ws },
        {
          provide: PanesStore,
          useValue: {
            panesSignal: () => panes,
            capabilitiesSignal: () => new Map(),
            hostsSignal: () => [{ name: 'laptop', connected: true }],
            tabsSignal: () => tabMap,
            tabFilterSignal: () => null,
            scopeSignal: () => null,
            primaryHostKeybinds: () => null,
          },
        },
        {
          provide: ActivatedRoute,
          useValue: { paramMap: of(convertToParamMap({ host: 'laptop', id: currentId })) },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(PaneDetail);
    const root = fixture.nativeElement as HTMLElement;
    root.style.display = 'block';
    root.style.height = '400px';
    fixture.detectChanges();
    await flushMicrotasks();
    fixture.detectChanges();
    return root;
  }

  afterEach(() => TestBed.resetTestingModule());

  // --- the two levels (add-pane-tab-hierarchy) ---------------------------

  function tabOf(id: string, name: string) {
    return { id, host: 'laptop', name, workspace: { id: 'w1' } };
  }

  it("draws herdr's two levels: the workspace's tabs, then this tab's cards", async () => {
    const el = await render(
      [pane('pane-1'), pane('pane-2'), pane('pane-3', { tab: { id: 't2', name: 'gpt' } })],
      'pane-1',
      [tabOf('t1', 'build'), tabOf('t2', 'gpt')]
    );

    const tabs = Array.from(el.querySelectorAll('app-tab-strip a.tab'));
    expect(tabs.map((a) => a.querySelector('.tab-name')?.textContent?.trim())).toEqual([
      'build',
      'gpt',
    ]);
    expect(tabs.map((a) => a.querySelector('.tab-count')?.textContent?.trim())).toEqual(['2', '1']);
    expect(tabs[0].getAttribute('aria-current'))
      .withContext('the route pane sits in t1')
      .toBe('page');
    // The pane level is still there, below the tabs and subordinate to them.
    expect(el.querySelectorAll('app-card-switcher .entry').length).toBe(2);
  });

  it('renders no tab strip in a workspace of one tab — no empty rail', async () => {
    const el = await render([pane('pane-1'), pane('pane-2')], 'pane-1', [tabOf('t1', 'build')]);

    expect(el.querySelector('app-tab-strip')).toBeNull();
    expect(el.querySelector('app-card-switcher'))
      .withContext('the pane level stays')
      .not.toBeNull();
  });

  // --- breadcrumb --------------------------------------------------------

  it('shows workspace / tab, and leaves the host to the seal', async () => {
    const el = await render([pane('pane-1')]);

    expect(el.querySelector('.breadcrumb .crumb-workspace')?.textContent?.trim()).toBe('kanhrd');
    expect(el.querySelector('.breadcrumb .crumb-tab')?.textContent?.trim()).toBe('build');
    expect(el.querySelector('.breadcrumb')?.textContent).not.toContain('laptop');
    expect(el.querySelector('.host-seal')?.textContent?.trim()).toBe('laptop');
  });

  it('collapses the breadcrumb to the tab name below the mobile breakpoint', async () => {
    const el = await render([pane('pane-1')]);

    // karma's viewport is below `--breakpoint-mobile`, so this IS the phone case.
    expect(window.innerWidth).toBeLessThan(900);
    expect(getComputedStyle(el.querySelector('.crumb-workspace') as Element).display).toBe('none');
    expect(getComputedStyle(el.querySelector('.crumb-sep') as Element).display).toBe('none');
    expect(getComputedStyle(el.querySelector('.crumb-tab') as Element).display).not.toBe('none');
  });

  // --- sibling derivation ------------------------------------------------

  it('derives siblings from the store alone, with no request beyond the pane it is showing', async () => {
    const el = await render([pane('pane-1'), pane('pane-2')]);

    expect(el.querySelectorAll('app-card-switcher a.entry').length).toBe(2);
    const methods = new Set(ws.request.calls.allArgs().map(([, method]) => method as string));
    expect(methods).toEqual(new Set(['pane.read', 'pane.subscribe_output']));
  });

  it('excludes a pane in another tab and a pane on another host', async () => {
    const el = await render([
      pane('pane-1'),
      pane('pane-2'),
      pane('elsewhere', { tab: { id: 't2', name: 'other' } }),
      pane('remote', { host: 'server' }),
    ]);

    const hrefs = Array.from(
      el.querySelectorAll<HTMLAnchorElement>('app-card-switcher a.entry')
    ).map((a) => a.getAttribute('href'));
    expect(hrefs).toEqual(['/pane/laptop/pane-1', '/pane/laptop/pane-2']);
  });

  it('renders no switcher and no next-card button for a tab of one', async () => {
    const el = await render([pane('pane-1')]);

    expect(el.querySelector('app-card-switcher')).toBeNull();
    expect(el.querySelector('.next-card')).toBeNull();
  });

  // --- the switcher on the bar -------------------------------------------

  it('renders the switcher at phone width, with the back control still first and visible', async () => {
    const el = await render([pane('pane-1'), pane('pane-2'), pane('pane-3')]);

    expect(el.querySelector('app-card-switcher')).not.toBeNull();
    const focusable = el.querySelectorAll('header a, header button');
    expect(focusable[0]).toBe(el.querySelector('header .back') as Element);
    // The strip scrolls, not the page.
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(
      document.documentElement.clientWidth
    );
  });

  it('leaves the terminal a non-zero box once the header has grown a switcher row', async () => {
    const withSwitcher = await render([pane('pane-1'), pane('pane-2')]);
    const container = withSwitcher.querySelector('.terminal-container') as HTMLElement;

    expect(withSwitcher.querySelector('header')?.getBoundingClientRect().height).toBeGreaterThan(0);
    expect(container.getBoundingClientRect().height).toBeGreaterThan(0);
  });

  // --- the next-card button ----------------------------------------------

  it('hops to the other card in a tab of two, and says so in words', async () => {
    const el = await render([pane('pane-1'), pane('pane-2')]);
    const navigate = spyOn(TestBed.inject(Router), 'navigate');
    const button = el.querySelector('.next-card') as HTMLButtonElement;

    expect(button.getAttribute('aria-label')).toBe(COPY.nav.nextCard);
    expect(button.querySelector('svg')).not.toBeNull();

    button.click();

    expect(navigate).toHaveBeenCalledWith(['/pane', 'laptop', 'pane-2']);
  });

  it('lands two presses where two prefix+o presses land, and wraps past the last', async () => {
    const three = [pane('pane-1'), pane('pane-2'), pane('pane-3')];

    expect(nextSiblingCard(three, 'pane-1')?.id).toBe('pane-2');
    expect(nextSiblingCard(three, 'pane-2')?.id).toBe('pane-3');
    expect(nextSiblingCard(three, 'pane-3')?.id).toBe('pane-1');
    expect(nextSiblingCard([three[0]], 'pane-1')).toBeNull();

    // And the button is wired to that same function, not to a second answer.
    const el = await render(three, 'pane-3');
    const navigate = spyOn(TestBed.inject(Router), 'navigate');
    (el.querySelector('.next-card') as HTMLButtonElement).click();
    expect(navigate).toHaveBeenCalledWith(['/pane', 'laptop', 'pane-1']);
  });

  it('keeps the next-card button at the touch minimum under a coarse pointer', async () => {
    // headless Chrome reports a fine pointer; the Playwright `mobile` project
    // measures the real box. The rule's presence is what is asserted here.
    await render([pane('pane-1'), pane('pane-2')]);
    const styles = (
      (PaneDetail as unknown as { ɵcmp: { styles?: string[] } }).ɵcmp.styles ?? []
    ).join('');

    expect(styles).toContain('.next-card');
    expect(styles).toMatch(/pointer: ?coarse/);
    expect(styles).toContain('var(--touch-target-min)');
  });
});

describe('PaneDetail', () => {
  let ws: FakeWsClient;
  let fixture: ComponentFixture<PaneDetail>;
  let paramMap$: BehaviorSubject<ReturnType<typeof convertToParamMap>>;
  let hosts: WritableSignal<HostSummary[]>;
  let panes: WritableSignal<ReadonlyMap<string, Pane>>;

  /** DOM-level view of the reliability state, asserted through the markup rather than a protected signal. */
  function stateEl(selector: string): Element | null {
    return fixture.nativeElement.querySelector(selector) as Element | null;
  }

  beforeEach(async () => {
    ws = new FakeWsClient();
    hosts = signal<HostSummary[]>([{ name: 'laptop', connected: true }]);
    panes = signal<ReadonlyMap<string, Pane>>(new Map());
    paramMap$ = new BehaviorSubject(convertToParamMap({ host: 'laptop', id: 'pane-1' }));

    await TestBed.configureTestingModule({
      imports: [PaneDetail],
      providers: [
        provideZonelessChangeDetection(),
        { provide: WsClient, useValue: ws },
        {
          provide: PanesStore,
          useValue: {
            panesSignal: () => panes(),
            // The bar draws herdr's tab level from this (add-pane-tab-hierarchy).
            tabsSignal: () => new Map(),
            capabilitiesSignal: () => new Map(),
            hostsSignal: () => hosts(),
          },
        },
        {
          provide: ActivatedRoute,
          useValue: { paramMap: paramMap$ },
        },
        // Stubbed, not real: the real one reads a depth from localStorage.
        { provide: TerminalScrollbackService, useValue: { lines: signal(250) } },
      ],
    }).compileComponents();
  });

  // --- the route decides which pane the terminal is pointed at -------------

  it('fetches pane.read then subscribes to output on mount', async () => {
    fixture = TestBed.createComponent(PaneDetail);
    fixture.detectChanges();
    await flushMicrotasks();

    expect(ws.request).toHaveBeenCalledWith('laptop', 'pane.read', {
      pane_id: 'pane-1',
      format: 'ansi',
      source: 'recent',
      lines: 250,
    });
    expect(ws.request).toHaveBeenCalledWith('laptop', 'pane.subscribe_output', {
      pane_id: 'pane-1',
      source: 'recent',
      format: 'ansi',
      lines: 250,
      delta: true,
    });
  });

  it('unsubscribes on destroy', async () => {
    fixture = TestBed.createComponent(PaneDetail);
    fixture.detectChanges();
    await flushMicrotasks();

    fixture.destroy();

    expect(ws.request).toHaveBeenCalledWith('laptop', 'pane.unsubscribe_output', {
      subscription_id: 'sub-1',
    });
  });

  it('does not fetch on mount while the socket is disconnected, then fetches once it connects', async () => {
    ws.connected.set(false);

    fixture = TestBed.createComponent(PaneDetail);
    fixture.detectChanges();
    await flushMicrotasks();

    expect(ws.request).not.toHaveBeenCalledWith('laptop', 'pane.read', jasmine.anything());

    // Simulates the cold-deep-link case from apps/web/e2e/README.md: the WS
    // connection finishes opening after the component has already mounted.
    ws.connected.set(true);
    fixture.detectChanges();
    await flushMicrotasks();

    expect(ws.request).toHaveBeenCalledWith('laptop', 'pane.read', {
      pane_id: 'pane-1',
      format: 'ansi',
      source: 'recent',
      lines: 250,
    });
    expect(ws.request).toHaveBeenCalledWith('laptop', 'pane.subscribe_output', {
      pane_id: 'pane-1',
      source: 'recent',
      format: 'ansi',
      lines: 250,
      delta: true,
    });
  });

  it('refetches when the route params change to a different pane, without remounting', async () => {
    fixture = TestBed.createComponent(PaneDetail);
    fixture.detectChanges();
    await flushMicrotasks();

    expect(ws.request).toHaveBeenCalledWith('laptop', 'pane.read', {
      pane_id: 'pane-1',
      format: 'ansi',
      source: 'recent',
      lines: 250,
    });
    ws.request.calls.reset();

    paramMap$.next(convertToParamMap({ host: 'laptop', id: 'pane-2' }));
    fixture.detectChanges();
    await flushMicrotasks();

    // Old subscription is torn down and a fresh read+subscribe pair is
    // issued for the newly-active pane.
    expect(ws.request).toHaveBeenCalledWith('laptop', 'pane.unsubscribe_output', {
      subscription_id: 'sub-1',
    });
    expect(ws.request).toHaveBeenCalledWith('laptop', 'pane.read', {
      pane_id: 'pane-2',
      format: 'ansi',
      source: 'recent',
      lines: 250,
    });
    expect(ws.request).toHaveBeenCalledWith('laptop', 'pane.subscribe_output', {
      pane_id: 'pane-2',
      source: 'recent',
      format: 'ansi',
      lines: 250,
      delta: true,
    });
  });

  // --- reliability states, as the template renders them. The ladder itself
  // is `PaneTerminal`'s and is unit-tested there; what is checked here is
  // that each state reaches the markup with the right copy and controls, and
  // that `unavailable` — the one state this component owns — outranks it.

  it('shows the keeping-watch loading state before the first frame, and nothing else', async () => {
    ws.connected.set(false);

    fixture = TestBed.createComponent(PaneDetail);
    fixture.detectChanges();
    await flushMicrotasks();
    fixture.detectChanges();

    expect(stateEl('.terminal-loading')).not.toBeNull();
    expect(stateEl('.terminal-loading')?.textContent).toContain(COPY.loading.pane);
    expect(stateEl('.terminal-failed')).toBeNull();
    expect(stateEl('.terminal-empty')).toBeNull();
    expect(stateEl('.stale-marker')).toBeNull();
  });

  it('clears every state overlay once content has landed and the subscription is live', async () => {
    fixture = TestBed.createComponent(PaneDetail);
    fixture.detectChanges();
    await flushMicrotasks();
    fixture.detectChanges();

    expect(stateEl('.terminal-loading')).toBeNull();
    expect(stateEl('.terminal-failed')).toBeNull();
    expect(stateEl('.terminal-empty')).toBeNull();
    expect(stateEl('.terminal-unavailable')).toBeNull();
    expect(stateEl('.stale-marker')).toBeNull();
  });

  it('replaces loading with a retry and a back path when the read fails with nothing on screen', async () => {
    ws.request.and.callFake((_host: string, method: string) => {
      if (method === 'pane.read') {
        return Promise.reject(new Error('herdr said no'));
      }
      return Promise.resolve({});
    });

    fixture = TestBed.createComponent(PaneDetail);
    fixture.detectChanges();
    await flushMicrotasks();
    fixture.detectChanges();

    const failed = stateEl('.terminal-failed');
    expect(failed).not.toBeNull();
    // herdr's own wording is quoted verbatim, never rewritten.
    expect(failed?.textContent).toContain('herdr said no');
    expect(failed?.querySelector('button.retry')?.textContent).toContain(COPY.loading.retry);
    expect(failed?.querySelector('a.state-back')?.textContent).toContain(COPY.nav.backToBoard);
    // Never left spinning.
    expect(stateEl('.terminal-loading')).toBeNull();
  });

  it("wires the failed state's retry control to another attempt", async () => {
    let attempt = 0;
    ws.request.and.callFake((_host: string, method: string) => {
      switch (method) {
        case 'pane.read':
          attempt += 1;
          return attempt === 1
            ? Promise.reject(new Error('herdr said no'))
            : Promise.resolve({
                content: 'back',
                revision: 2,
                truncated: false,
                format: 'ansi',
                source: 'recent',
              });
        case 'pane.subscribe_output':
          return Promise.resolve({ subscription_id: 'sub-1' });
        default:
          return Promise.resolve({});
      }
    });

    fixture = TestBed.createComponent(PaneDetail);
    fixture.detectChanges();
    await flushMicrotasks();
    fixture.detectChanges();

    (stateEl('button.retry') as HTMLButtonElement).click();
    await flushMicrotasks();
    fixture.detectChanges();

    expect(attempt).toBe(2);
    expect(stateEl('.terminal-failed')).toBeNull();
  });

  it('marks a single disconnect stale in the meta strip', async () => {
    fixture = TestBed.createComponent(PaneDetail);
    fixture.detectChanges();
    await flushMicrotasks();
    fixture.detectChanges();

    // One host/bridge disconnect.
    ws.connected.set(false);
    fixture.detectChanges();

    expect(stateEl('.stale-marker')?.textContent).toContain(COPY.state.stale);
    // And it is not misreported as a fresh load or a failure.
    expect(stateEl('.terminal-loading')).toBeNull();
    expect(stateEl('.terminal-failed')).toBeNull();
  });

  it('reports a disconnected host as unavailable, with a back path', async () => {
    fixture = TestBed.createComponent(PaneDetail);
    fixture.detectChanges();
    await flushMicrotasks();
    fixture.detectChanges();

    hosts.set([{ name: 'laptop', connected: false }]);
    fixture.detectChanges();

    const unavailable = stateEl('.terminal-unavailable');
    expect(unavailable?.textContent).toContain(COPY.state.unavailable);
    expect(unavailable?.querySelector('a.state-back')?.textContent).toContain(COPY.nav.backToBoard);
  });

  it('does not claim a host is unavailable merely because the bridge has not listed it yet', async () => {
    hosts.set([]);

    fixture = TestBed.createComponent(PaneDetail);
    fixture.detectChanges();
    await flushMicrotasks();
    fixture.detectChanges();

    expect(stateEl('.terminal-unavailable')).toBeNull();
  });

  // --- gone: the pane was here, for a connected host, and has left the store.

  const PANE_1: Pane = {
    id: 'pane-1',
    host: 'laptop',
    workspace: { id: 'w1', name: 'kanhrd' },
    tab: { id: 't1', name: 'main' },
    agent_status: 'done',
  };

  /** Mounts with pane-1 in the store and live, then removes it the way `pane.closed` does. */
  async function mountThenClose(): Promise<void> {
    panes.set(new Map([['laptop:pane-1', PANE_1]]));
    fixture = TestBed.createComponent(PaneDetail);
    fixture.detectChanges();
    await flushMicrotasks();
    fixture.detectChanges();
    panes.set(new Map());
    fixture.detectChanges();
    await flushMicrotasks();
    fixture.detectChanges();
  }

  it('reports a pane that ends while open as gone, with a back path and no retry', async () => {
    await mountThenClose();

    const gone = stateEl('.terminal-gone');
    expect(gone?.textContent).toContain(COPY.state.gone);
    expect(gone?.querySelector('svg[lucideSunset]')).not.toBeNull();
    expect(gone?.querySelector('a.state-back')?.textContent).toContain(COPY.nav.backToBoard);
    // A caption under the frame, not a panel over it.
    expect(stateEl('.terminal-status .terminal-gone')).toBeNull();
    // The terminal now shares `.split` with the file panel, so the caption
    // follows that whole box rather than the terminal element itself.
    expect(stateEl('.split > .terminal-wrap')).not.toBeNull();
    expect(stateEl('.split + .gone-slot > .terminal-gone')).not.toBeNull();
    expect(stateEl('button.retry')).toBeNull();
    expect(stateEl('.stale-marker')).toBeNull();
    expect(stateEl('.terminal-unavailable')).toBeNull();
  });

  it('keeps the last frame, dimmed on the terminal container itself', async () => {
    await mountThenClose();

    const container = stateEl('.terminal-container');
    expect(container?.classList).toContain('inert');
    expect(container?.querySelector('.xterm')).not.toBeNull();
  });

  it('unsubscribes the output stream on entering gone', async () => {
    await mountThenClose();

    expect(ws.request).toHaveBeenCalledWith('laptop', 'pane.unsubscribe_output', {
      subscription_id: 'sub-1',
    });
  });

  it('does not re-read a gone pane when the socket reconnects', async () => {
    await mountThenClose();
    ws.request.calls.reset();

    ws.connected.set(false);
    fixture.detectChanges();
    ws.connected.set(true);
    fixture.detectChanges();
    await flushMicrotasks();
    fixture.detectChanges();

    expect(ws.request).not.toHaveBeenCalledWith('laptop', 'pane.read', jasmine.anything());
    expect(stateEl('.terminal-gone')).not.toBeNull();
  });

  it('shows loading, not gone, for a cold deep link before the host has been listed', async () => {
    ws.connected.set(false);

    fixture = TestBed.createComponent(PaneDetail);
    fixture.detectChanges();
    await flushMicrotasks();
    fixture.detectChanges();

    expect(stateEl('.terminal-loading')).not.toBeNull();
    expect(stateEl('.terminal-gone')).toBeNull();
  });

  it('never calls a pane gone that was never in the store', async () => {
    fixture = TestBed.createComponent(PaneDetail);
    fixture.detectChanges();
    await flushMicrotasks();
    fixture.detectChanges();

    expect(stateEl('.terminal-gone')).toBeNull();
    expect(ws.request).not.toHaveBeenCalledWith(
      'laptop',
      'pane.unsubscribe_output',
      jasmine.anything()
    );
  });

  it('shows unavailable, not gone, when the host disconnects and its panes leave the store', async () => {
    panes.set(new Map([['laptop:pane-1', PANE_1]]));
    fixture = TestBed.createComponent(PaneDetail);
    fixture.detectChanges();
    await flushMicrotasks();
    fixture.detectChanges();

    hosts.set([{ name: 'laptop', connected: false }]);
    fixture.detectChanges();
    panes.set(new Map());
    fixture.detectChanges();
    await flushMicrotasks();
    fixture.detectChanges();

    expect(stateEl('.terminal-unavailable')?.textContent).toContain(COPY.state.unavailable);
    expect(stateEl('.terminal-gone')).toBeNull();
    expect(stateEl('.terminal-container')?.classList).not.toContain('inert');
  });

  it('starts over when the route moves to another pane', async () => {
    await mountThenClose();
    ws.request.calls.reset();

    panes.set(new Map([['laptop:pane-2', { ...PANE_1, id: 'pane-2' }]]));
    paramMap$.next(convertToParamMap({ host: 'laptop', id: 'pane-2' }));
    fixture.detectChanges();
    await flushMicrotasks();
    fixture.detectChanges();

    expect(stateEl('.terminal-gone')).toBeNull();
    expect(stateEl('.terminal-container')?.classList).not.toContain('inert');
    expect(ws.request).toHaveBeenCalledWith(
      'laptop',
      'pane.read',
      jasmine.objectContaining({
        pane_id: 'pane-2',
      })
    );
  });

  // --- keyboard: the terminal owns its keys.

  it('registers no global keyboard handler on document or window', async () => {
    const docSpy = spyOn(document, 'addEventListener').and.callThrough();
    const winSpy = spyOn(window, 'addEventListener').and.callThrough();

    fixture = TestBed.createComponent(PaneDetail);
    fixture.detectChanges();
    await flushMicrotasks();

    const keyTypes = [...docSpy.calls.allArgs(), ...winSpy.calls.allArgs()]
      .map(([type]) => String(type))
      .filter((type) => type.startsWith('key'));
    expect(keyTypes)
      .withContext('a global key handler would swallow Escape / ? away from vim, less and fzf')
      .toEqual([]);
  });

  it('leaves unmodified Escape and a bare ? unhandled at the document', async () => {
    fixture = TestBed.createComponent(PaneDetail);
    fixture.detectChanges();
    await flushMicrotasks();

    for (const key of ['Escape', '?']) {
      const evt = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
      document.dispatchEvent(evt);
      expect(evt.defaultPrevented).withContext(`${key} must reach the terminal`).toBe(false);
    }
  });

  // --- copy and glyphs.

  it('routes the back control through copy.ts and renders a lucide icon, not an entity arrow', async () => {
    fixture = TestBed.createComponent(PaneDetail);
    fixture.detectChanges();
    await flushMicrotasks();
    fixture.detectChanges();

    const back = stateEl('header .back') as HTMLAnchorElement;
    expect(back.textContent).toContain(COPY.nav.backToBoard);
    expect(back.querySelector('svg')).not.toBeNull();
    expect(back.textContent).not.toContain('←');
    // First focusable element in the header.
    const focusable = fixture.nativeElement.querySelectorAll('header a, header button');
    expect(focusable[0]).toBe(back);
  });

  // --- back to where the card was opened from (section 17.6) -------------

  /**
   * The board the user was last on. `BoardReturnService` reads the URL off
   * the router itself — no component hands it one — so the setup here is a
   * router that says the app came up on that board.
   */
  function lastOnBoard(url: string): void {
    Object.defineProperty(TestBed.inject(Router), 'url', { get: () => url, configurable: true });
    TestBed.inject(BoardReturnService).rememberBoard({ scrollLeft: 0, scrollTops: {} });
  }

  /** Renders the view and returns its header back link. */
  async function backLink(): Promise<HTMLAnchorElement> {
    fixture = TestBed.createComponent(PaneDetail);
    fixture.detectChanges();
    await flushMicrotasks();
    fixture.detectChanges();
    return fixture.nativeElement.querySelector('header .back') as HTMLAnchorElement;
  }

  it('returns to the scoped board the card was opened from', async () => {
    lastOnBoard('/workspace/w6/tab/w6:t2');

    expect((await backLink()).getAttribute('href')).toBe('/workspace/w6/tab/w6:t2');
  });

  it('returns to the unscoped board when the pane was reached by a deep link', async () => {
    TestBed.inject(BoardReturnService).clear();
    expect((await backLink()).getAttribute('href')).toBe('/');
  });

  it('points every back path at the same place, not just the header one', async () => {
    lastOnBoard('/workspace/w6');
    await backLink();

    const root = fixture.nativeElement as HTMLElement;
    const hrefs = Array.from(root.querySelectorAll<HTMLAnchorElement>('.back, .state-back')).map(
      (a) => a.getAttribute('href')
    );
    expect(hrefs.length).toBeGreaterThan(0);
    for (const href of hrefs) {
      expect(href).toBe('/workspace/w6');
    }
  });

  it('makes no promise about an unshipped feature and no claim about the poll interval', async () => {
    fixture = TestBed.createComponent(PaneDetail);
    fixture.detectChanges();
    await flushMicrotasks();
    fixture.detectChanges();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text.toLowerCase()).not.toContain('coming soon');
    expect(text.toLowerCase()).not.toContain('updates every');
  });

  // The gesture engine itself is `PaneTerminal`'s; what the component owns is
  // the container's declaration that the vertical axis is spoken for.
  it('reserves the vertical touch axis on the terminal container', async () => {
    fixture = TestBed.createComponent(PaneDetail);
    const root = fixture.nativeElement as HTMLElement;
    root.style.display = 'block';
    root.style.width = '600px';
    root.style.height = '400px';
    fixture.detectChanges();
    await flushMicrotasks();
    fixture.detectChanges();

    const container = root.querySelector('.terminal-container') as HTMLElement;
    const style = getComputedStyle(container);

    // `pan-y` is deliberately absent: the app spends it on scrollback.
    expect(style.touchAction).toContain('pan-x');
    expect(style.touchAction).not.toContain('pan-y');
    // Pinch-zoom and taps stay with the browser, so tap-to-focus and the
    // on-screen keyboard are unaffected.
    expect(style.touchAction).toContain('pinch-zoom');
    expect(style.overscrollBehaviorY).toBe('contain');
  });
});

/**
 * The seam the terminal's settings reaction now runs through: `PaneTerminal`
 * takes no DI and so cannot watch a signal itself — the component reads the
 * settings signals in an `effect()` and calls `applyTheme`/`applyFontSize`.
 * `pane-terminal.spec.ts` covers what those two methods do; this covers that
 * a settings change still reaches them at all.
 *
 * Both services are stubbed: the real ones persist to `localStorage`, and a
 * plain writable signal is the whole of what the component reads.
 */
describe('PaneDetail terminal settings', () => {
  const THEME_B: ITheme = { background: '#101010', foreground: '#fefefe' };

  let theme: WritableSignal<ITheme>;
  let fontSize: WritableSignal<number>;
  let scrollback: WritableSignal<number>;
  let settingsWs: FakeWsClient;

  beforeEach(async () => {
    theme = signal<ITheme>({ background: '#f4ede0', foreground: '#2b2b2b' });
    fontSize = signal(13);
    scrollback = signal(250);
    settingsWs = new FakeWsClient();

    await TestBed.configureTestingModule({
      imports: [PaneDetail],
      providers: [
        provideZonelessChangeDetection(),
        { provide: WsClient, useValue: settingsWs },
        {
          provide: PanesStore,
          useValue: {
            panesSignal: () => new Map(),
            // The bar draws herdr's tab level from this (add-pane-tab-hierarchy).
            tabsSignal: () => new Map(),
            capabilitiesSignal: () => new Map(),
            hostsSignal: () => [{ name: 'laptop', connected: true }],
          },
        },
        {
          provide: ActivatedRoute,
          useValue: { paramMap: of(convertToParamMap({ host: 'laptop', id: 'pane-1' })) },
        },
        { provide: TerminalThemeService, useValue: { theme } },
        { provide: TerminalFontSizeService, useValue: { size: fontSize } },
        { provide: TerminalScrollbackService, useValue: { lines: scrollback } },
      ],
    }).compileComponents();
  });

  afterEach(() => TestBed.resetTestingModule());

  /** Mounts the view in a real box and hands back the xterm instance it built. */
  async function mountedTerminal(): Promise<Terminal> {
    const openSpy = spyOn(Terminal.prototype, 'open').and.callThrough();
    const fixture = TestBed.createComponent(PaneDetail);
    const root = fixture.nativeElement as HTMLElement;
    root.style.display = 'block';
    root.style.width = '600px';
    root.style.height = '400px';
    document.body.appendChild(root);
    fixture.detectChanges();
    await flushMicrotasks();
    fixture.detectChanges();
    return openSpy.calls.mostRecent().object as Terminal;
  }

  it('carries a theme change through to the live terminal', async () => {
    const live = await mountedTerminal();

    theme.set(THEME_B);
    TestBed.tick();

    expect(live.options.theme).toEqual(THEME_B);
  });

  it('carries a font-size change through to the live terminal', async () => {
    const live = await mountedTerminal();

    fontSize.set(20);
    TestBed.tick();

    expect(live.options.fontSize).toBe(20);
  });

  it('re-reads and re-subscribes the open pane when the scrollback depth changes', async () => {
    await mountedTerminal();
    settingsWs.request.calls.reset();

    scrollback.set(1000);
    TestBed.tick();
    await flushMicrotasks();

    expect(settingsWs.request).toHaveBeenCalledWith('laptop', 'pane.read', {
      pane_id: 'pane-1',
      format: 'ansi',
      source: 'recent',
      lines: 1000,
    });
    expect(settingsWs.request).toHaveBeenCalledWith('laptop', 'pane.subscribe_output', {
      pane_id: 'pane-1',
      source: 'recent',
      format: 'ansi',
      lines: 1000,
      delta: true,
    });
  });

  it('sends no read when a settings effect re-runs at the depth already loaded', async () => {
    await mountedTerminal();
    settingsWs.request.calls.reset();

    fontSize.set(17);
    TestBed.tick();
    await flushMicrotasks();

    expect(settingsWs.request).not.toHaveBeenCalledWith('laptop', 'pane.read', jasmine.anything());
  });
});

/**
 * The file panel's one visible affordance, and the split it opens.
 *
 * Three conditions decide whether the toggle exists at all, and the wrong
 * answer to any of them is a control that cannot work (a bridge with no file
 * methods) or a question the operator cannot ask (a pane with no checkout,
 * where "there is no repository" is the answer they opened it for).
 */
describe('PaneDetail file panel toggle', () => {
  const CHECKOUT = '/home/op/src/kanhrd';

  const repoFiles = {
    statusPollIntervalMs: 2000,
    fileReadMaxBytes: 1_048_576,
    diffMaxBytes: 262_144,
    treeMaxEntries: 1000,
    statusMaxEntries: 1000,
  };

  async function render(options: {
    project?: Pane['project'];
    files?: boolean;
  }): Promise<{ el: HTMLElement; fixture: ComponentFixture<PaneDetail> }> {
    const panes = new Map<string, Pane>([
      [
        'laptop:pane-1',
        {
          id: 'pane-1',
          host: 'laptop',
          workspace: { id: 'w1', name: 'kanhrd' },
          tab: { id: 't1', name: 'main' },
          agent_status: 'working',
          ...(options.project ? { project: options.project } : {}),
        },
      ],
    ]);
    const capabilities = new Map<string, BridgeCapabilities>([
      [
        'laptop',
        {
          tier: 3,
          terminal: true,
          paneResize: false,
          paneGraphics: false,
          outputPollIntervalMs: 1000,
          ...(options.files === false ? {} : { repoFiles }),
        } as BridgeCapabilities,
      ],
    ]);

    await TestBed.configureTestingModule({
      imports: [PaneDetail],
      providers: [
        provideZonelessChangeDetection(),
        { provide: WsClient, useValue: new FakeWsClient() },
        {
          provide: PanesStore,
          useValue: {
            panesSignal: () => panes,
            tabsSignal: () => new Map(),
            capabilitiesSignal: () => capabilities,
            hostsSignal: () => [{ name: 'laptop', connected: true }],
          },
        },
        {
          provide: ActivatedRoute,
          useValue: { paramMap: of(convertToParamMap({ host: 'laptop', id: 'pane-1' })) },
        },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(PaneDetail);
    fixture.detectChanges();
    return { el: fixture.nativeElement as HTMLElement, fixture };
  }

  // The remembered split is real browser storage; a leaked value would
  // decide the next test's starting ratio.
  beforeEach(() => localStorage.removeItem(SPLIT_STORAGE_KEY));
  afterEach(() => {
    localStorage.removeItem(SPLIT_STORAGE_KEY);
    TestBed.resetTestingModule();
  });

  const project: NonNullable<Pane['project']> = {
    repo_name: 'kanhrd',
    checkout_path: CHECKOUT,
    is_linked_worktree: false,
    files_local: true,
  };

  it('sits at the repo name’s trailing edge, visible and collapsed on first render', async () => {
    const { el } = await render({ project });

    const toggle = el.querySelector<HTMLButtonElement>('.meta-strip .repo [data-panel-toggle]');
    expect(toggle).not.toBeNull();
    expect(toggle?.getAttribute('aria-expanded')).toBe('false');
    expect(toggle?.getAttribute('aria-label')).toBe(fill(COPY.files.toggleIn, { repo: 'kanhrd' }));
    // Collapsed by default: no panel, and no splitter to drag.
    expect(el.querySelector('app-file-panel')).toBeNull();
    expect(el.querySelector('[data-splitter]')).toBeNull();
  });

  it('opens the panel and the splitter together', async () => {
    const { el, fixture } = await render({ project });

    el.querySelector<HTMLButtonElement>('[data-panel-toggle]')!.click();
    fixture.detectChanges();

    expect(el.querySelector('app-file-panel')).not.toBeNull();
    const splitter = el.querySelector('[data-splitter]');
    expect(splitter).not.toBeNull();
    expect(splitter?.getAttribute('role')).toBe('separator');
    expect(splitter?.getAttribute('tabindex')).toBe('0');
    expect(el.querySelector('[data-panel-toggle]')?.getAttribute('aria-expanded')).toBe('true');
  });

  it('renders no toggle at all on a bridge with no file methods', async () => {
    const { el } = await render({ project, files: false });

    expect(el.querySelector('[data-panel-toggle]')).toBeNull();
    // ...and the provenance rows are unaffected.
    expect(el.querySelector('.meta-strip .repo-name')?.textContent?.trim()).toBe('kanhrd');
  });

  it('still offers the toggle on a pane with no checkout, where absence is the answer', async () => {
    const { el } = await render({});

    const toggle = el.querySelector<HTMLButtonElement>('.meta-strip [data-panel-toggle]');
    expect(toggle).not.toBeNull();
    expect(toggle?.getAttribute('aria-label')).toBe(COPY.files.label);
  });

  it('keeps the key bar exactly as it was while the panel is open', async () => {
    const { el, fixture } = await render({ project });

    const before = el.querySelector('app-key-bar')?.outerHTML;
    el.querySelector<HTMLButtonElement>('[data-panel-toggle]')!.click();
    fixture.detectChanges();

    expect(el.querySelector('app-key-bar')?.outerHTML).toBe(before);
  });

  it('steps the split with the keyboard and remembers where it landed', async () => {
    const { el, fixture } = await render({ project });
    el.querySelector<HTMLButtonElement>('[data-panel-toggle]')!.click();
    fixture.detectChanges();

    const splitter = el.querySelector('[data-splitter]') as HTMLElement;
    const before = Number(splitter.getAttribute('aria-valuenow'));
    splitter.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    fixture.detectChanges();

    const after = Number(el.querySelector('[data-splitter]')!.getAttribute('aria-valuenow'));
    expect(after).toBe(before + 5);
    expect(loadSplit().hbox).toBeCloseTo(after / 100, 5);
  });
});
