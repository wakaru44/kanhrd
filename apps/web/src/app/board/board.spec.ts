import { provideZonelessChangeDetection, signal } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from "@angular/router";
import { provideHttpClient } from "@angular/common/http";
import { HttpTestingController, provideHttpClientTesting } from "@angular/common/http/testing";
import { BehaviorSubject, Subject } from "rxjs";
import type { WsEvent } from "@kanhrd/schema";
import { Board, SCOPE_RESOLVE_GRACE_MS, nearestVisibleStatus, pageIndex } from "./board";
import { VIRTUAL_ITEM_SIZE, isCompact, isVirtualized } from "./column";
import { ClockTick } from "../util/clock";
import { PanesStore, STATUS_COLUMN_ORDER, defaultFilters } from "../state/panes.store";
import { WsClient } from "../state/ws-client";
import { KeyboardService } from "../state/keyboard.service";

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
  request = jasmine.createSpy("request");
}

async function flushMicrotasks(): Promise<void> {
  for (let i = 0; i < 5; i++) {
    await Promise.resolve();
  }
}

/** Same helper as panes.store.spec.ts: lets root effects (PanesStore's, created in its own constructor) flush. */
async function settle(fixture: ComponentFixture<unknown>): Promise<void> {
  await flushMicrotasks();
  await new Promise((resolve) => setTimeout(resolve, 0));
  await flushMicrotasks();
  fixture.detectChanges();
}

describe("Board + Rail integration: New tab flow (full component tree)", () => {
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

  it("clicking + -> New tab grows tabsSignal/panesSignal by 1 AND renders a new .tab-row in the rail and a new .card on the board", async () => {
    ws.request.and.callFake((_host: string, method: string) => {
      if (method === "pane.list") {
        // A real herdr host always has at least one pre-existing pane/tab/
        // workspace by the time the SPA loads (never a totally empty host)
        // — seed one so `workspacesSignal`/`tabsSignal` already have "w6"
        // before "New tab" is clicked, matching the real E2E environment.
        return Promise.resolve({
          panes: [
            {
              id: "p-existing",
              host: "local",
              workspace: { id: "w6", name: "kanhrd" },
              tab: { id: "t-existing", name: "1" },
              agent_status: "idle",
            },
          ],
        });
      }
      if (method === "events.subscribe") return Promise.resolve({ subscription_id: "s1" });
      if (method === "bridge.capabilities") {
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
      if (method === "tab.create") {
        // Mirrors the real bridge's tab.create result shape (CONTRACT-TIER3.md
        // §3): the pane's tab.name is the tab's pre-rename auto label.
        return Promise.resolve({
          tab: { id: "t-new", host: "local", workspace: { id: "w6" }, name: "6" },
          pane: {
            id: "p-new",
            host: "local",
            workspace: { id: "w6", name: "kanhrd" },
            tab: { id: "t-new", name: "6" },
            agent_status: "unknown",
          },
        });
      }
      return Promise.reject(new Error(`unexpected method ${method}`));
    });

    fixture = TestBed.createComponent(Board);
    store = TestBed.inject(PanesStore);
    fixture.detectChanges();
    await settle(fixture);

    for (const req of httpMock.match("/api/hosts")) {
      if (!req.cancelled) {
        req.flush({ hosts: [{ name: "local", connected: true }] });
      }
    }
    await settle(fixture);

    const el = fixture.nativeElement as HTMLElement;
    const tabRowsBefore = el.querySelectorAll(".tab-row").length;
    const cardsBefore = el.querySelectorAll(".card").length;
    const panesBefore = store.panesSignal().size;
    const tabsBefore = store.tabsSignal().size;

    el.querySelector<HTMLButtonElement>(".plus-button")?.click();
    fixture.detectChanges();

    const newTabButton = Array.from(el.querySelectorAll<HTMLButtonElement>(".plus-menu button")).find(
      (btn) => btn.textContent?.trim() === "New tab",
    );
    expect(newTabButton).withContext("New tab button should render once tabCrud capability is true").toBeTruthy();
    newTabButton?.click();
    fixture.detectChanges();

    await settle(fixture);

    expect(store.tabsSignal().size).withContext("tabsSignal should grow by 1").toBe(tabsBefore + 1);
    expect(store.panesSignal().size).withContext("panesSignal should grow by 1").toBe(panesBefore + 1);
    expect(el.querySelectorAll(".tab-row").length)
      .withContext("rail DOM should have one more .tab-row")
      .toBe(tabRowsBefore + 1);
    expect(el.querySelectorAll(".card").length)
      .withContext("board DOM should have one more .card")
      .toBe(cardsBefore + 1);
  });
});

describe("Board: two panes sharing one tab (split view) both render as separate cards", () => {
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

  it("renders 4 cards for 4 panes across 3 tabs, including both panes sharing tab w6:t2", async () => {
    ws.request.and.callFake((_host: string, method: string) => {
      if (method === "pane.list") {
        return Promise.resolve({
          panes: [
            {
              id: "w6:p1",
              host: "local",
              workspace: { id: "w6", name: "jmorales" },
              tab: { id: "w6:t1", name: "1" },
              agent_status: "idle",
            },
            {
              id: "w6:p2",
              host: "local",
              workspace: { id: "w6", name: "jmorales" },
              tab: { id: "w6:t2", name: "2" },
              agent_status: "working",
            },
            {
              id: "w6:p90",
              host: "local",
              workspace: { id: "w6", name: "jmorales" },
              tab: { id: "w6:t2", name: "2" },
              agent_status: "working",
            },
            {
              id: "w6:pA1",
              host: "local",
              workspace: { id: "w6", name: "jmorales" },
              tab: { id: "w6:t26", name: "3" },
              agent_status: "idle",
            },
          ],
        });
      }
      if (method === "events.subscribe") return Promise.resolve({ subscription_id: "s1" });
      if (method === "bridge.capabilities") {
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

    for (const req of httpMock.match("/api/hosts")) {
      if (!req.cancelled) {
        req.flush({ hosts: [{ name: "local", connected: true }] });
      }
    }
    await settle(fixture);

    expect(store.panesSignal().size).withContext("panesSignal should hold all 4 panes").toBe(4);

    const el = fixture.nativeElement as HTMLElement;
    const cards = el.querySelectorAll(".card");
    expect(cards.length).withContext("board DOM should render 4 .card elements").toBe(4);

    // Specifically: both panes sharing tab w6:t2 must each render their own
    // card, not collapse into one.
    const hrefs = Array.from(el.querySelectorAll("a.card-open"))
      .map((c) => c.getAttribute("href"))
      .filter((h): h is string => h !== null);
    expect(hrefs).toContain("/pane/local/w6:p2");
    expect(hrefs).toContain("/pane/local/w6:p90");
  });

  it("a second pane arriving later via pane.created (split within the same tab) still renders alongside the first, not replacing it", async () => {
    ws.request.and.callFake((_host: string, method: string) => {
      if (method === "pane.list") {
        // Initial load only sees ONE pane in w6:t2 — the split happens
        // AFTER the SPA is already subscribed, arriving only as a
        // `pane.created` event, exactly like a user splitting a pane inside
        // herdr's own TUI while kanhrd is open.
        return Promise.resolve({
          panes: [
            {
              id: "w6:p2",
              host: "local",
              workspace: { id: "w6", name: "jmorales" },
              tab: { id: "w6:t2", name: "2" },
              agent_status: "working",
            },
          ],
        });
      }
      if (method === "events.subscribe") return Promise.resolve({ subscription_id: "s1" });
      if (method === "bridge.capabilities") {
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

    for (const req of httpMock.match("/api/hosts")) {
      if (!req.cancelled) {
        req.flush({ hosts: [{ name: "local", connected: true }] });
      }
    }
    await settle(fixture);

    expect(store.panesSignal().size).toBe(1);

    ws.events$.next({
      host: "local",
      event: "pane.created",
      payload: {
        pane: {
          id: "w6:p90",
          host: "local",
          workspace: { id: "w6", name: "jmorales" },
          tab: { id: "w6:t2", name: "2" },
          agent_status: "working",
        },
      },
    });
    await settle(fixture);

    expect(store.panesSignal().size).withContext("panesSignal should hold both panes").toBe(2);

    const el = fixture.nativeElement as HTMLElement;
    const cards = el.querySelectorAll(".card");
    const hrefs = Array.from(el.querySelectorAll("a.card-open"))
      .map((c) => c.getAttribute("href"))
      .filter((h): h is string => h !== null);
    expect(hrefs).withContext("both panes should each render their own card").toContain("/pane/local/w6:p2");
    expect(hrefs).toContain("/pane/local/w6:p90");
    expect(cards.length).toBe(2);
  });
});

describe("Board: URL scope (rail = navigator, decision locked)", () => {
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
    navigateSpy = jasmine.createSpy("navigate").and.resolveTo(true);

    ws.request.and.callFake((_host: string, method: string) => {
      if (method === "pane.list") {
        return Promise.resolve({
          panes: [
            {
              id: "w6:p1",
              host: "local",
              workspace: { id: "w6", name: "jmorales" },
              tab: { id: "w6:t1", name: "one" },
              agent_status: "idle",
            },
            {
              id: "w6:p2",
              host: "local",
              workspace: { id: "w6", name: "jmorales" },
              tab: { id: "w6:t2", name: "two" },
              agent_status: "working",
            },
          ],
        });
      }
      if (method === "events.subscribe") return Promise.resolve({ subscription_id: "s1" });
      if (method === "bridge.capabilities") {
        return Promise.resolve({
          tier: 1,
          terminal: false,
          paneResize: false,
          paneGraphics: false,
          outputPollIntervalMs: 0,
          paneCreate: false,
          paneClose: false,
          paneMove: false,
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
        { provide: Router, useValue: { navigate: navigateSpy } },
      ],
    }).compileComponents();
    httpMock = TestBed.inject(HttpTestingController);

    fixture = TestBed.createComponent(Board);
    store = TestBed.inject(PanesStore);
    fixture.detectChanges();
    await settle(fixture);
    for (const req of httpMock.match("/api/hosts")) {
      if (!req.cancelled) {
        req.flush({ hosts: [{ name: "local", connected: true }] });
      }
    }
    await settle(fixture);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it("navigating to /workspace/:id/tab/:id sets scopeSignal and renders the scope pill", async () => {
    paramMap$.next(convertToParamMap({ workspaceId: "w6", tabId: "w6:t2" }));
    await settle(fixture);

    expect(store.scopeSignal()).toEqual({ host: "local", workspaceId: "w6", tabId: "w6:t2" });

    const el = fixture.nativeElement as HTMLElement;
    const pill = el.querySelector(".scope-pill");
    expect(pill).withContext("scope pill should render once scoped").toBeTruthy();
    expect(pill?.textContent).toContain("jmorales / two");

    // Scoped to one tab: only that tab's card should render.
    const cards = el.querySelectorAll(".card");
    expect(cards.length).toBe(1);
  });

  it("clicking the scope pill's × navigates back to /", async () => {
    paramMap$.next(convertToParamMap({ workspaceId: "w6", tabId: "w6:t2" }));
    await settle(fixture);

    const el = fixture.nativeElement as HTMLElement;
    el.querySelector<HTMLButtonElement>(".scope-pill-close")?.click();

    expect(navigateSpy).toHaveBeenCalledWith(["/"]);
  });

  it("Escape clears the scope by navigating back to /", async () => {
    paramMap$.next(convertToParamMap({ workspaceId: "w6", tabId: "w6:t2" }));
    await settle(fixture);
    navigateSpy.calls.reset();

    const keyboard = TestBed.inject(KeyboardService);
    keyboard.handleKeydown(new KeyboardEvent("keydown", { key: "Escape" }), document.body);

    expect(navigateSpy).toHaveBeenCalledWith(["/"]);
  });

  it("no workspaceId in the route means no scope and no pill", async () => {
    const el = fixture.nativeElement as HTMLElement;
    expect(store.scopeSignal()).toBeNull();
    expect(el.querySelector(".scope-pill")).toBeNull();
  });
});

describe("Board pager: pure paging + density rules", () => {
  it("pageIndex is Math.round(scrollLeft / clientWidth), and 0 before layout", () => {
    expect(pageIndex(0, 390)).toBe(0);
    expect(pageIndex(390, 390)).toBe(1);
    expect(pageIndex(1170, 390)).toBe(3);
    // Mid-gesture readings round to the nearer page; a settled strip is exact.
    expect(pageIndex(400, 390)).toBe(1);
    expect(pageIndex(560, 390)).toBe(1);
    expect(pageIndex(600, 390)).toBe(2);
    expect(pageIndex(100, 0)).toBe(0);
  });

  it("nearestVisibleStatus keeps the current column when it is still visible", () => {
    expect(nearestVisibleStatus("idle", ["working", "blocked", "idle", "done", "unknown"])).toBe("idle");
  });

  it("nearestVisibleStatus falls back to the nearest visible column to the LEFT", () => {
    // `idle` hidden while shown -> `blocked` (its left neighbour in STATUS_COLUMN_ORDER)
    expect(nearestVisibleStatus("idle", ["working", "blocked", "done", "unknown"])).toBe("blocked");
    // both left neighbours hidden too -> keeps walking left
    expect(nearestVisibleStatus("done", ["working", "unknown"])).toBe("working");
  });

  it("nearestVisibleStatus falls back to the FIRST visible column when nothing is to the left", () => {
    expect(nearestVisibleStatus("working", ["idle", "done"])).toBe("idle");
  });

  it("nearestVisibleStatus reports nothing when every status is hidden", () => {
    expect(nearestVisibleStatus("working", [])).toBeNull();
  });

  it("compact at > 20 and virtualization at > 50 are distinct thresholds", () => {
    expect(isCompact(20, false)).toBe(false);
    expect(isCompact(21, false)).toBe(true);
    expect(isVirtualized(20)).toBe(false);
    expect(isVirtualized(21)).toBe(false);
    expect(isVirtualized(50)).toBe(false);
    expect(isVirtualized(51)).toBe(true);
  });

  it("everything is compact below the mobile breakpoint, whatever the count", () => {
    expect(isCompact(0, true)).toBe(true);
    expect(isCompact(1, true)).toBe(true);
  });

  it("itemSize is the compact row height plus its gap, or virtualized rows clip", () => {
    expect(VIRTUAL_ITEM_SIZE).toBe(52);
  });
});

describe("Board: filter interaction with the pager", () => {
  // Same fake-route scaffolding as the URL-scope suite above: what is under
  // test here is which status columns render, and what replaces them when
  // every one of them is hidden.
  let ws: FakeWsClient;
  let fixture: ComponentFixture<Board>;
  let httpMock: HttpTestingController;
  let store: PanesStore;

  function renderedStatuses(): string[] {
    const el = fixture.nativeElement as HTMLElement;
    return Array.from(el.querySelectorAll("app-column")).map(
      (column) => column.querySelector(".column")?.getAttribute("data-status") ?? "",
    );
  }

  beforeEach(async () => {
    ws = new FakeWsClient();
    ws.request.and.callFake((_host: string, method: string) => {
      if (method === "pane.list") {
        return Promise.resolve({
          panes: [
            {
              id: "p1",
              host: "local",
              workspace: { id: "w6", name: "jmorales" },
              tab: { id: "t1", name: "one" },
              agent_status: "idle",
            },
            {
              id: "p2",
              host: "local",
              workspace: { id: "w6", name: "jmorales" },
              tab: { id: "t1", name: "one" },
              agent_status: "working",
            },
          ],
        });
      }
      if (method === "events.subscribe") return Promise.resolve({ subscription_id: "s1" });
      if (method === "bridge.capabilities") {
        return Promise.resolve({
          tier: 1,
          terminal: false,
          paneResize: false,
          paneGraphics: false,
          outputPollIntervalMs: 0,
          paneCreate: false,
          paneClose: false,
          paneMove: false,
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
        { provide: ActivatedRoute, useValue: { paramMap: new BehaviorSubject(convertToParamMap({})).asObservable() } },
        { provide: Router, useValue: { navigate: jasmine.createSpy("navigate").and.resolveTo(true) } },
      ],
    }).compileComponents();
    httpMock = TestBed.inject(HttpTestingController);

    fixture = TestBed.createComponent(Board);
    store = TestBed.inject(PanesStore);
    store.filtersSignal.set(defaultFilters());
    fixture.detectChanges();
    await settle(fixture);
    for (const req of httpMock.match("/api/hosts")) {
      if (!req.cancelled) {
        req.flush({ hosts: [{ name: "local", connected: true }] });
      }
    }
    await settle(fixture);
  });

  afterEach(() => {
    httpMock.verify();
    store.filtersSignal.set(defaultFilters());
  });

  it("renders one page per status, in STATUS_COLUMN_ORDER, including the empty ones", async () => {
    expect(renderedStatuses()).toEqual(["working", "blocked", "idle", "done", "unknown"]);
  });

  it("hiding a status removes its page and leaves the order unchanged", async () => {
    store.toggleStatus("idle");
    await settle(fixture);

    expect(renderedStatuses()).toEqual(["working", "blocked", "done", "unknown"]);
  });

  it("un-hiding re-inserts the page at its STATUS_COLUMN_ORDER position", async () => {
    store.toggleStatus("idle");
    await settle(fixture);
    store.toggleStatus("idle");
    await settle(fixture);

    expect(renderedStatuses()).toEqual(["working", "blocked", "idle", "done", "unknown"]);
  });

  it("hiding every status shows the no-matches empty state with a clear action, not an empty pager", async () => {
    for (const status of STATUS_COLUMN_ORDER) {
      store.toggleStatus(status);
    }
    await settle(fixture);

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector(".board-strip")).withContext("no empty pager").toBeNull();
    expect(el.querySelector("app-status-switcher")).toBeNull();
    const noMatches = el.querySelector(".no-matches");
    expect(noMatches?.textContent).toContain("nothing matches these filters.");

    const clear = noMatches?.querySelector<HTMLButtonElement>(".action");
    expect(clear?.textContent?.trim()).toBe("clear filters");
    clear?.click();
    await settle(fixture);

    expect(renderedStatuses()).toEqual(["working", "blocked", "idle", "done", "unknown"]);
  });

  it("exposes no drag affordance on a status column", async () => {
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector("[cdkDrag], .cdk-drag, .cdk-drop-list, [cdkDropList]")).toBeNull();
    expect(el.querySelector(".drag-handle")).toBeNull();
  });
});

describe("Board: an invalid scope is reported, never silently swallowed", () => {
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
      if (method === "pane.list") {
        return Promise.resolve({
          panes: [
            {
              id: "p1",
              host: "local",
              workspace: { id: "w6", name: "jmorales" },
              tab: { id: "t1", name: "one" },
              agent_status: "idle",
            },
          ],
        });
      }
      if (method === "events.subscribe") return Promise.resolve({ subscription_id: "s1" });
      if (method === "bridge.capabilities") {
        return Promise.resolve({
          tier: 1,
          terminal: false,
          paneResize: false,
          paneGraphics: false,
          outputPollIntervalMs: 0,
          paneCreate: false,
          paneClose: false,
          paneMove: false,
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
        { provide: Router, useValue: { navigate: jasmine.createSpy("navigate").and.resolveTo(true) } },
      ],
    }).compileComponents();
    httpMock = TestBed.inject(HttpTestingController);

    fixture = TestBed.createComponent(Board);
    store = TestBed.inject(PanesStore);
    clock = TestBed.inject(ClockTick);
    fixture.detectChanges();
    await settle(fixture);
    for (const req of httpMock.match("/api/hosts")) {
      if (!req.cancelled) {
        req.flush({ hosts: [{ name: "local", connected: true }] });
      }
    }
    await settle(fixture);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it("shows the skeleton, not the previous scope's board, while a scoped id is still unresolved", async () => {
    paramMap$.next(convertToParamMap({ workspaceId: "w6" }));
    await settle(fixture);
    expect(store.scopeSignal()).toEqual({ host: "local", workspaceId: "w6", tabId: null });

    paramMap$.next(convertToParamMap({ workspaceId: "gone" }));
    await settle(fixture);

    const el = fixture.nativeElement as HTMLElement;
    expect(store.scopeSignal()).withContext("the old scope is dropped immediately").toBeNull();
    expect(el.querySelector(".board-skeleton")).not.toBeNull();
    expect(el.querySelector(".board-strip")).toBeNull();
    expect(el.querySelector(".scope-pill")).toBeNull();
  });

  it("says the field is no longer here once the id has stayed unresolved", async () => {
    paramMap$.next(convertToParamMap({ workspaceId: "gone" }));
    await settle(fixture);

    clock.now.set(Date.now() + SCOPE_RESOLVE_GRACE_MS + 1000);
    await settle(fixture);

    const el = fixture.nativeElement as HTMLElement;
    const state = el.querySelector(".state-unavailable");
    expect(state?.textContent).toContain("that field is no longer here.");
    expect(state?.querySelector("button")?.textContent?.trim()).toBe("back to the board");
    expect(el.querySelector(".board-strip")).withContext("no silent fallback board").toBeNull();
  });

  it("recovers without a reload once the scoped field resolves", async () => {
    paramMap$.next(convertToParamMap({ workspaceId: "gone" }));
    await settle(fixture);
    clock.now.set(Date.now() + SCOPE_RESOLVE_GRACE_MS + 1000);
    await settle(fixture);
    expect((fixture.nativeElement as HTMLElement).querySelector(".state-unavailable")).not.toBeNull();

    paramMap$.next(convertToParamMap({ workspaceId: "w6" }));
    await settle(fixture);

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector(".state-unavailable")).toBeNull();
    expect(el.querySelector(".board-strip")).not.toBeNull();
    expect(store.scopeSignal()).toEqual({ host: "local", workspaceId: "w6", tabId: null });
  });
});
