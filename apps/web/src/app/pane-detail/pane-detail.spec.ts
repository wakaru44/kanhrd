import { WritableSignal, provideZonelessChangeDetection, signal } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { ActivatedRoute, convertToParamMap } from "@angular/router";
import { BehaviorSubject, Subject, of } from "rxjs";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import type { HostSummary, WsEvent } from "@kanhrd/schema";
import { PaneDetail } from "./pane-detail";
import { COPY } from "../shared/copy";
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
  let hosts: WritableSignal<HostSummary[]>;

  /** DOM-level view of the reliability state, asserted through the markup rather than a protected signal. */
  function stateEl(selector: string): Element | null {
    return fixture.nativeElement.querySelector(selector) as Element | null;
  }

  beforeEach(async () => {
    ws = new FakeWsClient();
    hosts = signal<HostSummary[]>([{ name: "laptop", connected: true }]);
    paramMap$ = new BehaviorSubject(convertToParamMap({ host: "laptop", id: "pane-1" }));

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
  // --- reliability states (docs/UX-GUIDELINES.md, "Reliability states tell
  // the truth"). Asserted through the rendered markup, not the protected
  // signal, so a refactor of the state machine that keeps the same visible
  // behaviour keeps these tests green.

  it("shows the keeping-watch loading state before the first frame, and nothing else", async () => {
    ws.connected.set(false);

    fixture = TestBed.createComponent(PaneDetail);
    fixture.detectChanges();
    await flushMicrotasks();
    fixture.detectChanges();

    expect(stateEl(".terminal-loading")).not.toBeNull();
    expect(stateEl(".terminal-loading")?.textContent).toContain(COPY.loading.pane);
    expect(stateEl(".terminal-failed")).toBeNull();
    expect(stateEl(".terminal-empty")).toBeNull();
    expect(stateEl(".stale-marker")).toBeNull();
  });

  it("clears every state overlay once content has landed and the subscription is live", async () => {
    fixture = TestBed.createComponent(PaneDetail);
    fixture.detectChanges();
    await flushMicrotasks();
    fixture.detectChanges();

    expect(stateEl(".terminal-loading")).toBeNull();
    expect(stateEl(".terminal-failed")).toBeNull();
    expect(stateEl(".terminal-empty")).toBeNull();
    expect(stateEl(".terminal-unavailable")).toBeNull();
    expect(stateEl(".stale-marker")).toBeNull();
  });

  it("renders the empty state when the read succeeds with no bytes", async () => {
    ws.request.and.callFake((_host: string, method: string) => {
      switch (method) {
        case "pane.read":
          return Promise.resolve({ content: "", revision: 1, truncated: false, format: "ansi", source: "recent" });
        case "pane.subscribe_output":
          return Promise.resolve({ subscription_id: "sub-1" });
        default:
          return Promise.resolve({});
      }
    });

    fixture = TestBed.createComponent(PaneDetail);
    fixture.detectChanges();
    await flushMicrotasks();
    fixture.detectChanges();

    expect(stateEl(".terminal-empty")?.textContent).toContain(COPY.emptyState.penEmpty);
    expect(stateEl(".terminal-loading")).toBeNull();
  });

  it("replaces loading with a retry and a back path when the read fails with nothing on screen", async () => {
    ws.request.and.callFake((_host: string, method: string) => {
      if (method === "pane.read") {
        return Promise.reject(new Error("herdr said no"));
      }
      return Promise.resolve({});
    });

    fixture = TestBed.createComponent(PaneDetail);
    fixture.detectChanges();
    await flushMicrotasks();
    fixture.detectChanges();

    const failed = stateEl(".terminal-failed");
    expect(failed).not.toBeNull();
    // herdr's own wording is quoted verbatim, never rewritten.
    expect(failed?.textContent).toContain("herdr said no");
    expect(failed?.querySelector("button.retry")?.textContent).toContain(COPY.loading.retry);
    expect(failed?.querySelector("a.state-back")?.textContent).toContain(COPY.nav.backToBoard);
    // Never left spinning.
    expect(stateEl(".terminal-loading")).toBeNull();
  });

  it("retries the read from the failed state", async () => {
    let attempt = 0;
    ws.request.and.callFake((_host: string, method: string) => {
      switch (method) {
        case "pane.read":
          attempt += 1;
          return attempt === 1
            ? Promise.reject(new Error("herdr said no"))
            : Promise.resolve({ content: "back", revision: 2, truncated: false, format: "ansi", source: "recent" });
        case "pane.subscribe_output":
          return Promise.resolve({ subscription_id: "sub-1" });
        default:
          return Promise.resolve({});
      }
    });

    fixture = TestBed.createComponent(PaneDetail);
    fixture.detectChanges();
    await flushMicrotasks();
    fixture.detectChanges();

    (stateEl("button.retry") as HTMLButtonElement).click();
    await flushMicrotasks();
    fixture.detectChanges();

    expect(attempt).toBe(2);
    expect(stateEl(".terminal-failed")).toBeNull();
  });

  it("marks a single disconnect stale and keeps the already-rendered content", async () => {
    const writeSpy = spyOn(Terminal.prototype, "write");
    const resetSpy = spyOn(Terminal.prototype, "reset");

    fixture = TestBed.createComponent(PaneDetail);
    fixture.detectChanges();
    await flushMicrotasks();
    fixture.detectChanges();

    expect(writeSpy).toHaveBeenCalledWith("hello");
    writeSpy.calls.reset();
    resetSpy.calls.reset();

    // One pen/bridge disconnect.
    ws.connected.set(false);
    fixture.detectChanges();

    expect(stateEl(".stale-marker")?.textContent).toContain(COPY.state.stale);
    // Content survives: nothing is cleared and nothing is rewritten.
    expect(resetSpy).not.toHaveBeenCalled();
    expect(writeSpy).not.toHaveBeenCalled();
    // And it is not misreported as a fresh load or a failure.
    expect(stateEl(".terminal-loading")).toBeNull();
    expect(stateEl(".terminal-failed")).toBeNull();
  });

  it("reports a disconnected pen as unavailable, with a back path, without blanking content", async () => {
    const writeSpy = spyOn(Terminal.prototype, "write");
    const resetSpy = spyOn(Terminal.prototype, "reset");

    fixture = TestBed.createComponent(PaneDetail);
    fixture.detectChanges();
    await flushMicrotasks();
    fixture.detectChanges();
    writeSpy.calls.reset();
    resetSpy.calls.reset();

    hosts.set([{ name: "laptop", connected: false }]);
    fixture.detectChanges();

    const unavailable = stateEl(".terminal-unavailable");
    expect(unavailable?.textContent).toContain(COPY.state.unavailable);
    expect(unavailable?.querySelector("a.state-back")?.textContent).toContain(COPY.nav.backToBoard);
    expect(resetSpy).not.toHaveBeenCalled();
  });

  it("does not claim a pen is unavailable merely because the bridge has not listed it yet", async () => {
    hosts.set([]);

    fixture = TestBed.createComponent(PaneDetail);
    fixture.detectChanges();
    await flushMicrotasks();
    fixture.detectChanges();

    expect(stateEl(".terminal-unavailable")).toBeNull();
  });

  // --- keyboard: the terminal owns its keys.

  it("registers no global keyboard handler on document or window", async () => {
    const docSpy = spyOn(document, "addEventListener").and.callThrough();
    const winSpy = spyOn(window, "addEventListener").and.callThrough();

    fixture = TestBed.createComponent(PaneDetail);
    fixture.detectChanges();
    await flushMicrotasks();

    const keyTypes = [...docSpy.calls.allArgs(), ...winSpy.calls.allArgs()]
      .map(([type]) => String(type))
      .filter((type) => type.startsWith("key"));
    expect(keyTypes)
      .withContext("a global key handler would swallow Escape / ? away from vim, less and fzf")
      .toEqual([]);
  });

  it("leaves unmodified Escape and a bare ? unhandled at the document", async () => {
    fixture = TestBed.createComponent(PaneDetail);
    fixture.detectChanges();
    await flushMicrotasks();

    for (const key of ["Escape", "?"]) {
      const evt = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
      document.dispatchEvent(evt);
      expect(evt.defaultPrevented).withContext(`${key} must reach the terminal`).toBe(false);
    }
  });

  // --- copy and glyphs.

  it("routes the back control through copy.ts and renders a lucide icon, not an entity arrow", async () => {
    fixture = TestBed.createComponent(PaneDetail);
    fixture.detectChanges();
    await flushMicrotasks();
    fixture.detectChanges();

    const back = stateEl("header .back") as HTMLAnchorElement;
    expect(back.textContent).toContain(COPY.nav.backToBoard);
    expect(back.querySelector("svg")).not.toBeNull();
    expect(back.textContent).not.toContain("\u2190");
    // First focusable element in the header.
    const focusable = fixture.nativeElement.querySelectorAll("header a, header button");
    expect(focusable[0]).toBe(back);
  });

  it("makes no promise about an unshipped feature and no claim about the poll interval", async () => {
    fixture = TestBed.createComponent(PaneDetail);
    fixture.detectChanges();
    await flushMicrotasks();
    fixture.detectChanges();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? "";
    expect(text.toLowerCase()).not.toContain("coming soon");
    expect(text.toLowerCase()).not.toContain("updates every");
  });

  // --- the terminal owns the vertical axis on touch.
  //
  // xterm 6 has no touch scrolling of its own (its `.xterm-viewport` is
  // decorative and `Gesture.addTarget` is never called), and nothing above
  // the container scrolls at phone size, so an unclaimed vertical swipe
  // used to fall through to the page — where a phone browser reads a
  // downward one as pull-to-refresh.

  /** Mounts with a real box, so the terminal renders rows with a measurable height. */
  async function mountSized(): Promise<HTMLElement> {
    fixture = TestBed.createComponent(PaneDetail);
    const root = fixture.nativeElement as HTMLElement;
    root.style.display = "block";
    root.style.width = "600px";
    root.style.height = "400px";
    fixture.detectChanges();
    await flushMicrotasks();
    fixture.detectChanges();
    return root.querySelector(".terminal-container") as HTMLElement;
  }

  function touch(target: HTMLElement, type: string, clientY: number): TouchEvent {
    const point = new Touch({ identifier: 1, target, clientX: 100, clientY });
    return new TouchEvent(type, {
      bubbles: true,
      cancelable: type !== "touchstart",
      touches: type === "touchend" || type === "touchcancel" ? [] : [point],
      changedTouches: [point],
    });
  }

  it("reserves the vertical touch axis on the terminal container", async () => {
    const container = await mountSized();
    const style = getComputedStyle(container);

    // `pan-y` is deliberately absent: the app spends it on scrollback.
    expect(style.touchAction).toContain("pan-x");
    expect(style.touchAction).not.toContain("pan-y");
    // Pinch-zoom and taps stay with the browser, so tap-to-focus and the
    // on-screen keyboard are unaffected.
    expect(style.touchAction).toContain("pinch-zoom");
    expect(style.overscrollBehaviorY).toBe("contain");
  });

  it("spends a vertical touch drag on the terminal's scrollback, not the page", async () => {
    const scrollLines = spyOn(Terminal.prototype, "scrollLines");
    const container = await mountSized();

    container.dispatchEvent(touch(container, "touchstart", 300));
    const move = touch(container, "touchmove", 100); // finger up 200px => newer output
    container.dispatchEvent(move);

    expect(scrollLines).toHaveBeenCalled();
    expect(scrollLines.calls.mostRecent().args[0]).toBeGreaterThan(0);
    // The browser must not also get the gesture — that is the
    // pull-to-refresh path.
    expect(move.defaultPrevented).toBe(true);

    // Dragging the other way pulls older output back.
    scrollLines.calls.reset();
    container.dispatchEvent(touch(container, "touchmove", 300));
    expect(scrollLines.calls.mostRecent().args[0]).toBeLessThan(0);
  });

  it("keeps the gesture at the scroll boundary so the page never overscrolls", async () => {
    spyOn(Terminal.prototype, "scrollLines"); // pinned at the top of the scrollback
    const container = await mountSized();

    container.dispatchEvent(touch(container, "touchstart", 100));
    const move = touch(container, "touchmove", 380);
    container.dispatchEvent(move);

    expect(move.defaultPrevented).toBe(true);
  });

  it("stops handling touch once destroyed", async () => {
    const scrollLines = spyOn(Terminal.prototype, "scrollLines");
    const container = await mountSized();
    container.dispatchEvent(touch(container, "touchstart", 300));
    fixture.destroy();

    scrollLines.calls.reset();
    container.dispatchEvent(touch(container, "touchmove", 100));
    expect(scrollLines).not.toHaveBeenCalled();
  });

  it("refits from the container's own box rather than a window resize", async () => {
    const container = await mountSized();
    // Let the observer's initial observation land before measuring.
    await new Promise((resolve) => setTimeout(resolve, 100));
    const fit = spyOn(FitAddon.prototype, "fit");

    // Nothing about the window changes here — only the box the terminal
    // lives in, which is what a wrapping header or an opening drawer does.
    (container.closest(".pane-detail") as HTMLElement).style.height = "240px";
    await new Promise((resolve) => setTimeout(resolve, 150));

    expect(fit).toHaveBeenCalled();
  });
});
