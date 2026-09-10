import { provideZonelessChangeDetection, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { TabSummary, WorkspaceSummary } from '@kanhrd/schema';
import { Rail } from './rail';
import { COPY } from '../shared/copy';
import { PanesStore, paneKey } from '../state/panes.store';
import { LayoutService } from '../state/layout.service';

/**
 * Drawer-behaviour contract for the mobile nav (docs/UX-GUIDELINES.md
 * § Drawer behaviour, assertions 32-36) plus the honest-body rule for every
 * rail confirm (docs/BRAND.md § Voice rules 5).
 *
 * These tests deliberately hit the real DOM (Karma runs a real Chrome), so
 * focus, `inert` and `matchMedia` are the browser's own, not mocks.
 */

const WORKSPACE: WorkspaceSummary = { id: 'w1', host: 'local', name: 'kanhrd' };
const OTHER_WORKSPACE: WorkspaceSummary = { id: 'w2', host: 'local', name: 'sidecar' };
const TAB: TabSummary = { id: 't1', host: 'local', workspace: { id: 'w1' }, name: 'editor' };
const OTHER_TAB: TabSummary = { id: 't2', host: 'local', workspace: { id: 'w1' }, name: 'logs' };

class FakeStore {
  readonly workspacesSignal = signal(
    new Map([
      [paneKey(WORKSPACE.host, WORKSPACE.id), WORKSPACE],
      [paneKey(OTHER_WORKSPACE.host, OTHER_WORKSPACE.id), OTHER_WORKSPACE],
    ])
  );
  readonly tabsSignal = signal(
    new Map([
      [paneKey(TAB.host, TAB.id), TAB],
      [paneKey(OTHER_TAB.host, OTHER_TAB.id), OTHER_TAB],
    ])
  );
  readonly capabilitiesSignal = signal(
    new Map([['local', { workspaceCrud: true, tabCrud: true }]])
  );
  readonly tabFilterSignal = signal<{ host: string; tabId: string } | null>(null);
  readonly scopeSignal = signal<{ host: string; workspaceId: string; tabId: string | null } | null>(
    null
  );
  readonly pendingRenameSignal = signal<null>(null);
  readonly pendingCloseTabSignal = signal<null>(null);
  consumePendingRename(): void {}
  consumePendingCloseTab(): void {}
  workspaceCount = 2;
  tabCount = 2;
  workspaceCountForHost(): number {
    return this.workspaceCount;
  }
  tabCountForWorkspace(): number {
    return this.tabCount;
  }
  renameWorkspace = jasmine.createSpy('renameWorkspace').and.resolveTo(undefined);
  renameTab = jasmine.createSpy('renameTab').and.resolveTo(undefined);
  closeWorkspace = jasmine.createSpy('closeWorkspace').and.resolveTo(undefined);
  closeTab = jasmine.createSpy('closeTab').and.resolveTo(undefined);
}

/** Stand-in for the real `matchMedia`, so the 900px crossing is drivable. */
class FakeMediaQueryList {
  matches = false;
  private listeners: Array<(e: MediaQueryListEvent) => void> = [];
  addEventListener(_type: string, fn: (e: MediaQueryListEvent) => void): void {
    this.listeners.push(fn);
  }
  removeEventListener(_type: string, fn: (e: MediaQueryListEvent) => void): void {
    this.listeners = this.listeners.filter((l) => l !== fn);
  }
  emit(matches: boolean): void {
    this.matches = matches;
    for (const fn of [...this.listeners]) {
      fn({ matches } as MediaQueryListEvent);
    }
  }
  get listenerCount(): number {
    return this.listeners.length;
  }
}

describe('Rail', () => {
  let fixture: ComponentFixture<Rail>;
  let layout: LayoutService;
  let store: FakeStore;
  let media: FakeMediaQueryList;
  let originalMatchMedia: typeof window.matchMedia;
  /** Stands in for the app header's hamburger, which lives outside this component. */
  let hamburger: HTMLButtonElement;
  /** Stands in for board.html's backdrop, a sibling of `<app-rail>`. */
  let backdrop: HTMLDivElement;
  /** Ordinary background content that must go `inert` while the drawer is open. */
  let background: HTMLButtonElement;

  async function settle(): Promise<void> {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  async function openDrawer(): Promise<void> {
    hamburger.focus();
    layout.openRail();
    await settle();
  }

  function nav(): HTMLElement {
    return fixture.nativeElement.querySelector('nav.rail') as HTMLElement;
  }

  function focusables(): HTMLElement[] {
    return Array.from(nav().querySelectorAll<HTMLElement>('button'));
  }

  function pressEscape(target: EventTarget): void {
    target.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
    );
  }

  beforeEach(async () => {
    store = new FakeStore();
    media = new FakeMediaQueryList();
    originalMatchMedia = window.matchMedia;
    window.matchMedia = ((query: string) =>
      media as unknown as MediaQueryList) as typeof window.matchMedia;

    hamburger = document.createElement('button');
    hamburger.className = 'hamburger';
    document.body.appendChild(hamburger);
    background = document.createElement('button');
    background.className = 'background-content';
    document.body.appendChild(background);
    backdrop = document.createElement('div');
    backdrop.className = 'rail-backdrop';
    document.body.appendChild(backdrop);

    await TestBed.configureTestingModule({
      imports: [Rail],
      providers: [
        provideZonelessChangeDetection(),
        // Catch-all so `router.navigate` resolves; this suite asserts drawer
        // behaviour, not routing.
        provideRouter([{ path: '**', children: [] }]),
        { provide: PanesStore, useValue: store as unknown as PanesStore },
      ],
    }).compileComponents();

    layout = TestBed.inject(LayoutService);
    fixture = TestBed.createComponent(Rail);
    await settle();
  });

  afterEach(() => {
    layout.closeRail();
    fixture.destroy();
    window.matchMedia = originalMatchMedia;
    hamburger.remove();
    background.remove();
    backdrop.remove();
  });

  // --- rows -------------------------------------------------------------

  it('renders one row per workspace and tab with a visible overflow trigger (no hover-only actions)', () => {
    expect(fixture.nativeElement.querySelectorAll('.workspace-row').length).toBe(2);
    expect(fixture.nativeElement.querySelectorAll('.tab-row').length).toBe(2);
    const triggers = fixture.nativeElement.querySelectorAll('.row-menu-trigger');
    expect(triggers.length).toBe(4);
    for (const trigger of Array.from(triggers) as HTMLElement[]) {
      expect(getComputedStyle(trigger).display).not.toBe('none');
      expect(getComputedStyle(trigger).opacity).toBe('1');
    }
  });

  it('puts the row actions behind the overflow menu, opened by its own visible control', async () => {
    expect(fixture.nativeElement.querySelector('.row-menu')).toBeNull();
    (fixture.nativeElement.querySelector('.row-menu-trigger') as HTMLElement).click();
    await settle();
    const items = Array.from(
      fixture.nativeElement.querySelectorAll('.row-menu-item')
    ) as HTMLElement[];
    expect(items.map((i) => i.textContent?.trim())).toEqual([
      COPY.rail.renameWorkspace,
      COPY.confirm.closeWorkspaceAction,
    ]);
  });

  // --- inline rename: a refused edit keeps what was typed ----------------
  //
  // Section 17.11. The failure mode this replaces: the field closed first
  // and the request went out with `void`, so a rejection was unhandled —
  // no reason, no retry, and the typed value gone.

  /** Opens the first workspace row's rename field and types `value` into it. */
  async function startRename(value: string): Promise<HTMLInputElement> {
    (fixture.nativeElement.querySelector('.row-menu-trigger') as HTMLElement).click();
    await settle();
    (fixture.nativeElement.querySelector('.row-menu-item') as HTMLElement).click();
    await settle();
    const input = fixture.nativeElement.querySelector('.edit-input') as HTMLInputElement;
    input.value = value;
    input.dispatchEvent(new Event('input'));
    await settle();
    return input;
  }

  function commit(input: HTMLInputElement): void {
    input.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
    );
  }

  function input(): HTMLInputElement | null {
    return fixture.nativeElement.querySelector('.edit-input');
  }

  function errorText(): string | null {
    return fixture.nativeElement.querySelector('.edit-error')?.textContent?.trim() ?? null;
  }

  it('closes the field and sends the new name when the rename succeeds', async () => {
    const field = await startRename('renamed');
    commit(field);
    await settle();

    expect(store.renameWorkspace).toHaveBeenCalledWith('local', 'w1', 'renamed');
    expect(input()).withContext('the field closes on success').toBeNull();
    expect(errorText()).toBeNull();
  });

  it('keeps the typed value in the field when herdr refuses', async () => {
    store.renameWorkspace.and.rejectWith(new Error('Workspace "Main" is read-only'));
    const field = await startRename('renamed');
    commit(field);
    await settle();

    expect(input()).withContext('the field stays open').not.toBeNull();
    expect(input()!.value).toBe('renamed');
  });

  it("shows herdr's reason inline, verbatim, beside the value that produced it", async () => {
    store.renameWorkspace.and.rejectWith(new Error('Workspace "Main" is read-only'));
    const field = await startRename('renamed');
    commit(field);
    await settle();

    expect(errorText()).toBe('couldn\'t rename. herdr said: Workspace "Main" is read-only');
    expect(input()!.getAttribute('aria-invalid')).toBe('true');
    expect(input()!.getAttribute('aria-describedby')).toBe('rail-rename-error');
  });

  it('puts the cursor back in the failed field so the fix is an edit', async () => {
    store.renameWorkspace.and.rejectWith(new Error('nope'));
    const field = await startRename('renamed');
    commit(field);
    await settle();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(document.activeElement).toBe(input());
  });

  it('does not let a blur throw away a value that failed', async () => {
    store.renameWorkspace.and.rejectWith(new Error('nope'));
    const field = await startRename('renamed');
    commit(field);
    await settle();

    input()!.dispatchEvent(new FocusEvent('blur'));
    await settle();

    expect(input()?.value).toBe('renamed');
    expect(errorText()).not.toBeNull();
  });

  it('still lets Escape discard a failed edit', async () => {
    store.renameWorkspace.and.rejectWith(new Error('nope'));
    const field = await startRename('renamed');
    commit(field);
    await settle();

    pressEscape(input()!);
    await settle();

    expect(input()).toBeNull();
  });

  it('retries from the corrected value without a second notice', async () => {
    store.renameWorkspace.and.rejectWith(new Error('nope'));
    const field = await startRename('renamed');
    commit(field);
    await settle();

    store.renameWorkspace.and.resolveTo(undefined);
    const reopened = input()!;
    reopened.value = 'renamed properly';
    reopened.dispatchEvent(new Event('input'));
    commit(reopened);
    await settle();

    expect(store.renameWorkspace.calls.mostRecent().args).toEqual([
      'local',
      'w1',
      'renamed properly',
    ]);
    expect(input()).toBeNull();
    expect(errorText()).toBeNull();
  });

  it('blurring an ordinary edit still cancels it', async () => {
    const field = await startRename('renamed');
    field.dispatchEvent(new FocusEvent('blur'));
    await settle();

    expect(input()).toBeNull();
    expect(store.renameWorkspace).not.toHaveBeenCalled();
  });

  // --- drawer: focus trap + restore (assertions 33, 34) ------------------

  it('moves focus into the drawer on open', async () => {
    await openDrawer();
    expect(nav().contains(document.activeElement)).toBeTrue();
  });

  it('traps Tab inside the drawer, wrapping at both ends', async () => {
    await openDrawer();
    const items = focusables();
    expect(items.length).toBeGreaterThan(1);
    const first = items[0]!;
    const last = items[items.length - 1]!;

    last.focus();
    last.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })
    );
    expect(document.activeElement).toBe(first);

    first.focus();
    first.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true })
    );
    expect(document.activeElement).toBe(last);
  });

  it('makes background content inert while open and releases it on close', async () => {
    await openDrawer();
    expect(background.inert).withContext('background is inert while open').toBeTrue();

    layout.closeRail();
    await settle();
    expect(background.inert).withContext('inert released on close').toBeFalse();
  });

  it('leaves the backdrop tappable (not inert) so a backdrop tap can dismiss the drawer', async () => {
    await openDrawer();
    expect(backdrop.inert)
      .withContext("board's .rail-backdrop must stay interactive to dismiss the drawer")
      .toBeFalse();

    // The backdrop's own handler is board.html's `(click)="layout.closeRail()"`.
    layout.closeRail();
    await settle();
    expect(layout.railOpen()).toBeFalse();
    expect(document.activeElement).toBe(hamburger);
  });

  it('returns focus to the hamburger on close', async () => {
    await openDrawer();
    expect(document.activeElement).not.toBe(hamburger);

    layout.closeRail();
    await settle();
    expect(document.activeElement).toBe(hamburger);
  });

  // --- drawer: Escape is scoped, never global ----------------------------

  it('closes on Escape raised inside the drawer', async () => {
    await openDrawer();
    pressEscape(document.activeElement!);
    await settle();
    expect(layout.railOpen()).toBeFalse();
    expect(document.activeElement).toBe(hamburger);
  });

  it('registers NO global Escape handler: Escape outside the rail leaves the drawer open', async () => {
    await openDrawer();

    pressEscape(document.body);
    pressEscape(background);
    await settle();

    expect(layout.railOpen())
      .withContext('a global Escape binding would break every TUI running in a card')
      .toBeTrue();
  });

  it('Escape inside an open row menu closes the menu only, returning focus to its trigger', async () => {
    await openDrawer();
    const trigger = fixture.nativeElement.querySelector('.row-menu-trigger') as HTMLElement;
    trigger.click();
    await settle();
    const item = fixture.nativeElement.querySelector('.row-menu-item') as HTMLElement;
    item.focus();

    pressEscape(item);
    await settle();

    expect(fixture.nativeElement.querySelector('.row-menu')).toBeNull();
    expect(document.activeElement).toBe(trigger);
    expect(layout.railOpen()).withContext('the drawer stays open').toBeTrue();
  });

  // --- drawer: 900px crossing (assertion 36) -----------------------------

  it('closes and clears railOpen when the viewport crosses up past 900px, moving focus to the inline rail', async () => {
    await openDrawer();
    expect(layout.railOpen()).toBeTrue();

    media.emit(true);
    await settle();

    expect(layout.railOpen()).withContext('drawer state cleared').toBeFalse();
    expect(document.activeElement)
      .withContext('focus moves to the now-visible inline rail, not document.body')
      .toBe(nav());
  });

  it('crossing back down below 900px leaves the drawer closed', async () => {
    await openDrawer();
    media.emit(true);
    await settle();

    media.emit(false);
    await settle();

    expect(layout.railOpen()).toBeFalse();
  });

  it('drops its matchMedia listener and clears drawer state on destroy (no drawer across a route change)', async () => {
    await openDrawer();
    expect(media.listenerCount).toBe(1);

    fixture.destroy();

    expect(media.listenerCount).toBe(0);
    expect(layout.railOpen()).withContext('drawer never persists to pane detail').toBeFalse();
    expect(background.inert).toBeFalse();
  });

  // --- navigation closes the drawer before the board re-renders ----------

  it('closes the drawer when a destination is selected', async () => {
    await openDrawer();
    (fixture.nativeElement.querySelector('.tab-row .row-nav') as HTMLElement).click();
    await settle();
    expect(layout.railOpen()).toBeFalse();
  });

  // --- confirms: soft prompt, honest body --------------------------------

  function openMenuFor(selector: string): void {
    (fixture.nativeElement.querySelector(`${selector} .row-menu-trigger`) as HTMLElement).click();
  }

  async function clickMenuItem(selector: string, index: number): Promise<void> {
    openMenuFor(selector);
    await settle();
    const items = Array.from(
      fixture.nativeElement.querySelectorAll(`${selector} .row-menu-item`)
    ) as HTMLElement[];
    items[index]!.click();
    await settle();
  }

  function modalText(): { title: string; body: string } {
    const modal = fixture.nativeElement.querySelector('.modal') as HTMLElement;
    return {
      title: modal.querySelector('.modal-title')?.textContent?.trim() ?? '',
      body: modal.querySelector('.modal-body')?.textContent?.trim() ?? '',
    };
  }

  it('close workspace: soft prompt paired with an honest body naming the ending sessions', async () => {
    await clickMenuItem('.workspace-row', 1);
    const { title, body } = modalText();
    expect(title).toBe(COPY.confirm.closeWorkspace);
    expect(body).toContain(COPY.confirm.closeWorkspaceBody);
    expect(body).toContain(WORKSPACE.name);
  });

  it('close tab: honest body, plus the last-tab note when the workspace goes with it', async () => {
    store.tabCount = 1;
    await clickMenuItem('.tab-row', 1);
    const { title, body } = modalText();
    expect(title).toBe(COPY.confirm.closeTab);
    expect(body).toContain(COPY.confirm.closeTabBody);
    expect(body).toContain(COPY.confirm.lastTabNote);
  });

  it('close tab: no last-tab note when other tabs remain', async () => {
    store.tabCount = 2;
    await clickMenuItem('.tab-row', 1);
    expect(modalText().body).not.toContain(COPY.confirm.lastTabNote);
  });

  it('linked worktree: the second confirm says plainly that every linked workspace closes', async () => {
    store.closeWorkspace.and.rejectWith(new Error('workspace_group_close_required: w1'));
    await clickMenuItem('.workspace-row', 1);
    (fixture.nativeElement.querySelector('.modal-actions .btn.danger') as HTMLElement).click();
    await settle();

    const { title, body } = modalText();
    expect(title).toBe(COPY.confirm.closeLinkedWorkspaces);
    expect(body).toBe(COPY.confirm.closeLinkedWorkspacesBody);
    expect(body).toContain('all of them close');
    expect(body).toContain('cannot be undone');
  });

  it('refuses to close the only workspace on a host, with no confirm button at all', async () => {
    store.workspaceCount = 1;
    await clickMenuItem('.workspace-row', 1);
    expect(fixture.nativeElement.querySelector('.modal-body.refusal')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('.modal-actions .btn.danger')).toBeNull();
  });

  // --- host seal ---------------------------------------------------------

  it('renders the host as an ochre outline seal, never a filled swatch', () => {
    const seal = fixture.nativeElement.querySelector('.host-seal') as HTMLElement;
    expect(seal.textContent?.trim()).toBe('local');
    const style = getComputedStyle(seal);
    expect(style.borderTopWidth).toBe('1px');
    expect(['rgba(0, 0, 0, 0)', 'transparent']).toContain(style.backgroundColor);
  });
});
