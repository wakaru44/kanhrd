import { provideZonelessChangeDetection, signal } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { ActivatedRoute, convertToParamMap } from "@angular/router";
import { BehaviorSubject, Subject, of } from "rxjs";
import { Terminal } from "@xterm/xterm";
import type { WsEvent } from "@kanhrd/schema";
import { PaneDetail } from "./pane-detail";
import { PanesStore } from "../state/panes.store";
import { WsClient } from "../state/ws-client";

class FakeWsClient {
  readonly connected = signal(true);
  readonly events$ = new Subject<WsEvent>();
  readonly request = jasmine.createSpy("request").and.callFake((_host: string, method: string) => {
    switch (method) {
      case "pane.read":
        return Promise.resolve({
          content: "hello",
          revision: 1,
          truncated: false,
          format: "ansi",
          source: "recent",
        });
      case "pane.subscribe_output":
        return Promise.resolve({ subscription_id: "sub-1" });
      default:
        return Promise.resolve({});
    }
  });
}

async function flushMicrotasks(): Promise<void> {
  // The send queue chains `.catch().then().catch()` per enqueued send, so a
  // failed-then-next-send sequence needs several microtask hops to settle.
  for (let i = 0; i < 15; i++) {
    await Promise.resolve();
  }
}

describe("PaneDetail", () => {
  let ws: FakeWsClient;
  let fixture: ComponentFixture<PaneDetail>;
  let paramMap$: BehaviorSubject<ReturnType<typeof convertToParamMap>>;

  beforeEach(async () => {
    ws = new FakeWsClient();
    paramMap$ = new BehaviorSubject(convertToParamMap({ host: "laptop", id: "pane-1" }));

    await TestBed.configureTestingModule({
      imports: [PaneDetail],
      providers: [
        provideZonelessChangeDetection(),
        { provide: WsClient, useValue: ws },
        {
          provide: PanesStore,
          useValue: { panesSignal: () => new Map(), capabilitiesSignal: () => new Map() },
        },
        {
          provide: ActivatedRoute,
          useValue: { paramMap: paramMap$ },
        },
      ],
    }).compileComponents();
  });

  it("fetches pane.read then subscribes to output on mount", async () => {
    fixture = TestBed.createComponent(PaneDetail);
    fixture.detectChanges();
    await flushMicrotasks();

    expect(ws.request).toHaveBeenCalledWith("laptop", "pane.read", {
      pane_id: "pane-1",
      format: "ansi",
      source: "recent",
    });
    expect(ws.request).toHaveBeenCalledWith("laptop", "pane.subscribe_output", { pane_id: "pane-1" });

    const readIndex = ws.request.calls.allArgs().findIndex(([, method]) => method === "pane.read");
    const subscribeIndex = ws.request.calls
      .allArgs()
      .findIndex(([, method]) => method === "pane.subscribe_output");
    expect(readIndex).toBeGreaterThanOrEqual(0);
    expect(subscribeIndex).toBeGreaterThan(readIndex);
  });

  it("unsubscribes on destroy", async () => {
    fixture = TestBed.createComponent(PaneDetail);
    fixture.detectChanges();
    await flushMicrotasks();

    fixture.destroy();

    expect(ws.request).toHaveBeenCalledWith("laptop", "pane.unsubscribe_output", {
      subscription_id: "sub-1",
    });
  });

  it("writes fetched content on load and resets+rewrites on a matching pane.output event", async () => {
    const writeSpy = spyOn(Terminal.prototype, "write");
    const resetSpy = spyOn(Terminal.prototype, "reset");

    fixture = TestBed.createComponent(PaneDetail);
    fixture.detectChanges();
    await flushMicrotasks();

    expect(writeSpy).toHaveBeenCalledWith("hello");

    ws.events$.next({
      host: "laptop",
      event: "pane.output",
      payload: {
        subscription_id: "sub-1",
        pane_id: "pane-1",
        revision: 2,
        content: "updated",
        format: "ansi",
        truncated: false,
      },
    });

    expect(resetSpy).toHaveBeenCalled();
    expect(writeSpy).toHaveBeenCalledWith("updated");
  });

  it("ignores pane.output events for a different subscription id", async () => {
    const writeSpy = spyOn(Terminal.prototype, "write");
    const resetSpy = spyOn(Terminal.prototype, "reset");

    fixture = TestBed.createComponent(PaneDetail);
    fixture.detectChanges();
    await flushMicrotasks();
    writeSpy.calls.reset();
    resetSpy.calls.reset();

    ws.events$.next({
      host: "laptop",
      event: "pane.output",
      payload: {
        subscription_id: "some-other-subscription",
        pane_id: "pane-1",
        revision: 2,
        content: "should not appear",
        format: "ansi",
        truncated: false,
      },
    });

    expect(resetSpy).not.toHaveBeenCalled();
    expect(writeSpy).not.toHaveBeenCalled();
  });

  it("serializes rapid keystrokes: each send is awaited before the next one is issued", async () => {
    let capturedOnData: ((data: string) => void) | undefined;
    // `Terminal.onData` is an accessor (`IEvent<string>`), not a plain
    // method, so it needs `spyOnProperty(..., "get")` rather than `spyOn`.
    spyOnProperty(Terminal.prototype, "onData", "get").and.returnValue(
      (cb: (data: string) => void) => {
        capturedOnData = cb;
        return { dispose: () => undefined };
      },
    );

    const sendCalls: string[] = [];
    // Resolved manually rather than via a timer, so ordering is asserted
    // deterministically instead of racing a real 20ms delay.
    const resolvers: Array<() => void> = [];
    ws.request.and.callFake((_host: string, method: string, params?: { text?: string }) => {
      switch (method) {
        case "pane.read":
          return Promise.resolve({ content: "", revision: 1, truncated: false, format: "ansi", source: "recent" });
        case "pane.subscribe_output":
          return Promise.resolve({ subscription_id: "sub-1" });
        case "pane.send_text":
          sendCalls.push(params?.text ?? "");
          return new Promise((resolve) => resolvers.push(() => resolve({})));
        default:
          return Promise.resolve({});
      }
    });

    fixture = TestBed.createComponent(PaneDetail);
    fixture.detectChanges();
    await flushMicrotasks();
    expect(capturedOnData).toBeTruthy();

    // Type three keystrokes back-to-back, faster than any WS round-trip.
    capturedOnData?.("a");
    capturedOnData?.("b");
    capturedOnData?.("c");
    await flushMicrotasks();

    // Only the first send is in flight; the queue must not fire the next
    // one until the previous request's promise settles.
    expect(sendCalls).toEqual(["a"]);

    resolvers[0]();
    await flushMicrotasks();
    expect(sendCalls).toEqual(["a", "b"]);

    resolvers[1]();
    await flushMicrotasks();
    expect(sendCalls).toEqual(["a", "b", "c"]);

    resolvers[2]();
    await flushMicrotasks();
  });

  it("logs a failed send but keeps draining the queue", async () => {
    const warnSpy = spyOn(console, "warn");
    let capturedOnData: ((data: string) => void) | undefined;
    // `Terminal.onData` is an accessor (`IEvent<string>`), not a plain
    // method, so it needs `spyOnProperty(..., "get")` rather than `spyOn`.
    spyOnProperty(Terminal.prototype, "onData", "get").and.returnValue(
      (cb: (data: string) => void) => {
        capturedOnData = cb;
        return { dispose: () => undefined };
      },
    );

    const sendCalls: string[] = [];
    ws.request.and.callFake((_host: string, method: string, params?: { text?: string }) => {
      switch (method) {
        case "pane.read":
          return Promise.resolve({ content: "", revision: 1, truncated: false, format: "ansi", source: "recent" });
        case "pane.subscribe_output":
          return Promise.resolve({ subscription_id: "sub-1" });
        case "pane.send_text":
          sendCalls.push(params?.text ?? "");
          if (params?.text === "a") {
            return Promise.reject(new Error("boom"));
          }
          return Promise.resolve({});
        default:
          return Promise.resolve({});
      }
    });

    fixture = TestBed.createComponent(PaneDetail);
    fixture.detectChanges();
    await flushMicrotasks();

    capturedOnData?.("a");
    capturedOnData?.("b");
    await flushMicrotasks();

    expect(sendCalls).toEqual(["a", "b"]);
    expect(warnSpy).toHaveBeenCalledWith("pane-detail: send failed", jasmine.any(Error));
  });

  it("does not fetch on mount while the socket is disconnected, then fetches once it connects", async () => {
    ws.connected.set(false);

    fixture = TestBed.createComponent(PaneDetail);
    fixture.detectChanges();
    await flushMicrotasks();

    expect(ws.request).not.toHaveBeenCalledWith("laptop", "pane.read", jasmine.anything());

    // Simulates the cold-deep-link case from apps/web/e2e/README.md: the WS
    // connection finishes opening after the component has already mounted.
    ws.connected.set(true);
    fixture.detectChanges();
    await flushMicrotasks();

    expect(ws.request).toHaveBeenCalledWith("laptop", "pane.read", {
      pane_id: "pane-1",
      format: "ansi",
      source: "recent",
    });
    expect(ws.request).toHaveBeenCalledWith("laptop", "pane.subscribe_output", { pane_id: "pane-1" });
  });

  it("refetches when the route params change to a different pane, without remounting", async () => {
    fixture = TestBed.createComponent(PaneDetail);
    fixture.detectChanges();
    await flushMicrotasks();

    expect(ws.request).toHaveBeenCalledWith("laptop", "pane.read", {
      pane_id: "pane-1",
      format: "ansi",
      source: "recent",
    });
    ws.request.calls.reset();

    paramMap$.next(convertToParamMap({ host: "laptop", id: "pane-2" }));
    fixture.detectChanges();
    await flushMicrotasks();

    // Old subscription is torn down and a fresh read+subscribe pair is
    // issued for the newly-active pane.
    expect(ws.request).toHaveBeenCalledWith("laptop", "pane.unsubscribe_output", {
      subscription_id: "sub-1",
    });
    expect(ws.request).toHaveBeenCalledWith("laptop", "pane.read", {
      pane_id: "pane-2",
      format: "ansi",
      source: "recent",
    });
    expect(ws.request).toHaveBeenCalledWith("laptop", "pane.subscribe_output", { pane_id: "pane-2" });
  });
});
