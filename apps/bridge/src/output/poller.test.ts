import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReadFormat, ReadSource, WsEvent } from '@kanhrd/schema';
import { OutputPoller, type PaneReader, type PaneReaderSource } from './poller.js';

/** Fake `pane.read` that resolves however the test script tells it to, and counts in-flight calls. */
class FakeHost implements PaneReader {
  calls = 0;
  lastParams: { pane_id: string; source?: ReadSource; format?: ReadFormat; lines?: number } | null =
    null;
  inFlightCount = 0;
  maxInFlight = 0;
  private script: Array<{ revision: number; content: string }> = [];
  private resolveNext: (() => void) | null = null;
  private gate = false;

  /** When gated, `paneRead` doesn't resolve until `release()` is called — used to test one-in-flight-at-a-time. */
  enableGate(): void {
    this.gate = true;
  }

  release(): void {
    this.resolveNext?.();
    this.resolveNext = null;
  }

  queue(revision: number, content: string): void {
    this.script.push({ revision, content });
  }

  async paneRead(params: {
    pane_id: string;
    source?: ReadSource;
    format?: ReadFormat;
    lines?: number;
  }): Promise<{
    content: string;
    revision: number;
    truncated: boolean;
    format: 'ansi';
    source: 'visible';
  }> {
    this.lastParams = params;
    this.calls++;
    this.inFlightCount++;
    this.maxInFlight = Math.max(this.maxInFlight, this.inFlightCount);
    if (this.gate) {
      await new Promise<void>((resolve) => {
        this.resolveNext = resolve;
      });
    }
    this.inFlightCount--;
    const next = this.script.shift() ?? { revision: 0, content: '' };
    return {
      content: next.content,
      revision: next.revision,
      truncated: false,
      format: 'ansi',
      source: 'visible',
    };
  }
}

function sourceOf(host: FakeHost): PaneReaderSource {
  return { get: (name) => (name === 'local' ? host : undefined) };
}

describe('OutputPoller', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('polls at source `recent` by default, so live snapshots carry scrollback', async () => {
    // `pane.output` is a full snapshot the client paints over the whole
    // terminal (ADR-0004). Polling `visible` behind a `recent` initial read
    // deletes the pane's scrollback on the first tick — the scrollback bug.
    const host = new FakeHost();
    host.queue(1, 'a');

    const poller = new OutputPoller(sourceOf(host), 10);
    poller.subscribe('local', 'p1', {}, 'conn-1', () => {});
    await vi.advanceTimersByTimeAsync(10);

    expect(host.lastParams).toEqual({ pane_id: 'p1', source: 'recent', format: 'ansi' });
  });

  it('still honours an explicitly requested source and format', async () => {
    const host = new FakeHost();
    host.queue(1, 'a');

    const poller = new OutputPoller(sourceOf(host), 10);
    poller.subscribe('local', 'p1', { source: 'visible', format: 'text' }, 'conn-1', () => {});
    await vi.advanceTimersByTimeAsync(10);

    expect(host.lastParams).toEqual({ pane_id: 'p1', source: 'visible', format: 'text' });
  });

  it('forwards a requested depth to every poll, so the stream is as deep as the first paint', async () => {
    // Without `lines` herdr answers at its 80-line default, which cuts a
    // deeper first `pane.read` back to 80 lines on the first push — the
    // same hazard as polling a narrower `source`.
    const host = new FakeHost();
    host.queue(1, 'a');
    host.queue(2, 'b');

    const poller = new OutputPoller(sourceOf(host), 10);
    poller.subscribe('local', 'p1', { lines: 500 }, 'conn-1', () => {});
    await vi.advanceTimersByTimeAsync(10);
    expect(host.lastParams).toEqual({
      pane_id: 'p1',
      source: 'recent',
      format: 'ansi',
      lines: 500,
    });
    await vi.advanceTimersByTimeAsync(10);
    expect(host.lastParams).toEqual({
      pane_id: 'p1',
      source: 'recent',
      format: 'ansi',
      lines: 500,
    });
  });

  it('emits pane.output only when the revision advances (dedup)', async () => {
    const host = new FakeHost();
    host.queue(1, 'a');
    host.queue(1, 'a'); // same revision — no event
    host.queue(2, 'b'); // advanced — event

    const events: WsEvent<'pane.output'>[] = [];
    const poller = new OutputPoller(sourceOf(host), 10);
    poller.subscribe('local', 'p1', {}, 'conn-1', (e) => events.push(e));

    for (let i = 0; i < 3; i++) {
      await vi.advanceTimersByTimeAsync(10);
    }

    expect(events.map((e) => e.payload.revision)).toEqual([1, 2]);
    expect(events[0]?.payload.content).toBe('a');
    expect(events[1]?.payload.content).toBe('b');
  });

  it('skips a tick instead of queueing when the previous poll is still in flight', async () => {
    const host = new FakeHost();
    host.enableGate();
    host.queue(1, 'a');

    const poller = new OutputPoller(sourceOf(host), 10);
    poller.subscribe('local', 'p1', {}, 'conn-1', () => {});

    // First tick starts a poll and never resolves (gated). Advance well past
    // several intervals — no new poll should start while one is in flight.
    await vi.advanceTimersByTimeAsync(50);
    expect(host.calls).toBe(1);

    host.release();
    await vi.advanceTimersByTimeAsync(0);
    expect(host.maxInFlight).toBe(1);
  });

  it('shares one poll loop across multiple subscribers to the same (host, pane_id)', async () => {
    const host = new FakeHost();
    host.queue(1, 'a');

    const poller = new OutputPoller(sourceOf(host), 10);
    const eventsA: WsEvent<'pane.output'>[] = [];
    const eventsB: WsEvent<'pane.output'>[] = [];
    const subA = poller.subscribe('local', 'p1', {}, 'conn-1', (e) => eventsA.push(e));
    const subB = poller.subscribe('local', 'p1', {}, 'conn-2', (e) => eventsB.push(e));

    await vi.advanceTimersByTimeAsync(10);

    expect(host.calls).toBe(1); // one shared poll, not two
    expect(eventsA).toHaveLength(1);
    expect(eventsB).toHaveLength(1);
    expect(subA).not.toBe(subB);
    expect(eventsA[0]?.payload.subscription_id).toBe(subA);
    expect(eventsB[0]?.payload.subscription_id).toBe(subB);
  });

  it('stops the poll loop when the last subscriber unsubscribes', async () => {
    const host = new FakeHost();
    host.queue(1, 'a');

    const poller = new OutputPoller(sourceOf(host), 10);
    const subId = poller.subscribe('local', 'p1', {}, 'conn-1', () => {});
    await vi.advanceTimersByTimeAsync(10);
    expect(host.calls).toBe(1);

    poller.unsubscribe(subId);
    await vi.advanceTimersByTimeAsync(50);
    expect(host.calls).toBe(1); // no further polls after last subscriber leaves
  });

  it('keeps the loop alive if one of two subscribers unsubscribes, and stops when both leave', async () => {
    const host = new FakeHost();
    for (let i = 1; i <= 5; i++) host.queue(i, `v${i}`);

    const poller = new OutputPoller(sourceOf(host), 10);
    const subA = poller.subscribe('local', 'p1', {}, 'conn-1', () => {});
    const subB = poller.subscribe('local', 'p1', {}, 'conn-2', () => {});
    await vi.advanceTimersByTimeAsync(10);
    expect(host.calls).toBe(1);

    poller.unsubscribe(subA);
    await vi.advanceTimersByTimeAsync(10);
    expect(host.calls).toBe(2); // still polling for subB

    poller.unsubscribe(subB);
    await vi.advanceTimersByTimeAsync(30);
    expect(host.calls).toBe(2); // stopped — no subscribers left
  });

  it('falls back to content-hash dedup when herdr hardcodes revision: 0 (herdr panes.rs:1524)', async () => {
    const host = new FakeHost();
    host.queue(0, 'frame-a');
    host.queue(0, 'frame-b'); // same revision as before, different content — must still push
    host.queue(0, 'frame-b'); // same revision AND same content — must not push again

    const events: WsEvent<'pane.output'>[] = [];
    const poller = new OutputPoller(sourceOf(host), 10);
    poller.subscribe('local', 'p1', {}, 'conn-1', (e) => events.push(e));

    for (let i = 0; i < 3; i++) {
      await vi.advanceTimersByTimeAsync(10);
    }

    expect(events.map((e) => e.payload.content)).toEqual(['frame-a', 'frame-b']);
    expect(events.every((e) => e.payload.revision === 0)).toBe(true);
  });

  it("dropConnection removes only that connection's subscriptions and stops empty loops", async () => {
    const host = new FakeHost();
    for (let i = 1; i <= 5; i++) host.queue(i, `v${i}`);

    const poller = new OutputPoller(sourceOf(host), 10);
    const eventsA: WsEvent<'pane.output'>[] = [];
    const eventsB: WsEvent<'pane.output'>[] = [];
    poller.subscribe('local', 'p1', {}, 'conn-1', (e) => eventsA.push(e));
    poller.subscribe('local', 'p1', {}, 'conn-2', (e) => eventsB.push(e));
    await vi.advanceTimersByTimeAsync(10);
    expect(eventsA).toHaveLength(1);
    expect(eventsB).toHaveLength(1);

    poller.dropConnection('conn-1');
    await vi.advanceTimersByTimeAsync(10);
    expect(eventsA).toHaveLength(1); // conn-1 got no more events
    expect(eventsB).toHaveLength(2); // conn-2 still subscribed

    poller.dropConnection('conn-2');
    const callsAfterBothDropped = host.calls;
    await vi.advanceTimersByTimeAsync(30);
    expect(host.calls).toBe(callsAfterBothDropped); // loop stopped
  });
});
