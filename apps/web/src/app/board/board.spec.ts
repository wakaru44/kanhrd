import { provideZonelessChangeDetection, signal } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from "@angular/router";
import { provideHttpClient } from "@angular/common/http";
import { HttpTestingController, provideHttpClientTesting } from "@angular/common/http/testing";
import { BehaviorSubject, Subject } from "rxjs";
import type { WsEvent } from "@kanhrd/schema";
import { Board } from "./board";
import { PanesStore } from "../state/panes.store";
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
    const hrefs = Array.from(cards)
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
    const hrefs = Array.from(cards)
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
