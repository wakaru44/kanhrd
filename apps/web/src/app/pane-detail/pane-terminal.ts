import { Signal, computed, signal, untracked } from '@angular/core';
import { createWatch } from '@angular/core/primitives/signals';
import type { Watch } from '@angular/core/primitives/signals';
import { Subscription, filter } from 'rxjs';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import type { BridgeEventPayload, WsEvent } from '@kanhrd/schema';
import { WsClient } from '../state/ws-client';
import { TerminalThemeService } from '../state/terminal-theme.service';
import { TerminalFontSizeService } from '../state/terminal-font-size.service';
import { ToastService } from '../state/toast.service';
import { COPY, fill } from '../shared/copy';
import { classifyInput } from './key-mapping';

/**
 * xterm.js takes a font *string*, not a CSS custom property, so the
 * `--font-mono` role from docs/DESIGN-SYSTEM.md is transcribed here. Keep
 * this stack in step with `--font-mono` in shared/typography.scss.
 */
const XTERM_FONT_FAMILY =
  '"JetBrains Mono", ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace';

/**
 * The reliability states the *terminal itself* can be in. They are mutually
 * exclusive and none of them is faked — see docs/UX-GUIDELINES.md
 * ("Reliability states tell the truth"). `stale` never blanks the terminal:
 * whatever already rendered stays on screen underneath.
 *
 * Host connectivity is deliberately *not* in this ladder. Whether the pane's
 * host is in view is the view's knowledge, not the terminal's, so the
 * `unavailable` overlay is applied by `PaneDetail` on top of this state.
 */
export type PaneTerminalState = 'loading' | 'failed' | 'stale' | 'empty' | 'live';

/**
 * Everything `PaneTerminal` needs from the app. Passed in, never injected,
 * and narrowed to the members actually used so a test can hand over plain
 * objects instead of standing up the real services.
 */
export interface PaneTerminalDeps {
  readonly ws: Pick<WsClient, 'connected' | 'events$' | 'request'>;
  readonly terminalTheme: Pick<TerminalThemeService, 'theme'>;
  readonly terminalFontSize: Pick<TerminalFontSizeService, 'size'>;
  readonly toast: Pick<ToastService, 'push'>;
}

/**
 * The whole tier-2 terminal: an xterm.js instance fed by `pane.read` +
 * `pane.subscribe_output`, with input relayed via `pane.send_text` /
 * `pane.send_keys`. See CONTRACT-TIER2.md section 6 — `pane.resize` never
 * succeeds in this tier, so window/container resizing is a pure client-side
 * (`FitAddon`) cosmetic concern with no wire call.
 *
 * A plain class on purpose: no `@Injectable`, no component, no DI. Its
 * collaborators arrive through the constructor, so it can be exercised with
 * a fake `WsClient` and a detached `<div>` — no TestBed, no fixture. It does
 * hold Angular signals, which work fine outside an injection context.
 *
 * The surface is small (`attach` / `load` / `retry` / `send` / `dispose`
 * plus four readonly signals) and everything else — the fit convergence
 * loop, the touch scroll engine, snapshot painting, the send queue, the
 * subscription lifecycle — is private to it.
 */
export class PaneTerminal {
  private readonly ws: PaneTerminalDeps['ws'];
  private readonly terminalTheme: PaneTerminalDeps['terminalTheme'];
  private readonly terminalFontSize: PaneTerminalDeps['terminalFontSize'];
  private readonly toast: PaneTerminalDeps['toast'];

  constructor(deps: PaneTerminalDeps) {
    this.ws = deps.ws;
    this.terminalTheme = deps.terminalTheme;
    this.terminalFontSize = deps.terminalFontSize;
    this.toast = deps.toast;
  }

  // --- public view state ------------------------------------------------

  private readonly revisionSignal = signal<number | null>(null);
  private readonly lastPollAtSignal = signal<number | null>(null);
  /** True from the moment a `pane.read` request goes out until its first content lands (or fails). */
  private readonly loading = signal(false);
  /** Set when a `pane.read` rejects. Cleared on the next attempt. */
  private readonly failure = signal<string | null>(null);
  /** True once a read or an output frame has landed for the current pane, whether or not it carried any bytes. */
  private readonly frameReceived = signal(false);
  /** True while the terminal is showing content the user can read. A disconnect must never flip this back to false. */
  private readonly hasContent = signal(false);
  /** True while a live `pane.subscribe_output` is confirmed for the pane in view. */
  private readonly subscribed = signal(false);

  /** Revision id of the most recent frame, from `pane.read`/`pane.output`. */
  readonly revision: Signal<number | null> = this.revisionSignal.asReadonly();
  /** Client-observed wall clock of the most recent frame. Never presented as server time. */
  readonly lastPollAt: Signal<number | null> = this.lastPollAtSignal.asReadonly();
  /** herdr's own wording for the failed read, quoted verbatim and never rewritten. */
  readonly failureReason: Signal<string> = computed(() => this.failure() ?? '');

  /**
   * The single source of truth for what the terminal area shows. Order
   * matters: a failure only wins while there is nothing to read, and content
   * that already rendered is marked stale rather than thrown away.
   */
  readonly state: Signal<PaneTerminalState> = computed<PaneTerminalState>(() => {
    if (this.hasContent()) {
      const settled = !this.loading();
      const lost = !this.ws.connected() || (settled && !this.subscribed());
      return lost ? 'stale' : 'live';
    }
    if (this.failure() !== null) {
      return 'failed';
    }
    if (this.loading() || !this.frameReceived()) {
      return 'loading';
    }
    return 'empty';
  });

  // --- terminal + DOM ownership ----------------------------------------

  private el: HTMLElement | null = null;
  private term: Terminal | null = null;
  private fitAddon: FitAddon | null = null;
  private outputEventsSub: Subscription | null = null;
  private themeWatch: Watch | null = null;
  private fontSizeWatch: Watch | null = null;

  private subscriptionId: string | null = null;
  private subscriptionHost: string | null = null;

  /** The pane currently in view. Every in-flight response is checked against it. */
  private currentHost = '';
  private currentId = '';

  /**
   * The last full snapshot written for the pane in view, so the next one
   * can be recognised as an append instead of repainted from scratch. Cleared
   * on every pane load — a snapshot of one pane is never a prefix of another's.
   */
  private lastSnapshot = '';

  /**
   * Builds the xterm instance into `el` and claims everything that hangs off
   * it: the fit/resize convergence loop, the touch scroll engine, the input
   * pipe and the `pane.output` stream. Call once; `dispose()` undoes it.
   */
  attach(el: HTMLElement): void {
    const term = new Terminal({
      theme: this.terminalTheme.theme(),
      fontFamily: XTERM_FONT_FAMILY,
      fontSize: this.terminalFontSize.size(),
      convertEol: true,
      scrollback: 5000,
    });
    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(el);
    fitAddon.fit();
    term.onData((data) => this.handleInput(data));

    this.el = el;
    this.term = term;
    this.fitAddon = fitAddon;
    this.resizeObserver = new ResizeObserver(() => this.fitToContainer());
    this.resizeObserver.observe(el);

    el.addEventListener('touchstart', this.onTouchStart, { passive: true });
    el.addEventListener('touchmove', this.onTouchMove, { passive: false });
    el.addEventListener('touchend', this.onTouchEnd, { passive: true });
    el.addEventListener('touchcancel', this.onTouchEnd, { passive: true });

    this.outputEventsSub = this.ws.events$
      .pipe(filter((evt): evt is WsEvent<'pane.output'> => evt.event === 'pane.output'))
      .subscribe((evt) => this.handleOutputEvent(evt));

    // Swaps the live terminal's colors immediately when the terminal theme
    // setting changes (Settings > Terminal) — xterm.js takes its own theme
    // object and does not read CSS custom properties.
    this.themeWatch = this.watch(() => {
      const theme = this.terminalTheme.theme();
      untracked(() => {
        if (this.term) {
          this.term.options.theme = theme;
        }
      });
    });

    // The theme watch's sibling, with one extra obligation: a colour change
    // leaves cell geometry alone, a size change does not. The same pixel box
    // now holds a different number of cells, so without a refit `cols`/`rows`
    // keep their old values and the terminal either renders into a fraction
    // of its box or overflows a container that is `overflow: hidden` — with
    // the prompt clipped out of reach. The `ResizeObserver` cannot cover
    // this: it watches the *container*, whose box does not change when only
    // the cell inside it does, so no callback fires. Order matters — the
    // option is assigned first so xterm has re-measured the cell before
    // `fit()` divides the box by it.
    this.fontSizeWatch = this.watch(() => {
      const fontSize = this.terminalFontSize.size();
      untracked(() => {
        if (this.term) {
          this.term.options.fontSize = fontSize;
          this.fitToContainer();
        }
      });
    });
  }

  /**
   * A signal reaction without an injection context.
   *
   * `effect()` is unavailable here by design: this class takes no DI, so
   * there is no `Injector` to schedule against. `createWatch` is the same
   * primitive `effect()` is built on, scheduled on a microtask — Angular
   * refuses a watch run from inside the notification itself, and a
   * microtask keeps the reaction as prompt as the framework's own effects
   * without needing one.
   */
  private watch(fn: () => void): Watch {
    const watcher = createWatch(fn, (w) => queueMicrotask(() => w.run()), false);
    watcher.run(); // first pass, outside any notification
    return watcher;
  }

  /**
   * Points the terminal at a pane: reset, `pane.read`, then
   * `pane.subscribe_output`. Safe to call again for the same or a different
   * pane — the previous subscription is torn down first and any response
   * that lands after the pane has moved on is discarded.
   */
  async load(host: string, id: string): Promise<void> {
    if (!this.term) {
      return;
    }
    this.currentHost = host;
    this.currentId = id;
    this.teardownSubscription();
    this.term.reset();
    this.lastSnapshot = '';
    this.frameReceived.set(false);
    this.hasContent.set(false);
    this.failure.set(null);
    this.loading.set(true);
    try {
      const result = await this.ws.request(host, 'pane.read', {
        pane_id: id,
        format: 'ansi',
        source: 'recent',
      });
      if (this.isStale(host, id)) {
        return; // the pane moved on again while this request was in flight
      }
      if (result) {
        this.lastSnapshot = result.content;
        this.term.write(result.content);
        this.revisionSignal.set(result.revision);
        this.lastPollAtSignal.set(Date.now());
        this.frameReceived.set(true);
        this.hasContent.set(result.content.length > 0);
      }
      // `loading` stays true across the subscribe round-trip on purpose:
      // it suppresses a one-frame `stale` flash between the read landing
      // and the subscription being confirmed.
      try {
        const sub = await this.ws.request(host, 'pane.subscribe_output', {
          pane_id: id,
          // The same request the initial read above makes. `pane.output` is a
          // full snapshot painted over the whole terminal, so a live stream at
          // a narrower source than the first paint deletes this pane's
          // scrollback on the first poll.
          source: 'recent',
          format: 'ansi',
        });
        if (this.isStale(host, id)) {
          if (sub) {
            void this.ws.request(host, 'pane.unsubscribe_output', {
              subscription_id: sub.subscription_id,
            });
          }
          return;
        }
        if (sub) {
          this.subscriptionId = sub.subscription_id;
          this.subscriptionHost = host;
          this.subscribed.set(true);
        }
      } catch (err) {
        this.toast.push({
          level: 'error',
          message: fill(COPY.toast.liveUpdatesUnavailable, {
            reason: err instanceof Error ? err.message : String(err),
          }),
        });
      }
    } catch (err) {
      // Bridge unreachable, tier-1 bridge, or connection dropped mid-load —
      // per the runtime/client boundary guardrail this is a client-local
      // outcome: leave the terminal showing whatever it already has rather
      // than tearing down the view or the WS connection. With content on
      // screen this reads as `stale`; with nothing on screen, as `failed`.
      this.failure.set(err instanceof Error ? err.message : String(err));
    } finally {
      this.loading.set(false);
    }
  }

  /** Failed state's only action: re-run the same load for the pane in view. */
  retry(): void {
    if (!this.currentHost || !this.currentId) {
      return;
    }
    void this.load(this.currentHost, this.currentId);
  }

  /**
   * Sends input to the pane exactly as a keystroke typed into the terminal
   * would be sent — same classification, same ordered queue. Public so a
   * control outside the terminal surface (a top bar's Enter/Escape buttons,
   * say) shares one path with `onData` rather than growing a second one.
   */
  send(data: string): void {
    this.handleInput(data);
  }

  /** Releases the terminal, the DOM listeners, the watches and the subscription. */
  dispose(): void {
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    this.el?.removeEventListener('touchstart', this.onTouchStart);
    this.el?.removeEventListener('touchmove', this.onTouchMove);
    this.el?.removeEventListener('touchend', this.onTouchEnd);
    this.el?.removeEventListener('touchcancel', this.onTouchEnd);
    this.outputEventsSub?.unsubscribe();
    this.outputEventsSub = null;
    this.themeWatch?.destroy();
    this.themeWatch = null;
    this.fontSizeWatch?.destroy();
    this.fontSizeWatch = null;
    this.teardownSubscription();
    this.term?.dispose();
    this.term = null;
    this.fitAddon = null;
    this.el = null;
  }

  // --- wire plumbing ----------------------------------------------------

  private isStale(host: string, id: string): boolean {
    return this.currentHost !== host || this.currentId !== id;
  }

  private teardownSubscription(): void {
    if (this.subscriptionId && this.subscriptionHost) {
      void this.ws.request(this.subscriptionHost, 'pane.unsubscribe_output', {
        subscription_id: this.subscriptionId,
      });
    }
    this.subscriptionId = null;
    this.subscriptionHost = null;
    this.subscribed.set(false);
  }

  private handleOutputEvent(evt: WsEvent<'pane.output'>): void {
    if (!this.term) {
      return;
    }
    const payload = evt.payload as BridgeEventPayload['pane.output'];
    if (payload.subscription_id !== this.subscriptionId) {
      return;
    }
    this.paint(this.term, payload.content);
    this.revisionSignal.set(payload.revision);
    this.lastPollAtSignal.set(Date.now());
    this.frameReceived.set(true);
    this.hasContent.set(payload.content.length > 0);
  }

  /**
   * Renders a full `pane.output` snapshot without destroying what the reader
   * is looking at.
   *
   * `pane.output.content` is always the pane's whole current content, never a
   * delta (ADR-0004), and the prescribed handling is `reset(); write()`. That
   * is correct and it is also the reason a reader cannot hold their place: it
   * empties the scrollback buffer and drops the viewport to the bottom, up to
   * once per bridge poll interval.
   *
   * Two cases, in order:
   *
   * - **Append.** The new snapshot starts with the previous one — a program
   *   printing more lines, which is nearly every snapshot. Only the suffix is
   *   written. No reset, no repaint of what is already on screen, and xterm.js
   *   leaves a scrolled-up viewport where it is when rows arrive at the bottom.
   * - **Redraw.** Anything else (vim, htop, `clear`, a reflow). `reset()` +
   *   full write, with the viewport's absolute line offset captured before and
   *   restored after — except when the reader was already at the bottom, where
   *   following the tail is the point.
   */
  private paint(term: Terminal, content: string): void {
    const previous = this.lastSnapshot;
    this.lastSnapshot = content;
    if (previous.length > 0 && content.length >= previous.length && content.startsWith(previous)) {
      const appended = content.slice(previous.length);
      if (appended.length > 0) {
        term.write(appended);
      }
      return;
    }
    const buffer = term.buffer.active;
    // `baseY` is the top line of the last screenful, `viewportY` the top line
    // actually shown — equal means "pinned to the bottom".
    const anchoredAt = buffer.viewportY;
    const wasAtBottom = buffer.viewportY >= buffer.baseY;
    term.reset();
    term.write(content, () => {
      if (!wasAtBottom) {
        term.scrollToLine(anchoredAt);
      }
    });
  }

  // --- input ------------------------------------------------------------

  /**
   * Serializes `pane.send_text`/`pane.send_keys` calls: the browser only
   * ever has one send-shaped request in flight for this pane, so keystrokes
   * typed faster than the WS round-trip can't race each other out of order.
   * Combined with the bridge's own per-pane FIFO queue, this guarantees
   * end-to-end keystroke order. A failed send is logged and dropped, not
   * retried — it must not stall the queue behind it.
   */
  private sendChain: Promise<unknown> = Promise.resolve();

  private enqueueSend(fn: () => Promise<unknown>): void {
    this.sendChain = this.sendChain
      .catch(() => undefined)
      .then(fn)
      .catch((err: unknown) => {
        console.warn('pane-detail: send failed', err);
      });
  }

  private handleInput(data: string): void {
    const host = this.currentHost;
    const id = this.currentId;
    if (!host || !id) {
      return;
    }
    const action = classifyInput(data);
    if (action.kind === 'keys' && action.keys) {
      const keys = action.keys;
      this.enqueueSend(() => this.ws.request(host, 'pane.send_keys', { pane_id: id, keys }));
      return;
    }
    if (action.unmapped) {
      // eslint-disable-next-line no-console -- best-effort fallback, worth surfacing during development
      console.warn(
        `pane-detail: unmapped control bytes in input, sending as text: ${JSON.stringify(data)}`
      );
    }
    const text = action.text ?? '';
    this.enqueueSend(() => this.ws.request(host, 'pane.send_text', { pane_id: id, text }));
  }

  // --- geometry ---------------------------------------------------------

  /**
   * The terminal is refit from the *container's* box, not from
   * `window.resize`.
   *
   * A window-resize listener is both too narrow and mistimed. Too narrow:
   * the container also changes size without the window doing so — the
   * header's meta strip rewrapping, the rail drawer opening. Mistimed: one
   * `fit()` per resize event fits against the box as it is at that
   * instant, and xterm's own re-render reflows the surrounding flex column
   * afterwards, so the fitted row count can end up taller than the box it
   * was fitted into. `.terminal-container` is `overflow: hidden`, so those
   * extra rows are clipped and unreachable — the prompt included — and
   * nothing ever refits to recover them. A `ResizeObserver` fires again on
   * that second reflow and converges.
   */
  private resizeObserver: ResizeObserver | null = null;

  private fitToContainer(): void {
    const el = this.el;
    // fit() divides by the cell size; a detached or zero-height container
    // yields NaN rows and corrupts the buffer.
    if (!el || el.clientHeight === 0 || el.clientWidth === 0) {
      return;
    }
    this.fitAddon?.fit();
    // `fit()` divides the available height by the renderer's *cached* cell
    // size. A resize can change that measurement, so the first fit can
    // land on a row count that no longer fits once the renderer has
    // re-measured — and the container clips the difference. Fitting once
    // more on the next frame, with the fresh cell size, converges. A fit
    // that computes the same dimensions is a no-op, so this settles rather
    // than looping.
    requestAnimationFrame(() => {
      if (this.fitAddon && el.clientHeight > 0 && el.clientWidth > 0) {
        this.fitAddon.fit();
      }
    });
  }

  // --- the terminal owns the vertical touch axis ------------------------
  //
  // xterm 6 does not scroll on touch. Its `.xterm-viewport` is decorative
  // (scrollHeight === clientHeight); the real scrolling is done by
  // `.xterm-scrollable-element`, which transforms its content and listens
  // only for wheel and scrollbar drags. The vendored vscode `Gesture`
  // helper is present in the bundle but `Gesture.addTarget` is never
  // called on it, so a finger drag over the terminal moves nothing.
  //
  // With no scroller anywhere in the chain (`.terminal-container`,
  // `.pane-detail` and the shell's `main` are all unscrollable at phone
  // size) the browser hands that unclaimed vertical gesture to the root
  // scroller, and Chrome on a phone reads a downward one as
  // pull-to-refresh. Both halves of the reported bug — history that cannot
  // be reached by touch, and a boundary swipe that reloads the page — are
  // the same missing claim.
  //
  // So: `touch-action: pan-x pinch-zoom` on the container (see
  // pane-detail.scss) tells the browser this element reserves the vertical
  // axis, which stops the page gesture before it starts, and these
  // handlers spend it on `scrollLines` instead. Only `touchmove` is
  // handled — `touchstart`/`touchend` stay untouched so a tap still
  // focuses the terminal and raises the on-screen keyboard.

  private touchAnchorY: number | null = null;
  /** Sub-row leftover, so a slow drag accumulates instead of rounding to nothing. */
  private touchCarryPx = 0;

  private readonly onTouchStart = (event: TouchEvent): void => {
    const touch = event.touches.length === 1 ? event.touches[0] : null;
    this.touchAnchorY = touch ? touch.clientY : null;
    this.touchCarryPx = 0;
  };

  private readonly onTouchMove = (event: TouchEvent): void => {
    const term = this.term;
    const touch = event.touches.length === 1 ? event.touches[0] : null;
    if (!term || !touch || this.touchAnchorY === null) {
      return;
    }
    // Content-following, not scrollbar-following: dragging the finger down
    // pulls older output into view.
    const deltaPx = this.touchAnchorY - touch.clientY + this.touchCarryPx;
    this.touchAnchorY = touch.clientY;
    const rowHeight = this.rowHeightPx();
    if (rowHeight <= 0) {
      return;
    }
    const lines = Math.trunc(deltaPx / rowHeight);
    this.touchCarryPx = deltaPx - lines * rowHeight;
    if (lines !== 0) {
      term.scrollLines(lines);
    }
    // Claimed for the whole gesture, both boundaries included: the leftover
    // of a swipe that runs past the top of the scrollback must not become
    // page overscroll.
    if (event.cancelable) {
      event.preventDefault();
    }
  };

  private readonly onTouchEnd = (): void => {
    this.touchAnchorY = null;
    this.touchCarryPx = 0;
  };

  /** Rendered row height in CSS pixels, measured rather than assumed from the font size. */
  private rowHeightPx(): number {
    const rows = this.term?.rows ?? 0;
    const screen = this.el?.querySelector('.xterm-screen');
    if (!screen || rows <= 0) {
      return 0;
    }
    return screen.getBoundingClientRect().height / rows;
  }
}
