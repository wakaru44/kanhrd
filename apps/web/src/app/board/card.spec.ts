import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { BridgeCapabilities, Pane } from '@kanhrd/schema';
import { CARD_COPY, Card } from './card';
import { COPY } from '../shared/copy';
import { PanesStore } from '../state/panes.store';
import { PARKED_STORAGE_KEY, ParkedStore } from '../state/parked.store';

class FakePanesStore {
  readonly closePane = jasmine.createSpy('closePane');
  readonly splitPane = jasmine.createSpy('splitPane');
  readonly renamePane = jasmine.createSpy('renamePane').and.resolveTo({});
}

function pane(overrides: Partial<Pane> = {}): Pane {
  return {
    id: 'pane-12345678',
    host: 'laptop',
    workspace: { id: 'w1', name: 'kanhrd' },
    tab: { id: 't1', name: 'main' },
    agent_status: 'working',
    ...overrides,
  };
}

function capabilities(overrides: Partial<BridgeCapabilities> = {}): BridgeCapabilities {
  return {
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
    ...overrides,
  };
}

function capsWithTerminal(
  host: string,
  overrides: Partial<BridgeCapabilities> = {}
): ReadonlyMap<string, BridgeCapabilities> {
  return new Map([[host, capabilities(overrides)]]);
}

describe('Card', () => {
  let store: FakePanesStore;
  /** Containers a test attached to the document itself; torn down after it. */
  const strays: HTMLElement[] = [];

  afterEach(() => {
    while (strays.length) {
      strays.pop()!.remove();
    }
  });

  beforeEach(async () => {
    store = new FakePanesStore();
    await TestBed.configureTestingModule({
      imports: [Card],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        { provide: PanesStore, useValue: store },
      ],
    }).compileComponents();
  });

  function renderFixture(
    p: Pane,
    capabilities: ReadonlyMap<string, BridgeCapabilities> = capsWithTerminal(p.host),
    compact = false
  ) {
    const fixture = TestBed.createComponent(Card);
    fixture.componentRef.setInput('pane', p);
    fixture.componentRef.setInput('capabilities', capabilities);
    fixture.componentRef.setInput('compact', compact);
    fixture.detectChanges();
    return fixture;
  }

  function render(
    p: Pane,
    capabilities: ReadonlyMap<string, BridgeCapabilities> = capsWithTerminal(p.host),
    compact = false
  ) {
    return renderFixture(p, capabilities, compact).nativeElement as HTMLElement;
  }

  /**
   * This card's open overflow menu, or `null`. The menu is portalled into
   * the CDK overlay container, so it is reached through the trigger's
   * `aria-controls` rather than by descending from the card. A query
   * change only: what the tests assert about it is unchanged.
   */
  function menuOf(fixture: ReturnType<typeof renderFixture>): HTMLElement | null {
    const id = (fixture.nativeElement as HTMLElement)
      .querySelector('.overflow-trigger')
      ?.getAttribute('aria-controls');
    return id ? document.getElementById(id) : null;
  }

  /** `selector` inside the card, or inside the menu the card has open. */
  function queryOf<T extends Element>(
    fixture: ReturnType<typeof renderFixture>,
    selector: string
  ): T | null {
    const el = fixture.nativeElement as HTMLElement;
    return el.querySelector<T>(selector) ?? menuOf(fixture)?.querySelector<T>(selector) ?? null;
  }

  /** Clicks `selector` inside `fixture` and flushes a change-detection pass so signal-driven `@if`s re-render. */
  function clickAndSettle(fixture: ReturnType<typeof renderFixture>, selector: string): void {
    queryOf<HTMLButtonElement>(fixture, selector)?.click();
    fixture.detectChanges();
  }

  const tier3 = { paneClose: true, paneCreate: true };

  // --- content ------------------------------------------------------------

  it('shows the agent name when present', () => {
    const el = render(pane({ agent: { name: 'claude' } }));
    expect(el.querySelector('.card-open')?.textContent).toContain('claude');
  });

  it('falls back to title when agent name is absent', () => {
    const el = render(pane({ agent: undefined, title: 'fix the bug' }));
    expect(el.querySelector('.card-open')?.textContent).toContain('fix the bug');
  });

  it('falls back to a short pane id when both agent and title are absent', () => {
    const el = render(pane({ agent: undefined, title: undefined, id: 'abcdefgh-1234' }));
    expect(el.querySelector('.card-open')?.textContent).toContain('abcdefgh');
  });

  // --- title precedence (util/pane-title.ts, rendered) ---------------------

  it("prefers the operator's own label over agent identity and hook title", () => {
    const el = render(
      pane({ label: 'fix the backlog storm', agent: { name: 'claude' }, title: 'hook title' })
    );
    expect(el.querySelector('.card-open')?.textContent?.trim()).toBe('fix the backlog storm');
  });

  it('moves the displaced agent identity into the meta row rather than losing it', () => {
    const el = render(pane({ label: 'fix the backlog storm', agent: { name: 'claude' } }));
    expect(el.querySelector('.meta .identity')?.textContent?.trim()).toBe('claude');
  });

  it('renders no secondary identity row when the title already is the agent identity', () => {
    const el = render(pane({ agent: { name: 'codex' } }));
    expect(el.querySelector('.card-open')?.textContent?.trim()).toBe('codex');
    expect(el.querySelector('.meta .identity')).toBeNull();
  });

  it('keeps the title stable when herdr renames the agent under a label', () => {
    const fixture = renderFixture(
      pane({ label: 'fix the backlog storm', agent: { name: 'claude' } })
    );
    fixture.componentRef.setInput(
      'pane',
      pane({ label: 'fix the backlog storm', agent: { name: 'claude-review' } })
    );
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;

    expect(el.querySelector('.card-open')?.textContent?.trim()).toBe('fix the backlog storm');
    expect(el.querySelector('.meta .identity')?.textContent?.trim()).toBe('claude-review');
  });

  // --- project line --------------------------------------------------------

  const PROJECT = {
    repo_name: 'kanhrd',
    checkout_path: '/home/op/workspace/src/github.com/wakaru44/kanhrd',
    is_linked_worktree: false,
  };

  it('renders the repo name and a computed path tail, with the full path as a pointer convenience', () => {
    // A repo whose name is NOT the workspace's ("kanhrd"), so both locators
    // have something of their own to say.
    const el = render(pane({ project: { ...PROJECT, repo_name: 'herdr' } }));

    expect(el.querySelector('.project .repo')?.textContent?.trim()).toBe('herdr');
    expect(el.querySelector('.project .checkout-tail')?.textContent?.trim()).toBe(
      '…/wakaru44/kanhrd'
    );
    expect(el.querySelector('.project-checkout')?.getAttribute('title')).toBe(
      PROJECT.checkout_path
    );
  });

  it('drops the repo locator when it is the workspace name again', () => {
    // `kanhrd / main` beside `kanhrd` is one fact printed twice. The checkout
    // path still names the directory, so nothing becomes unreachable.
    const el = render(pane({ project: PROJECT }));

    expect(el.querySelector('.location')?.textContent?.trim()).toBe('kanhrd / main');
    expect(el.querySelector('.project .repo')).toBeNull();
    expect(el.querySelector('.project .checkout-tail')?.textContent?.trim()).toBe(
      '…/wakaru44/kanhrd'
    );
  });

  it('lays the card out as independent rows, so no row insets another', () => {
    const el = render(pane({ project: PROJECT }), capsWithTerminal('laptop', tier3));
    const identity = el.querySelector('.row-identity')!;
    const state = el.querySelector('.row-state')!;

    // What the old single grid coupled: the status word and the action row
    // sized the columns the NAME was laid out in. Different rows now, so
    // neither can reach it.
    expect(identity.querySelector('.card-open')).not.toBeNull();
    expect(identity.querySelector('.status-label')).toBeNull();
    expect(identity.querySelector('.card-actions')).toBeNull();
    expect(state.querySelector('.status-label')).not.toBeNull();
    expect(state.querySelector('.card-actions')).not.toBeNull();
    // The locator row is the only one that wraps.
    expect(getComputedStyle(el.querySelector('.path')!).flexWrap).toBe('wrap');
  });

  it('keeps the full path in the DOM so it is reachable without a pointer', () => {
    const el = render(pane({ project: PROJECT }));
    expect(el.querySelector('.project .checkout-full')?.textContent?.trim()).toBe(
      PROJECT.checkout_path
    );
  });

  it('renders a shallow checkout path whole, with no ellipsis prefix', () => {
    const el = render(pane({ project: { ...PROJECT, checkout_path: '/srv' } }));
    expect(el.querySelector('.project .checkout-tail')?.textContent?.trim()).toBe('/srv');
  });

  it('renders no project line at all — no placeholder, no dash — when the pane has none', () => {
    const el = render(pane());
    expect(el.querySelector('.project')).toBeNull();
    expect(el.querySelector('.path')?.textContent?.trim()).toBe('kanhrd / main');
  });

  it('drops the project line in the compact variant, where the location lives on the detail route', () => {
    const el = render(pane({ project: PROJECT }), capsWithTerminal('laptop'), true);
    const path = el.querySelector<HTMLElement>('.path');

    expect(path).not.toBeNull();
    // The whole location row is hidden in compact, so a long checkout path
    // cannot widen the card at phone width (where compact is forced).
    expect(getComputedStyle(path!).display).toBe('none');
  });

  it('shows the workspace / tab path', () => {
    const el = render(pane());
    expect(el.querySelector('.path')?.textContent).toContain('kanhrd / main');
  });

  it('renders the title in --font-ui at --fw-medium, never the display serif', () => {
    for (const compact of [false, true]) {
      const title = render(pane(), capsWithTerminal('laptop'), compact).querySelector('.card-open');
      const style = getComputedStyle(title as Element);
      expect(style.fontWeight).toBe('500');
      expect(style.fontFamily).toContain('Inter');
      expect(style.fontFamily).not.toContain('Shippori');
    }
  });

  // --- host seal ----------------------------------------------------------

  it('renders the host as an unfilled outline seal, not a filled colour swatch', () => {
    const seal = render(pane({ host: 'desktop' })).querySelector('.host-seal') as HTMLElement;
    expect(seal.textContent).toContain('desktop');
    // the old treatment was [style.background]="hostColor()" — a per-host fill
    expect(seal.getAttribute('style')).toBeNull();
    const style = getComputedStyle(seal);
    expect(style.backgroundColor).toMatch(/rgba\(0, 0, 0, 0\)|transparent/);
    expect(style.borderTopWidth).toBe('1px');
  });

  // --- status is never colour alone --------------------------------------

  it('pairs a status dot with a visible status word from copy.ts', () => {
    for (const status of ['working', 'blocked', 'done', 'idle', 'unknown'] as const) {
      const el = render(pane({ agent_status: status }));
      expect(el.querySelector(`.status-dot.${status}`))
        .withContext(status)
        .toBeTruthy();
      const label = el.querySelector(`.status-label.${status}`);
      expect(label?.textContent?.trim()).toBe(COPY.status[status]);
    }
  });

  it('keeps the status word in the compact variant', () => {
    const el = render(pane({ agent_status: 'blocked' }), capsWithTerminal('laptop'), true);
    expect(el.querySelector('.status-dot.blocked')).toBeTruthy();
    expect(el.querySelector('.status-label')?.textContent?.trim()).toBe(COPY.status.blocked);
    expect(getComputedStyle(el.querySelector('.status-label') as Element).display).not.toBe('none');
  });

  it('marks the compact variant on the host element', () => {
    expect(render(pane(), capsWithTerminal('laptop'), true).classList).toContain('compact');
    expect(render(pane(), capsWithTerminal('laptop'), false).classList).not.toContain('compact');
  });

  // --- navigation target --------------------------------------------------

  it('renders as a link to the pane detail route when the host bridge supports terminal', () => {
    const el = render(pane({ host: 'laptop' }), capsWithTerminal('laptop'));
    const link = el.querySelector('a.card-open');
    expect(link).toBeTruthy();
    expect(link?.getAttribute('href')).toBe('/pane/laptop/pane-12345678');
  });

  it('renders as a non-clickable card when the host bridge lacks terminal support', () => {
    const el = render(pane({ host: 'laptop' }), new Map());
    expect(el.querySelector('a.card-open')).toBeFalsy();
    expect(el.querySelector('div.card--static')).toBeTruthy();
    expect(el.querySelector('.card-open')?.textContent?.length).toBeGreaterThan(0);
  });

  // --- structure: no nested interactive elements ---------------------------

  it("keeps the card's link and its action controls as siblings, never nested", () => {
    const el = render(pane({ host: 'laptop' }), capsWithTerminal('laptop', tier3));
    const link = el.querySelector('a.card-open') as HTMLElement;
    const buttons = Array.from(el.querySelectorAll('button'));

    expect(buttons.length).toBeGreaterThan(0);
    for (const button of buttons) {
      expect(link.contains(button)).withContext(button.className).toBe(false);
      expect(button.closest('a')).toBeNull();
    }
    // The invariant is "never nested", not "same parent": the card is a
    // column of row boxes now (redesign-card-hierarchy), so the link sits in
    // the identity row and the actions in the state row. What must stay true
    // is that neither contains the other.
    const actions = el.querySelector('.card-actions') as HTMLElement;
    expect(link.contains(actions)).toBeFalse();
    expect(actions.contains(link)).toBeFalse();
    expect(actions.closest('a')).toBeNull();
  });

  it('gives the link and every action an accessible name', () => {
    const el = render(
      pane({ agent: { name: 'claude' }, host: 'laptop' }),
      capsWithTerminal('laptop', tier3)
    );
    expect(el.querySelector('a.card-open')?.textContent?.trim()).toBe('claude');
    for (const button of Array.from(el.querySelectorAll('button'))) {
      const name = button.getAttribute('aria-label') ?? button.textContent?.trim() ?? '';
      expect(name.length).withContext(button.className).toBeGreaterThan(0);
      expect(name).toContain('claude');
    }
  });

  // --- actions ------------------------------------------------------------

  it("shows the close action when paneClose is true, as a lucide svg icon (not '×' text)", () => {
    const el = render(pane({ host: 'laptop' }), capsWithTerminal('laptop', { paneClose: true }));
    const closeButton = el.querySelector('.card-action.close');
    expect(closeButton).toBeTruthy();
    expect(closeButton?.querySelector('svg')).toBeTruthy();
    expect(closeButton?.textContent?.trim()).toBe('');
  });

  it('hides the close action when paneClose capability is false', () => {
    const el = render(pane({ host: 'laptop' }), capsWithTerminal('laptop', { paneClose: false }));
    expect(el.querySelector('.card-action.close')).toBeFalsy();
  });

  it('shows both split directions when paneCreate is true, hides them otherwise', () => {
    const shown = render(
      pane({ host: 'laptop' }),
      capsWithTerminal('laptop', { paneCreate: true })
    );
    expect(shown.querySelector('.card-action.split-right svg')).toBeTruthy();
    expect(shown.querySelector('.card-action.split-down svg')).toBeTruthy();

    const hidden = render(
      pane({ host: 'laptop' }),
      capsWithTerminal('laptop', { paneCreate: false })
    );
    expect(hidden.querySelector('.card-action.split-right')).toBeFalsy();
  });

  it('renders no inline action when the bridge supports neither split nor close, but keeps the overflow trigger', () => {
    const el = render(pane({ host: 'laptop' }), capsWithTerminal('laptop'));
    expect(el.querySelector('.actions-inline')).toBeFalsy();
    // Park and unpark are client-local and need no capability, so the menu —
    // the only keyboard path to parking — is on every card, on every tier.
    expect(el.querySelector('.card-action.overflow-trigger')).toBeTruthy();
  });

  it('exposes the actions on first render without any hover simulation', () => {
    const el = render(pane({ host: 'laptop' }), capsWithTerminal('laptop', tier3));
    const actions = el.querySelector('.card-actions') as HTMLElement;
    const style = getComputedStyle(actions);
    expect(style.opacity).toBe('1');
    expect(style.pointerEvents).not.toBe('none');
    // the overflow trigger (the compact/touch route to the same actions) is
    // itself a visible control, present from the first render
    expect(el.querySelector('.card-action.overflow-trigger')).toBeTruthy();
  });

  it('opens the overflow menu with the capability-supported actions and closes it on Escape', () => {
    const fixture = renderFixture(pane({ host: 'laptop' }), capsWithTerminal('laptop', tier3));
    const el = fixture.nativeElement as HTMLElement;
    const trigger = el.querySelector<HTMLButtonElement>('.card-action.overflow-trigger');

    expect(trigger?.getAttribute('aria-expanded')).toBe('false');
    clickAndSettle(fixture, '.card-action.overflow-trigger');

    const menu = menuOf(fixture);
    const items = Array.from(menu!.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'));
    expect(items.map((i) => i.textContent?.trim())).toEqual([
      CARD_COPY.splitRight,
      CARD_COPY.splitDown,
      CARD_COPY.close,
      CARD_COPY.park,
    ]);
    expect(trigger?.getAttribute('aria-expanded')).toBe('true');

    items[0].focus();
    menu!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();

    expect(menuOf(fixture)).toBeFalsy();
    expect(document.activeElement).toBe(trigger as HTMLButtonElement);
  });

  // --- stacking and clipping (openspec fix-card-menu-stacking) -------------
  //
  // Both tests hit-test with `document.elementFromPoint`. A rectangle that
  // merely *looks* right is what shipped the bug: the menu's box was where
  // it should be and the next card's buttons were taking the clicks inside
  // it. Only the hit test says who owns the pixel.

  /** Opens this card's menu and hands back the element, wherever it now lives. */
  function openMenu(fixture: ReturnType<typeof renderFixture>): HTMLElement {
    clickAndSettle(fixture, '.card-action.overflow-trigger');
    const menu = menuOf(fixture);
    expect(menu).withContext('the menu opened').not.toBeNull();
    return menu!;
  }

  /** Centre of the horizontal overlap between two boxes, or `null` when they miss. */
  function overlapCentre(a: DOMRect, b: DOMRect): number | null {
    const left = Math.max(a.left, b.left);
    const right = Math.min(a.right, b.right);
    return right > left ? (left + right) / 2 : null;
  }

  it("keeps an open menu above the next card's action controls", () => {
    const first = renderFixture(pane({ id: 'pane-a' }), capsWithTerminal('laptop', tier3));
    const next = renderFixture(pane({ id: 'pane-b' }), capsWithTerminal('laptop', tier3));
    // TestBed's DOM renderer detaches the previous fixture's root element on
    // every `createComponent`, so the two cards are re-attached here, in
    // board order: the bug is the LATER card winning on document order.
    const board = document.createElement('div');
    document.body.appendChild(board);
    strays.push(board);
    board.append(first.nativeElement as HTMLElement, next.nativeElement as HTMLElement);

    const menu = openMenu(first);
    // The neighbour's overflow trigger, not its `.actions-inline` row: at
    // karma's narrow viewport the card renders its compact variant, where
    // the inline row folds into this same trigger. Either way the control
    // sits in the neighbour's `.card-actions` — the stacking context that
    // used to win on document order.
    const neighbour = (next.nativeElement as HTMLElement).querySelector<HTMLElement>(
      '.card-action.overflow-trigger'
    )!;

    // Reproduce the measured collision: the next card's action control sits
    // inside the open menu's box, over its last (destructive) row. Offset
    // with `position: relative` — a transform would create a stacking
    // context on the neighbour and rig the result.
    const menuBox = menu.getBoundingClientRect();
    const y = menuBox.bottom - menuBox.height / 4;
    const host = next.nativeElement as HTMLElement;
    host.style.position = 'relative';
    host.style.top = `${y - neighbour.getBoundingClientRect().top - neighbour.offsetHeight / 2}px`;

    const box = neighbour.getBoundingClientRect();
    expect(box.top).withContext("the neighbour's button overlaps the menu").toBeLessThan(y);
    expect(box.bottom).withContext("the neighbour's button overlaps the menu").toBeGreaterThan(y);
    const x = overlapCentre(menuBox, box);
    expect(x).withContext('the boxes overlap horizontally').not.toBeNull();

    expect(menu.contains(document.elementFromPoint(x!, y))).toBe(true);
  });

  it('shows the whole menu when its card is at the end of a scrolling column', () => {
    // `.column-body { overflow-y: auto }` — the column's own scroller, which
    // used to clip the last card's menu at the column's bottom edge.
    const scroller = document.createElement('div');
    scroller.style.height = '140px';
    scroller.style.overflowY = 'auto';
    const spacer = document.createElement('div');
    spacer.style.height = '300px';
    scroller.appendChild(spacer);
    document.body.appendChild(scroller);
    strays.push(scroller);

    const fixture = renderFixture(pane({ host: 'laptop' }), capsWithTerminal('laptop', tier3));
    scroller.appendChild(fixture.nativeElement as HTMLElement);
    scroller.scrollTop = scroller.scrollHeight;

    const menu = openMenu(fixture);
    const box = menu.getBoundingClientRect();
    expect(box.bottom)
      .withContext('not cut off below the viewport')
      .toBeLessThanOrEqual(window.innerHeight);
    expect(box.top).withContext('not cut off above the viewport').toBeGreaterThanOrEqual(0);

    for (const item of Array.from(menu.querySelectorAll<HTMLElement>('[role="menuitem"]'))) {
      const rect = item.getBoundingClientRect();
      const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
      expect(item.contains(hit))
        .withContext(`"${item.textContent?.trim()}" is hit-testable`)
        .toBe(true);
    }
  });

  it('dismisses on a click outside, and counts a click in the portalled menu as inside', () => {
    const fixture = renderFixture(pane({ host: 'laptop' }), capsWithTerminal('laptop', tier3));
    const menu = openMenu(fixture);

    // The menu is no longer inside `.card-actions`, so containment has to
    // be tested against it too — otherwise every menu click reads as a
    // click outside and dismisses the menu under the pointer.
    menu.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    fixture.detectChanges();
    expect(menuOf(fixture)).withContext('a click on the menu keeps it open').not.toBeNull();

    document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    fixture.detectChanges();
    expect(menuOf(fixture)).withContext('a click elsewhere dismisses it').toBeNull();
  });

  it('closes the menu when the column under it scrolls', () => {
    const scroller = document.createElement('div');
    scroller.style.height = '140px';
    scroller.style.overflowY = 'auto';
    const spacer = document.createElement('div');
    spacer.style.height = '300px';
    scroller.appendChild(spacer);
    document.body.appendChild(scroller);
    strays.push(scroller);

    const fixture = renderFixture(pane({ host: 'laptop' }), capsWithTerminal('laptop', tier3));
    scroller.appendChild(fixture.nativeElement as HTMLElement);
    openMenu(fixture);

    scroller.scrollTop = 40;
    scroller.dispatchEvent(new Event('scroll'));
    fixture.detectChanges();

    expect(menuOf(fixture)).withContext('no menu left floating over the board').toBeNull();
  });

  it('splits through the overflow menu', () => {
    const fixture = renderFixture(pane({ host: 'laptop' }), capsWithTerminal('laptop', tier3));
    clickAndSettle(fixture, '.card-action.overflow-trigger');
    clickAndSettle(fixture, '[role="menuitem"]');

    expect(store.splitPane).toHaveBeenCalledWith('laptop', {
      target_pane_id: 'pane-12345678',
      direction: 'right',
    });
  });

  it('splits through the inline action', () => {
    const fixture = renderFixture(pane({ host: 'laptop' }), capsWithTerminal('laptop', tier3));
    clickAndSettle(fixture, '.card-action.split-down');

    expect(store.splitPane).toHaveBeenCalledWith('laptop', {
      target_pane_id: 'pane-12345678',
      direction: 'down',
    });
  });

  // --- close confirmation --------------------------------------------------

  it('clicking close opens a confirmation modal instead of closing immediately', () => {
    const fixture = renderFixture(
      pane({ host: 'laptop' }),
      capsWithTerminal('laptop', { paneClose: true })
    );
    clickAndSettle(fixture, '.card-action.close');

    const modal = (fixture.nativeElement as HTMLElement).querySelector('app-confirm-modal');
    expect(modal).toBeTruthy();
    expect(modal?.querySelector('.modal-title')?.textContent?.trim()).toBe(COPY.confirm.closePane);
    expect(modal?.querySelector('.modal-body')?.textContent?.trim()).toBe(
      COPY.confirm.closePaneBody
    );
    expect(store.closePane).not.toHaveBeenCalled();
  });

  it('confirming the close modal calls store.closePane', () => {
    const fixture = renderFixture(
      pane({ host: 'laptop', id: 'pane-12345678' }),
      capsWithTerminal('laptop', { paneClose: true })
    );
    clickAndSettle(fixture, '.card-action.close');

    const confirm = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>(
        'app-confirm-modal .modal-actions .btn'
      )
    ).find((b) => b.textContent?.trim() === COPY.confirm.closePaneAction);
    confirm?.click();
    fixture.detectChanges();

    expect(store.closePane).toHaveBeenCalledWith('laptop', 'pane-12345678');
  });

  // --- meta ---------------------------------------------------------------

  it("derives the elapsed readout from the bridge's status_since, so two ages read differently", () => {
    const now = Date.now();
    const old = render(pane({ agent_status: 'working', status_since: now - 3_600_000 }));
    const fresh = render(pane({ agent_status: 'working', status_since: now - 60_000 }));

    expect(old.querySelector('.meta .elapsed')?.textContent).toBe('1h');
    expect(fresh.querySelector('.meta .elapsed')?.textContent).toBe('1m');
  });

  it('renders no duration at all when the bridge cannot vouch for one', () => {
    const el = render(pane({ agent_status: 'working', status_since: undefined }));

    // Absent, not a zero and not a placeholder — the readout is the bridge's
    // observation or nothing (see openspec/changes/add-pane-status-since).
    expect(el.querySelector('.meta .elapsed')).toBeNull();
    expect(el.querySelector('.card')?.textContent).not.toMatch(/\d+[smh]/);
  });

  it('leaves the rest of the meta row alone when the duration is absent', () => {
    const el = render(
      pane({ agent: { name: 'claude' }, label: 'lane a', last_output_snippet: 'one\ntwo' })
    );

    const meta = el.querySelector('.meta') as HTMLElement;
    expect(meta.querySelector('.elapsed')).toBeNull();
    expect(meta.querySelector('.identity')?.textContent).toBe('claude');
    expect(meta.textContent).toContain('2 lines');
  });

  it('hides the meta row entirely when every part of it is absent', () => {
    // Identity, duration and line count are all optional and can all be
    // missing at once; an empty box would still claim its column's gaps.
    const el = render(pane({ agent: undefined, status_since: undefined }));
    const meta = el.querySelector('.meta') as HTMLElement;

    expect(meta.querySelector('*')).toBeNull();
    expect(getComputedStyle(meta).display).toBe('none');
  });

  it('keeps the readout across a destroy/recreate with the same pane — it is not mount time', () => {
    const p = pane({ agent_status: 'working', status_since: Date.now() - 300_000 });
    const first = renderFixture(p);
    const before = (first.nativeElement as HTMLElement).querySelector(
      '.meta .elapsed'
    )?.textContent;
    first.destroy();

    const second = render(p);
    expect(second.querySelector('.meta .elapsed')?.textContent).toBe(before!);
    expect(before).toBe('5m');
  });

  it('shows a line count when last_output_snippet is present and omits it when absent', () => {
    const withSnippet = render(pane({ last_output_snippet: 'line one\nline two\nline three' }));
    expect(withSnippet.querySelector('.meta')?.textContent).toContain('3 lines');

    const without = render(pane({ last_output_snippet: undefined }));
    expect(without.querySelector('.meta')?.textContent).not.toContain('lines');
  });

  // --- no hardcoded copy ---------------------------------------------------

  it('renders no user-facing string that is not copy or pane data', () => {
    const el = render(
      pane({ agent: { name: 'claude' }, host: 'laptop', agent_status: 'blocked' }),
      capsWithTerminal('laptop', tier3)
    );
    // Everything the card renders at standard density: pane data, the two
    // mono data readouts, and the status word from copy.ts. Strip them and
    // nothing must be left over — an inlined literal would survive.
    const data = ['claude', 'laptop', 'kanhrd / main', COPY.status.blocked];
    let text = (el.querySelector('.card') as HTMLElement).textContent ?? '';
    for (const value of data) {
      text = text.replace(value, '');
    }
    text = text.replace(/\d+[smh]/, '').replace(/\d+ lines/, '');
    expect(text.trim()).toBe('');
  });

  // --- rename (herdr's pane.rename, exposed on the card) -------------------

  it('offers rename in the overflow menu only when the host advertises paneRename', () => {
    const withRename = renderFixture(pane(), capsWithTerminal('laptop', { paneRename: true }));
    clickAndSettle(withRename, '.overflow-trigger');
    expect(queryOf(withRename, '[role="menuitem"].rename')).not.toBeNull();

    const without = renderFixture(pane(), capsWithTerminal('laptop', tier3));
    clickAndSettle(without, '.overflow-trigger');
    expect(queryOf(without, '[role="menuitem"].rename')).toBeNull();
  });

  it('keeps the overflow trigger visible on first render, with no hover simulation', () => {
    const el = render(pane(), capsWithTerminal('laptop', { paneRename: true }));
    const trigger = el.querySelector<HTMLElement>('.overflow-trigger');

    expect(trigger).not.toBeNull();
    expect(getComputedStyle(trigger!.parentElement!).display).not.toBe('none');
  });

  it('seeds the rename modal with the current label and sends the trimmed value', async () => {
    const fixture = renderFixture(
      pane({ label: 'old name' }),
      capsWithTerminal('laptop', { paneRename: true })
    );
    clickAndSettle(fixture, '.overflow-trigger');
    clickAndSettle(fixture, '[role="menuitem"].rename');

    const el = fixture.nativeElement as HTMLElement;
    const field = el.querySelector<HTMLInputElement>('app-rename-modal .field');
    expect(field?.value).toBe('old name');

    field!.value = '  fix the backlog storm  ';
    field!.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    clickAndSettle(fixture, 'app-rename-modal .btn.primary');

    expect(store.renamePane).toHaveBeenCalledWith(
      'laptop',
      'pane-12345678',
      'fix the backlog storm'
    );
  });

  it('sends label: null when the submitted name is empty after trimming', async () => {
    const fixture = renderFixture(
      pane({ label: 'old name' }),
      capsWithTerminal('laptop', { paneRename: true })
    );
    clickAndSettle(fixture, '.overflow-trigger');
    clickAndSettle(fixture, '[role="menuitem"].rename');

    const field = (fixture.nativeElement as HTMLElement).querySelector<HTMLInputElement>(
      'app-rename-modal .field'
    );
    field!.value = '   ';
    field!.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    clickAndSettle(fixture, 'app-rename-modal .btn.primary');

    expect(store.renamePane).toHaveBeenCalledWith('laptop', 'pane-12345678', null);
  });

  // Section 17.11: a refused rename must not eat what the user typed.

  /** Opens the rename dialog and submits `value`, settling the async handler. */
  async function submitRename(
    fixture: ReturnType<typeof renderFixture>,
    value: string
  ): Promise<void> {
    clickAndSettle(fixture, '.overflow-trigger');
    clickAndSettle(fixture, '[role="menuitem"].rename');
    const field = (fixture.nativeElement as HTMLElement).querySelector<HTMLInputElement>(
      'app-rename-modal .field'
    );
    field!.value = value;
    field!.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    clickAndSettle(fixture, 'app-rename-modal .btn.primary');
    await fixture.whenStable();
    fixture.detectChanges();
  }

  it('reopens the rename dialog holding the attempted value when herdr refuses', async () => {
    store.renamePane.and.rejectWith(new Error('pane 3 is busy'));
    const fixture = renderFixture(
      pane({ label: 'old name' }),
      capsWithTerminal('laptop', { paneRename: true })
    );
    await submitRename(fixture, 'new name');

    const field = (fixture.nativeElement as HTMLElement).querySelector<HTMLInputElement>(
      'app-rename-modal .field'
    );
    expect(field).withContext('the dialog comes back').not.toBeNull();
    expect(field!.value)
      .withContext('holding what was typed, not the stored label')
      .toBe('new name');
  });

  it("shows herdr's reason inline on the reopened dialog", async () => {
    store.renamePane.and.rejectWith(new Error('pane 3 is busy'));
    const fixture = renderFixture(pane(), capsWithTerminal('laptop', { paneRename: true }));
    await submitRename(fixture, 'new name');

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.field-error')?.textContent?.trim()).toBe(
      "couldn't rename. herdr said: pane 3 is busy"
    );
    expect(el.querySelector('app-rename-modal .field')?.getAttribute('aria-invalid')).toBe('true');
  });

  it('closes the dialog and forgets the draft once a rename succeeds', async () => {
    const fixture = renderFixture(
      pane({ label: 'old name' }),
      capsWithTerminal('laptop', { paneRename: true })
    );
    await submitRename(fixture, 'new name');

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('app-rename-modal')).toBeNull();

    clickAndSettle(fixture, '.overflow-trigger');
    clickAndSettle(fixture, '[role="menuitem"].rename');
    expect(el.querySelector<HTMLInputElement>('app-rename-modal .field')?.value).toBe('old name');
  });

  it('treats dismissing the reopened dialog as discarding the draft', async () => {
    store.renamePane.and.rejectWith(new Error('pane 3 is busy'));
    const fixture = renderFixture(
      pane({ label: 'old name' }),
      capsWithTerminal('laptop', { paneRename: true })
    );
    await submitRename(fixture, 'new name');

    const el = fixture.nativeElement as HTMLElement;
    el.querySelector<HTMLElement>('app-rename-modal .modal')!.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
    );
    fixture.detectChanges();
    expect(el.querySelector('app-rename-modal')).toBeNull();

    clickAndSettle(fixture, '.overflow-trigger');
    clickAndSettle(fixture, '[role="menuitem"].rename');
    expect(el.querySelector<HTMLInputElement>('app-rename-modal .field')?.value).toBe('old name');
    expect(el.querySelector('.field-error')).toBeNull();
  });

  it('returns focus to the overflow trigger when the rename modal is cancelled', () => {
    const fixture = renderFixture(pane(), capsWithTerminal('laptop', { paneRename: true }));
    clickAndSettle(fixture, '.overflow-trigger');
    clickAndSettle(fixture, '[role="menuitem"].rename');

    const el = fixture.nativeElement as HTMLElement;
    el.querySelector<HTMLElement>('app-rename-modal .modal')!.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
    );
    fixture.detectChanges();

    expect(store.renamePane).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(el.querySelector('.overflow-trigger'));
  });

  it('maps every action label onto copy.ts, holding no string of its own', () => {
    // CARD_COPY used to BE the copy for three of these. It is now a mapping.
    expect(CARD_COPY.splitRight).toBe(COPY.card.splitRight);
    expect(CARD_COPY.splitDown).toBe(COPY.card.splitDown);
    expect(CARD_COPY.close).toBe(COPY.confirm.closePaneAction);
    expect(CARD_COPY.rename).toBe(COPY.card.renameAction);
    // The overflow trigger is the same control a rail row carries.
    expect(CARD_COPY.moreActions).toBe(COPY.nav.moreActions);
  });

  it('labels its actions from copy, with the sanctioned close verb', () => {
    expect(CARD_COPY.close).toBe(COPY.confirm.closePaneAction);
    const el = render(
      pane({ agent: { name: 'claude' }, host: 'laptop' }),
      capsWithTerminal('laptop', tier3)
    );
    expect(el.querySelector('.card-action.close')?.getAttribute('aria-label')).toContain(
      COPY.confirm.closePaneAction
    );
  });

  // --- parking (client-local; state/parked.store.ts) ----------------------

  describe('park and unpark', () => {
    let parked: ParkedStore;

    beforeEach(() => {
      localStorage.removeItem(PARKED_STORAGE_KEY);
      parked = TestBed.inject(ParkedStore);
    });

    afterEach(() => localStorage.removeItem(PARKED_STORAGE_KEY));

    /** The card's menu items, in order, as text. */
    function items(fixture: ReturnType<typeof renderFixture>): string[] {
      return Array.from(
        menuOf(fixture)!.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')
      ).map((i) => i.textContent?.trim() ?? '');
    }

    it('offers `park in…` on a tier-1 card, where no other action exists', () => {
      const fixture = renderFixture(pane({ host: 'laptop' }), capsWithTerminal('laptop'));
      clickAndSettle(fixture, '.overflow-trigger');

      expect(items(fixture)).toEqual([CARD_COPY.park]);
    });

    it('expands the destinations in place: every column, then `new column…`', () => {
      parked.createColumn('archived', 'never');
      parked.createColumn('parking');
      const fixture = renderFixture(pane({ host: 'laptop' }), capsWithTerminal('laptop'));
      clickAndSettle(fixture, '.overflow-trigger');
      clickAndSettle(fixture, '.park');

      expect(items(fixture)).toEqual([CARD_COPY.park, 'archived', 'parking', CARD_COPY.newColumn]);
      expect(menuOf(fixture)!.querySelector('.park')!.getAttribute('aria-expanded')).toBe('true');
    });

    it('parks the card into the chosen column', () => {
      const column = parked.createColumn('archived', 'never');
      const fixture = renderFixture(pane({ id: 'p9', host: 'laptop' }), capsWithTerminal('laptop'));
      clickAndSettle(fixture, '.overflow-trigger');
      clickAndSettle(fixture, '.park');
      menuOf(fixture)!.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')[1].click();
      fixture.detectChanges();

      expect(parked.columnOf('laptop:p9')).toBe(column.id);
    });

    it('`new column…` creates one with the approved default name and parks into it', () => {
      const fixture = renderFixture(pane({ id: 'p9', host: 'laptop' }), capsWithTerminal('laptop'));
      clickAndSettle(fixture, '.overflow-trigger');
      clickAndSettle(fixture, '.park');
      clickAndSettle(fixture, '.new-column');

      expect(parked.columns().map((c) => c.name)).toEqual([COPY.park.defaultName]);
      expect(parked.columnOf('laptop:p9')).toBe(parked.columns()[0].id);
    });

    it('offers `unpark` instead once the card is parked, and completes it', () => {
      const column = parked.createColumn('archived', 'never');
      parked.park('laptop:p9', column.id);
      const fixture = renderFixture(pane({ id: 'p9', host: 'laptop' }), capsWithTerminal('laptop'));
      clickAndSettle(fixture, '.overflow-trigger');

      expect(items(fixture)).toEqual([CARD_COPY.unpark]);

      clickAndSettle(fixture, '.unpark');
      expect(parked.columnOf('laptop:p9')).toBeNull();
      expect(parked.columns().length).withContext('the column stays').toBe(1);
    });

    it('reaches every destination by keyboard, from the trigger', () => {
      const column = parked.createColumn('archived', 'never');
      const fixture = renderFixture(pane({ id: 'p9', host: 'laptop' }), capsWithTerminal('laptop'));
      const host = fixture.nativeElement as HTMLElement;
      document.body.appendChild(host);
      strays.push(host);

      clickAndSettle(fixture, '.overflow-trigger');
      const menu = menuOf(fixture)!;
      expect(document.activeElement).toBe(menu.querySelector('.park'));

      (document.activeElement as HTMLButtonElement).click();
      fixture.detectChanges();
      menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
      (document.activeElement as HTMLButtonElement).click();
      fixture.detectChanges();

      expect(parked.columnOf('laptop:p9')).toBe(column.id);
    });
  });
});
