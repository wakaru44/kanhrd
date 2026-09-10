import { WritableSignal, provideZonelessChangeDetection, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { BehaviorSubject, Subject, of } from 'rxjs';
import type { HostSummary, Pane, WsEvent } from '@kanhrd/schema';
import { PaneDetail } from './pane-detail';
import { BoardReturnService } from '../state/board-return.service';
import { COPY } from '../shared/copy';
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

describe('PaneDetail', () => {
  let ws: FakeWsClient;
  let fixture: ComponentFixture<PaneDetail>;
  let paramMap$: BehaviorSubject<ReturnType<typeof convertToParamMap>>;
  let hosts: WritableSignal<HostSummary[]>;

  /** DOM-level view of the reliability state, asserted through the markup rather than a protected signal. */
  function stateEl(selector: string): Element | null {
    return fixture.nativeElement.querySelector(selector) as Element | null;
  }

  beforeEach(async () => {
    ws = new FakeWsClient();
    hosts = signal<HostSummary[]>([{ name: 'laptop', connected: true }]);
    paramMap$ = new BehaviorSubject(convertToParamMap({ host: 'laptop', id: 'pane-1' }));

    await TestBed.configureTestingModule({
      imports: [PaneDetail],
      providers: [
        provideZonelessChangeDetection(),
        { provide: WsClient, useValue: ws },
        {
          provide: PanesStore,
          useValue: {
            panesSignal: () => new Map(),
            capabilitiesSignal: () => new Map(),
            hostsSignal: () => hosts(),
          },
        },
        {
          provide: ActivatedRoute,
          useValue: { paramMap: paramMap$ },
        },
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
    });
    expect(ws.request).toHaveBeenCalledWith('laptop', 'pane.subscribe_output', {
      pane_id: 'pane-1',
      source: 'recent',
      format: 'ansi',
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
    });
    expect(ws.request).toHaveBeenCalledWith('laptop', 'pane.subscribe_output', {
      pane_id: 'pane-1',
      source: 'recent',
      format: 'ansi',
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
    });
    expect(ws.request).toHaveBeenCalledWith('laptop', 'pane.subscribe_output', {
      pane_id: 'pane-2',
      source: 'recent',
      format: 'ansi',
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
