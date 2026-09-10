import { WritableSignal, signal } from '@angular/core';
import { Subject } from 'rxjs';
import { Terminal } from '@xterm/xterm';
import type { ITheme } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import type { WsEvent } from '@kanhrd/schema';
import { PaneTerminal } from './pane-terminal';
import type { PaneTerminalDeps } from './pane-terminal';
import { COPY } from '../shared/copy';

/**
 * `PaneTerminal` is a plain class, so these are plain unit tests: no
 * TestBed, no component fixture, no change detection. Everything it needs
 * arrives through the constructor, and everything it does is observable
 * through the fake socket, the four public signals, or the real xterm
 * instance it builds into a detached-then-attached `<div>`.
 */

const THEME_A: ITheme = { background: '#101010', foreground: '#eeeeee' };
const THEME_B: ITheme = { background: '#f4ede0', foreground: '#1a1815' };

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function readResult(content: string, revision = 1) {
  return { content, revision, truncated: false, format: 'ansi', source: 'recent' };
}

class FakeWsClient {
  readonly connected = signal(true);
  readonly events$ = new Subject<WsEvent>();
  readonly request = jasmine.createSpy('request').and.callFake((_host: string, method: string) => {
    switch (method) {
      case 'pane.read':
        return Promise.resolve(readResult('hello'));
      case 'pane.subscribe_output':
        return Promise.resolve({ subscription_id: 'sub-1' });
      default:
        return Promise.resolve({});
    }
  });
}

function paneOutput(content: string, subscriptionId = 'sub-1'): WsEvent<'pane.output'> {
  return {
    host: 'laptop',
    event: 'pane.output',
    payload: {
      subscription_id: subscriptionId,
      pane_id: 'pane-1',
      revision: 2,
      content,
      format: 'ansi',
      truncated: false,
    },
  };
}

async function flushMicrotasks(): Promise<void> {
  // The send queue chains `.catch().then().catch()` per enqueued send, so a
  // failed-then-next-send sequence needs several microtask hops to settle.
  for (let i = 0; i < 15; i++) {
    await Promise.resolve();
  }
}

describe('PaneTerminal', () => {
  let ws: FakeWsClient;
  let theme: WritableSignal<ITheme>;
  let fontSize: WritableSignal<number>;
  let toast: { push: jasmine.Spy };
  let term: PaneTerminal;
  let el: HTMLElement;
  let openSpy: jasmine.Spy;

  /** The live xterm instance, captured from the `open()` call `attach()` makes. */
  function liveTerm(): Terminal {
    return openSpy.calls.mostRecent().object as Terminal;
  }

  /** Feeds a `pane.output` frame in on the fake socket. */
  function emitOutput(content: string, subscriptionId = 'sub-1'): void {
    ws.events$.next(paneOutput(content, subscriptionId));
  }

  /**
   * Captures the `onData` callback xterm would invoke for a keystroke, so
   * typing can be simulated without a real key event. `Terminal.onData` is an
   * accessor (`IEvent<string>`), not a plain method, so it needs
   * `spyOnProperty(..., "get")`.
   */
  function captureOnData(): () => ((data: string) => void) | undefined {
    let captured: ((data: string) => void) | undefined;
    spyOnProperty(Terminal.prototype, 'onData', 'get').and.returnValue(
      (cb: (data: string) => void) => {
        captured = cb;
        return { dispose: () => undefined };
      }
    );
    return () => captured;
  }

  beforeEach(() => {
    ws = new FakeWsClient();
    theme = signal<ITheme>(THEME_A);
    fontSize = signal(13);
    toast = { push: jasmine.createSpy('push') };
    openSpy = spyOn(Terminal.prototype, 'open').and.callThrough();

    // A real box in the document: the fit loop, the row-height measurement
    // the touch engine needs, and xterm's own renderer all read geometry.
    el = document.createElement('div');
    el.style.width = '600px';
    el.style.height = '400px';
    el.style.overflow = 'hidden';
    document.body.appendChild(el);
  });

  afterEach(() => {
    term?.dispose();
    el.remove();
  });

  function build(): PaneTerminal {
    const deps: PaneTerminalDeps = {
      ws: ws as unknown as PaneTerminalDeps['ws'],
      terminalTheme: { theme },
      terminalFontSize: { size: fontSize },
      toast,
    };
    term = new PaneTerminal(deps);
    return term;
  }

  /** Builds, attaches and loads the default pane. */
  async function mounted(): Promise<PaneTerminal> {
    const t = build();
    t.attach(el);
    await t.load('laptop', 'pane-1');
    await flushMicrotasks();
    return t;
  }

  // --- load: read then subscribe, both at `source: "recent"` --------------

  it('reads then subscribes, both asking for the same source', async () => {
    await mounted();

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

    const methods = ws.request.calls.allArgs().map(([, method]) => method);
    expect(methods.indexOf('pane.subscribe_output')).toBeGreaterThan(methods.indexOf('pane.read'));

    // A live stream narrower than the first paint would delete this pane's
    // scrollback on the first poll, so the two `source` values must match.
    const read = ws.request.calls.allArgs().find(([, m]) => m === 'pane.read');
    const subscribe = ws.request.calls.allArgs().find(([, m]) => m === 'pane.subscribe_output');
    expect((subscribe?.[2] as { source: string }).source).toBe(
      (read?.[2] as { source: string }).source
    );
  });

  it('tears down the previous subscription before loading another pane', async () => {
    const t = await mounted();
    ws.request.calls.reset();

    await t.load('laptop', 'pane-2');
    await flushMicrotasks();

    expect(ws.request).toHaveBeenCalledWith('laptop', 'pane.unsubscribe_output', {
      subscription_id: 'sub-1',
    });
    expect(ws.request).toHaveBeenCalledWith('laptop', 'pane.read', {
      pane_id: 'pane-2',
      format: 'ansi',
      source: 'recent',
    });
  });

  it('unsubscribes on dispose', async () => {
    const t = await mounted();

    t.dispose();

    expect(ws.request).toHaveBeenCalledWith('laptop', 'pane.unsubscribe_output', {
      subscription_id: 'sub-1',
    });
  });

  // --- stale-route guards on both legs ------------------------------------

  it('discards a pane.read that lands after the pane moved on', async () => {
    const reads: Array<Deferred<unknown>> = [];
    ws.request.and.callFake((_host: string, method: string) => {
      if (method === 'pane.read') {
        const d = deferred<unknown>();
        reads.push(d);
        return d.promise;
      }
      if (method === 'pane.subscribe_output') {
        return Promise.resolve({ subscription_id: 'sub-1' });
      }
      return Promise.resolve({});
    });
    const writeSpy = spyOn(Terminal.prototype, 'write');

    const t = build();
    t.attach(el);
    void t.load('laptop', 'pane-1');
    void t.load('laptop', 'pane-2');
    await flushMicrotasks();

    reads[0].resolve(readResult('content for the pane we left'));
    await flushMicrotasks();

    expect(writeSpy).not.toHaveBeenCalledWith('content for the pane we left');
    expect(t.revision()).toBeNull();
  });

  it('unsubscribes a subscription that lands after the pane moved on', async () => {
    const subs: Array<Deferred<{ subscription_id: string }>> = [];
    ws.request.and.callFake((_host: string, method: string) => {
      if (method === 'pane.read') {
        return Promise.resolve(readResult('hello'));
      }
      if (method === 'pane.subscribe_output') {
        const d = deferred<{ subscription_id: string }>();
        subs.push(d);
        return d.promise;
      }
      return Promise.resolve({});
    });

    const t = build();
    t.attach(el);
    void t.load('laptop', 'pane-1');
    await flushMicrotasks();
    void t.load('laptop', 'pane-2');
    await flushMicrotasks();

    // The first pane's subscription is confirmed only now, after the view
    // has already moved to another pane: it must be released, not kept.
    subs[0].resolve({ subscription_id: 'orphan-sub' });
    await flushMicrotasks();

    expect(ws.request).toHaveBeenCalledWith('laptop', 'pane.unsubscribe_output', {
      subscription_id: 'orphan-sub',
    });
  });

  // --- painting -----------------------------------------------------------

  it('writes the fetched content on load', async () => {
    const writeSpy = spyOn(Terminal.prototype, 'write');
    await mounted();

    expect(writeSpy).toHaveBeenCalledWith('hello');
  });

  it('appends the new tail instead of repainting when a snapshot only grew', async () => {
    const writeSpy = spyOn(Terminal.prototype, 'write');
    const resetSpy = spyOn(Terminal.prototype, 'reset');
    await mounted();
    writeSpy.calls.reset();
    resetSpy.calls.reset();

    // The initial read returned "hello"; this snapshot is that plus a tail.
    emitOutput('hello, and one more line\r\n');

    // The whole point: history above the viewport is never cleared, so the
    // scrollback the initial `recent` read painted survives every poll.
    expect(resetSpy).not.toHaveBeenCalled();
    expect(writeSpy.calls.allArgs().map((args) => args[0])).toEqual([', and one more line\r\n']);
  });

  it('resets and rewrites when the snapshot is not a continuation', async () => {
    const writeSpy = spyOn(Terminal.prototype, 'write');
    await mounted();
    writeSpy.calls.reset();

    emitOutput('updated');

    // The repaint passes a completion callback (it restores the reader's
    // scroll offset once the snapshot has been parsed), so match on the data.
    // `\x1bc` is RIS, the full reset, carried in the same write — see below.
    expect(writeSpy.calls.mostRecent().args[0]).toBe('\x1bcupdated');
  });

  // Regression: the pane detail view strobed at the bridge's poll rate.
  //
  // `Terminal.reset()` recreates the buffer set, and xterm's RenderService
  // clears every rendered row *synchronously* on `onBufferActivate`, while the
  // replacement content only arrives through the asynchronous write queue and
  // renders a frame or more later. Every `pane.output` therefore composited
  // one fully blank frame. Any pane running a full-screen TUI — every coding
  // agent — redraws rather than appends, so at OUTPUT_POLL_INTERVAL_MS (150ms)
  // that was a whole-screen black-out at ~6.5Hz: inside the 3-30Hz band
  // WCAG 2.3.1 treats as a seizure risk. Measured with a CDP screencast:
  // 26 blank composited frames for 26 output frames before, 0 after.
  //
  // The redraw path must therefore carry its reset *inside* the write, never
  // as an out-of-band `reset()` call. `e2e/terminal-flicker.spec.ts` measures
  // the real frames; this pins the mechanism.
  it('never calls reset() on a redraw — the reset rides in the write instead', async () => {
    const writeSpy = spyOn(Terminal.prototype, 'write');
    const resetSpy = spyOn(Terminal.prototype, 'reset');
    await mounted();
    writeSpy.calls.reset();
    resetSpy.calls.reset();

    emitOutput('a completely different screen');
    emitOutput('and another one');

    expect(resetSpy).not.toHaveBeenCalled();
    expect(writeSpy.calls.allArgs().map((args) => args[0] as string)).toEqual([
      '\x1bca completely different screen',
      '\x1bcand another one',
    ]);
  });

  it('keeps a scrolled-up reader where they were when a redraw lands', async () => {
    spyOn(Terminal.prototype, 'write').and.callFake(((_data: string, done?: () => void) => {
      done?.();
    }) as never);
    spyOn(Terminal.prototype, 'reset');
    const scrollToLine = spyOn(Terminal.prototype, 'scrollToLine');
    // Scrolled up: the viewport's top line sits well above the last screenful.
    spyOnProperty(Terminal.prototype, 'buffer', 'get').and.returnValue({
      active: { viewportY: 12, baseY: 400 },
    } as never);

    await mounted();
    scrollToLine.calls.reset();

    // Not a prefix of "hello" — a full-screen redraw, which still resets.
    emitOutput('a completely different screen');

    expect(scrollToLine).toHaveBeenCalledWith(12);
  });

  it('follows the tail after a redraw when the reader was already at the bottom', async () => {
    spyOn(Terminal.prototype, 'write').and.callFake(((_data: string, done?: () => void) => {
      done?.();
    }) as never);
    spyOn(Terminal.prototype, 'reset');
    const scrollToLine = spyOn(Terminal.prototype, 'scrollToLine');
    spyOnProperty(Terminal.prototype, 'buffer', 'get').and.returnValue({
      active: { viewportY: 400, baseY: 400 },
    } as never);

    await mounted();
    scrollToLine.calls.reset();

    emitOutput('a completely different screen');

    expect(scrollToLine).not.toHaveBeenCalled();
  });

  it('ignores pane.output events for a different subscription id', async () => {
    const writeSpy = spyOn(Terminal.prototype, 'write');
    const resetSpy = spyOn(Terminal.prototype, 'reset');
    await mounted();
    writeSpy.calls.reset();
    resetSpy.calls.reset();

    emitOutput('should not appear', 'some-other-subscription');

    expect(resetSpy).not.toHaveBeenCalled();
    expect(writeSpy).not.toHaveBeenCalled();
  });

  it("carries the frame's revision and an observed timestamp", async () => {
    const t = await mounted();
    expect(t.revision()).toBe(1);
    expect(t.lastPollAt()).not.toBeNull();

    emitOutput('hello and more');
    expect(t.revision()).toBe(2);
  });

  // --- input --------------------------------------------------------------

  it('serializes rapid keystrokes: each send is awaited before the next one is issued', async () => {
    const onData = captureOnData();

    const sendCalls: string[] = [];
    // Resolved manually rather than via a timer, so ordering is asserted
    // deterministically instead of racing a real round-trip.
    const resolvers: Array<() => void> = [];
    ws.request.and.callFake((_host: string, method: string, params?: { text?: string }) => {
      switch (method) {
        case 'pane.read':
          return Promise.resolve(readResult(''));
        case 'pane.subscribe_output':
          return Promise.resolve({ subscription_id: 'sub-1' });
        case 'pane.send_text':
          sendCalls.push(params?.text ?? '');
          return new Promise((resolve) => resolvers.push(() => resolve({})));
        default:
          return Promise.resolve({});
      }
    });

    await mounted();
    expect(onData()).toBeTruthy();

    // Type three keystrokes back-to-back, faster than any WS round-trip.
    onData()?.('a');
    onData()?.('b');
    onData()?.('c');
    await flushMicrotasks();

    // Only the first send is in flight; the queue must not fire the next
    // one until the previous request's promise settles.
    expect(sendCalls).toEqual(['a']);

    resolvers[0]();
    await flushMicrotasks();
    expect(sendCalls).toEqual(['a', 'b']);

    resolvers[1]();
    await flushMicrotasks();
    expect(sendCalls).toEqual(['a', 'b', 'c']);

    resolvers[2]();
    await flushMicrotasks();
  });

  it('logs a failed send but keeps draining the queue', async () => {
    const warnSpy = spyOn(console, 'warn');
    const onData = captureOnData();

    const sendCalls: string[] = [];
    ws.request.and.callFake((_host: string, method: string, params?: { text?: string }) => {
      switch (method) {
        case 'pane.read':
          return Promise.resolve(readResult(''));
        case 'pane.subscribe_output':
          return Promise.resolve({ subscription_id: 'sub-1' });
        case 'pane.send_text':
          sendCalls.push(params?.text ?? '');
          if (params?.text === 'a') {
            return Promise.reject(new Error('boom'));
          }
          return Promise.resolve({});
        default:
          return Promise.resolve({});
      }
    });

    await mounted();

    onData()?.('a');
    onData()?.('b');
    await flushMicrotasks();

    expect(sendCalls).toEqual(['a', 'b']);
    expect(warnSpy).toHaveBeenCalledWith('pane-detail: send failed', jasmine.any(Error));
  });

  it('routes a mapped control sequence to pane.send_keys and ordinary text to pane.send_text', async () => {
    const onData = captureOnData();
    await mounted();
    ws.request.calls.reset();

    onData()?.('\r');
    await flushMicrotasks();
    onData()?.('hi');
    await flushMicrotasks();

    expect(ws.request).toHaveBeenCalledWith('laptop', 'pane.send_keys', {
      pane_id: 'pane-1',
      keys: ['Enter'],
    });
    expect(ws.request).toHaveBeenCalledWith('laptop', 'pane.send_text', {
      pane_id: 'pane-1',
      text: 'hi',
    });
  });

  it('falls back to send_text, with a warning, for control bytes it cannot map', async () => {
    const warnSpy = spyOn(console, 'warn');
    const onData = captureOnData();
    await mounted();
    ws.request.calls.reset();

    // A bare form feed inside a longer run: no key name for it, so the run
    // goes through verbatim rather than being dropped.
    onData()?.('ab\x0ccd');
    await flushMicrotasks();

    expect(ws.request).toHaveBeenCalledWith('laptop', 'pane.send_text', {
      pane_id: 'pane-1',
      text: 'ab\x0ccd',
    });
    expect(warnSpy.calls.allArgs().flat().join(' ')).toContain('unmapped control bytes');
  });

  it('sends programmatic input down the same classified, ordered path as a keystroke', async () => {
    const t = await mounted();
    ws.request.calls.reset();

    t.send('\x1b');
    await flushMicrotasks();
    t.send('ls');
    await flushMicrotasks();

    expect(ws.request).toHaveBeenCalledWith('laptop', 'pane.send_keys', {
      pane_id: 'pane-1',
      keys: ['Escape'],
    });
    expect(ws.request).toHaveBeenCalledWith('laptop', 'pane.send_text', {
      pane_id: 'pane-1',
      text: 'ls',
    });
  });

  it('sends nothing before a pane has been loaded', async () => {
    const t = build();
    t.attach(el);

    t.send('x');
    await flushMicrotasks();

    expect(ws.request).not.toHaveBeenCalled();
  });

  // --- geometry, theme, font size -----------------------------------------

  it("refits from the container's own box rather than a window resize", async () => {
    await mounted();
    // Let the observer's initial observation land before measuring.
    await new Promise((resolve) => setTimeout(resolve, 100));
    const fit = spyOn(FitAddon.prototype, 'fit');

    // Nothing about the window changes here — only the box the terminal
    // lives in, which is what a wrapping header or an opening drawer does.
    el.style.height = '240px';
    await new Promise((resolve) => setTimeout(resolve, 150));

    expect(fit).toHaveBeenCalled();
  });

  it('fits twice per convergence pass, so a re-measured cell size cannot leave rows clipped', async () => {
    await mounted();
    await new Promise((resolve) => setTimeout(resolve, 100));
    const fit = spyOn(FitAddon.prototype, 'fit');

    el.style.height = '300px';
    await new Promise((resolve) => setTimeout(resolve, 150));

    expect(fit.calls.count()).toBeGreaterThan(1);
  });

  it("swaps the live terminal's palette when the terminal theme setting changes", async () => {
    await mounted();
    expect(liveTerm().options.theme).toEqual(THEME_A);

    theme.set(THEME_B);
    await flushMicrotasks();

    expect(liveTerm().options.theme).toEqual(THEME_B);
  });

  it('constructs the terminal at the stored font size, not a hard-coded default', async () => {
    fontSize.set(17);
    await mounted();

    expect(liveTerm().options.fontSize).toBe(17);
  });

  it('assigns the new font size before refitting, so cols and rows use the new cell', async () => {
    await mounted();
    const sizeAtFit: Array<number | undefined> = [];
    spyOn(FitAddon.prototype, 'fit').and.callFake(function (this: FitAddon) {
      // The addon keeps the terminal it was loaded into; reading the option
      // here is the only way to observe the ordering from outside.
      const owner = (this as unknown as { _terminal?: Terminal })._terminal;
      sizeAtFit.push(owner?.options.fontSize);
    });

    fontSize.set(20);
    await flushMicrotasks();

    expect(liveTerm().options.fontSize).toBe(20);
    expect(sizeAtFit.length).toBeGreaterThan(0);
    // Every fit triggered by the change saw the new size, never the old one.
    expect(sizeAtFit.every((size) => size === 20)).toBeTrue();
  });

  it('recomputes cols and rows for the new cell, and comes back', async () => {
    await mounted();
    const live = liveTerm();

    fontSize.set(12);
    await flushMicrotasks();
    const small = { cols: live.cols, rows: live.rows };

    fontSize.set(20);
    await flushMicrotasks();
    const large = { cols: live.cols, rows: live.rows };

    // The container's pixel box never changed, so a bigger cell is strictly
    // fewer cells. This is a prediction about geometry, not a restatement of
    // what fit() computes — a spy on fit() would pass with a broken refit.
    expect(large.cols).toBeLessThan(small.cols);
    expect(large.rows).toBeLessThan(small.rows);

    // Cell width and height both scale linearly with font size, so the
    // counts scale inversely with it. Expected ratio comes from the sizes
    // themselves (20 / 12 = 1.667), independently of the rendered face.
    const expected = 20 / 12;
    expect(small.cols / large.cols).toBeGreaterThan(expected - 0.4);
    expect(small.cols / large.cols).toBeLessThan(expected + 0.4);

    fontSize.set(12);
    await flushMicrotasks();
    expect(live.cols).toBe(small.cols);
    expect(live.rows).toBe(small.rows);
  });

  it('keeps the palette and the size independent on the live terminal', async () => {
    await mounted();
    const live = liveTerm();

    fontSize.set(20);
    await flushMicrotasks();
    expect(live.options.theme).toEqual(THEME_A);

    theme.set(THEME_B);
    await flushMicrotasks();
    expect(live.options.fontSize).toBe(20);
  });

  it('sends no wire request when the font size changes', async () => {
    await mounted();
    ws.request.calls.reset();

    fontSize.set(20);
    await flushMicrotasks();

    // CONTRACT-TIER2.md section 6: resizing is client-side only.
    expect(ws.request).not.toHaveBeenCalled();
  });

  // --- touch: the terminal owns the vertical axis --------------------------

  function touch(target: HTMLElement, type: string, clientY: number): TouchEvent {
    const point = new Touch({ identifier: 1, target, clientX: 100, clientY });
    return new TouchEvent(type, {
      bubbles: true,
      cancelable: type !== 'touchstart',
      touches: type === 'touchend' || type === 'touchcancel' ? [] : [point],
      changedTouches: [point],
    });
  }

  it("spends a vertical touch drag on the terminal's scrollback, not the page", async () => {
    const scrollLines = spyOn(Terminal.prototype, 'scrollLines');
    await mounted();

    el.dispatchEvent(touch(el, 'touchstart', 300));
    const move = touch(el, 'touchmove', 100); // finger up 200px => newer output
    el.dispatchEvent(move);

    expect(scrollLines).toHaveBeenCalled();
    expect(scrollLines.calls.mostRecent().args[0]).toBeGreaterThan(0);
    // The browser must not also get the gesture — that is the
    // pull-to-refresh path.
    expect(move.defaultPrevented).toBeTrue();

    // Dragging the other way pulls older output back.
    scrollLines.calls.reset();
    el.dispatchEvent(touch(el, 'touchmove', 300));
    expect(scrollLines.calls.mostRecent().args[0]).toBeLessThan(0);
  });

  it('accumulates a sub-row drag instead of rounding it away', async () => {
    const scrollLines = spyOn(Terminal.prototype, 'scrollLines');
    await mounted();

    el.dispatchEvent(touch(el, 'touchstart', 300));
    // A one-pixel step is less than a row, so nothing moves yet…
    el.dispatchEvent(touch(el, 'touchmove', 299));
    expect(scrollLines).not.toHaveBeenCalled();

    // …but the carry adds up until a whole row is owed.
    for (let y = 298; y >= 260; y--) {
      el.dispatchEvent(touch(el, 'touchmove', y));
    }
    expect(scrollLines).toHaveBeenCalled();
  });

  it('keeps the gesture at the scroll boundary so the page never overscrolls', async () => {
    spyOn(Terminal.prototype, 'scrollLines'); // pinned at the top of the scrollback
    await mounted();

    el.dispatchEvent(touch(el, 'touchstart', 100));
    const move = touch(el, 'touchmove', 380);
    el.dispatchEvent(move);

    expect(move.defaultPrevented).toBeTrue();
  });

  it('stops handling touch once disposed', async () => {
    const scrollLines = spyOn(Terminal.prototype, 'scrollLines');
    const t = await mounted();
    el.dispatchEvent(touch(el, 'touchstart', 300));
    t.dispose();

    scrollLines.calls.reset();
    el.dispatchEvent(touch(el, 'touchmove', 100));
    expect(scrollLines).not.toHaveBeenCalled();
  });

  // --- the state ladder ----------------------------------------------------

  it('is loading before the first frame lands', async () => {
    const read = deferred<unknown>();
    ws.request.and.callFake((_host: string, method: string) =>
      method === 'pane.read' ? read.promise : Promise.resolve({})
    );

    const t = build();
    t.attach(el);
    void t.load('laptop', 'pane-1');
    await flushMicrotasks();

    expect(t.state()).toBe('loading');
    read.resolve(readResult('hello'));
    await flushMicrotasks();
  });

  it('is live once content has landed and the subscription is confirmed', async () => {
    const t = await mounted();
    expect(t.state()).toBe('live');
  });

  it('stays live across the subscribe round-trip, never flashing stale', async () => {
    const sub = deferred<{ subscription_id: string }>();
    ws.request.and.callFake((_host: string, method: string) => {
      if (method === 'pane.read') {
        return Promise.resolve(readResult('hello'));
      }
      if (method === 'pane.subscribe_output') {
        return sub.promise;
      }
      return Promise.resolve({});
    });

    const t = build();
    t.attach(el);
    void t.load('laptop', 'pane-1');
    await flushMicrotasks();

    // The read has landed and the subscription has not been confirmed yet.
    // `loading` deliberately stays true across that gap, which is what stops
    // a one-frame `stale` flash here.
    expect(t.state()).toBe('live');

    sub.resolve({ subscription_id: 'sub-1' });
    await flushMicrotasks();
    expect(t.state()).toBe('live');
  });

  it('is empty when the read succeeds with no bytes', async () => {
    ws.request.and.callFake((_host: string, method: string) => {
      if (method === 'pane.read') {
        return Promise.resolve(readResult(''));
      }
      if (method === 'pane.subscribe_output') {
        return Promise.resolve({ subscription_id: 'sub-1' });
      }
      return Promise.resolve({});
    });

    const t = await mounted();

    expect(t.state()).toBe('empty');
  });

  it("is failed, with herdr's own wording, when the read rejects with nothing on screen", async () => {
    ws.request.and.callFake((_host: string, method: string) =>
      method === 'pane.read' ? Promise.reject(new Error('herdr said no')) : Promise.resolve({})
    );

    const t = await mounted();

    expect(t.state()).toBe('failed');
    // Quoted verbatim, never rewritten.
    expect(t.failureReason()).toBe('herdr said no');
  });

  it('retries the same pane from the failed state', async () => {
    let attempt = 0;
    ws.request.and.callFake((_host: string, method: string) => {
      switch (method) {
        case 'pane.read':
          attempt += 1;
          return attempt === 1
            ? Promise.reject(new Error('herdr said no'))
            : Promise.resolve(readResult('back', 2));
        case 'pane.subscribe_output':
          return Promise.resolve({ subscription_id: 'sub-1' });
        default:
          return Promise.resolve({});
      }
    });

    const t = await mounted();
    expect(t.state()).toBe('failed');

    t.retry();
    await flushMicrotasks();

    expect(attempt).toBe(2);
    expect(t.state()).toBe('live');
    expect(t.failureReason()).toBe('');
  });

  it('marks a disconnect stale and keeps the already-rendered content', async () => {
    const writeSpy = spyOn(Terminal.prototype, 'write');
    const resetSpy = spyOn(Terminal.prototype, 'reset');
    const t = await mounted();
    writeSpy.calls.reset();
    resetSpy.calls.reset();

    ws.connected.set(false);

    expect(t.state()).toBe('stale');
    // Content survives: nothing is cleared and nothing is rewritten.
    expect(resetSpy).not.toHaveBeenCalled();
    expect(writeSpy).not.toHaveBeenCalled();
  });

  it('reports a lost subscription as stale rather than a fresh load', async () => {
    ws.request.and.callFake((_host: string, method: string) => {
      if (method === 'pane.read') {
        return Promise.resolve(readResult('hello'));
      }
      if (method === 'pane.subscribe_output') {
        return Promise.reject(new Error('tier-1 bridge'));
      }
      return Promise.resolve({});
    });

    const t = await mounted();

    expect(t.state()).toBe('stale');
    expect(toast.push).toHaveBeenCalled();
    expect((toast.push.calls.mostRecent().args[0] as { message: string }).message).toContain(
      COPY.toast.liveUpdatesUnavailable.split('{')[0]
    );
  });
});
