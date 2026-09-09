import { provideZonelessChangeDetection, signal } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { provideRouter } from "@angular/router";
import { provideHttpClient } from "@angular/common/http";
import { HttpTestingController, provideHttpClientTesting } from "@angular/common/http/testing";
import { Subject } from "rxjs";
import type { WsEvent } from "@kanhrd/schema";
import { Board } from "./board";
import { PanesStore } from "../state/panes.store";
import { WsClient } from "../state/ws-client";

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
      if (method === "pane.list") return Promise.resolve({ panes: [] });
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
