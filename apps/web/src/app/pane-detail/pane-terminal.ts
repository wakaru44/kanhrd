import { Signal, computed, signal } from '@angular/core';
import { Subscription, filter } from 'rxjs';
import { Terminal } from '@xterm/xterm';
import type { ITheme } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import type { BridgeEventPayload, WsEvent } from '@kanhrd/schema';
import { WsClient } from '../state/ws-client';
import { TerminalThemeService } from '../state/terminal-theme.service';
import { TerminalFontSizeService } from '../state/terminal-font-size.service';
import {
  HERDR_READ_LINE_CEILING,
  TerminalScrollbackService,
} from '../state/terminal-scrollback.service';
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
 * `RIS` — the ECMA-48 full reset. Byte-for-byte what `Terminal.reset()` does
 * (xterm routes `ESC c` to the same `fullReset()`), but as data on the write
 * stream instead of an out-of-band call, so it can be delivered atomically
 * with the frame that replaces the screen. See `paint()`.
 */
const RIS = '\x1bc';

/** SGR faint on, and a full SGR reset — the truncation line's only styling. */
const SGR_DIM = '\x1b[2m';
const SGR_RESET = '\x1b[0m';

/** The one `source`/`format` pane detail reads at. `lines` joins them per load. */
const READ_SOURCE = 'recent';
const READ_FORMAT = 'ansi';

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
  readonly terminalScrollback: Pick<TerminalScrollbackService, 'lines'>;
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
 * It owns the terminal's whole lifecycle but does not *watch* the app's
 * settings: reacting to a signal wants `effect()`, `effect()` wants an
 * injection context, and this class deliberately has none. So the reaction
 * lives one level up, in `PaneDetail`, where the injection context is — the
 * component reads the settings signals and calls `applyTheme` /
 * `applyFontSize`. Initial values are still read here, once, in `attach()`:
 * the `Terminal` constructor needs them before any effect has run.
 *
 * The surface is small (`attach` / `load` / `retry` / `send` / `dispose` /
 * `applyTheme` / `applyFontSize` / `applyScrollback` plus four readonly signals) and everything
 * else — the fit convergence loop, the touch scroll engine, snapshot
 * painting, the send queue, the subscription lifecycle — is private to it.
 */
export class PaneTerminal {
  private readonly ws: PaneTerminalDeps['ws'];
  private readonly terminalTheme: PaneTerminalDeps['terminalTheme'];
  private readonly terminalFontSize: PaneTerminalDeps['terminalFontSize'];
  private readonly terminalScrollback: PaneTerminalDeps['terminalScrollback'];
  private readonly toast: PaneTerminalDeps['toast'];

  constructor(deps: PaneTerminalDeps) {
    this.ws = deps.ws;
    this.terminalTheme = deps.terminalTheme;
    this.terminalFontSize = deps.terminalFontSize;
    this.terminalScrollback = deps.terminalScrollback;
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
   * The depth the pane in view was read and subscribed at. Fixed per load,
   * so a setting change is noticed (`applyScrollback`) and the truncation
   * line names the depth that was actually requested.
   */
  private loadedLines = 0;

  /**
   * Whether the snapshot on screen is one herdr cut short. The truncation
   * line is written at the head of the buffer while this holds — see
   * `withNotice()`.
   */
  private truncated = false;

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
  }

  /**
   * Swaps the live terminal's colors. Called by `PaneDetail` whenever the
   * terminal theme setting changes (Settings > Terminal) — xterm.js takes
   * its own theme object and does not read CSS custom properties, so a CSS
   * variable change reaches nothing here.
   */
  applyTheme(theme: ITheme): void {
    if (!this.term) {
      return;
    }
    this.term.options.theme = theme;
  }

  /**
   * `applyTheme`'s sibling, with one extra obligation: a colour change
   * leaves cell geometry alone, a size change does not. The same pixel box
   * now holds a different number of cells, so without a refit `cols`/`rows`
   * keep their old values and the terminal either renders into a fraction
   * of its box or overflows a container that is `overflow: hidden` — with
   * the prompt clipped out of reach. The `ResizeObserver` cannot cover
   * this: it watches the *container*, whose box does not change when only
   * the cell inside it does, so no callback fires. Order matters — the
   * option is assigned first so xterm has re-measured the cell before
   * `fit()` divides the box by it.
   */
  applyFontSize(px: number): void {
    if (!this.term) {
      return;
    }
    this.term.options.fontSize = px;
    this.fitToContainer();
  }

  /**
   * Called by `PaneDetail` whenever the scrollback depth setting changes.
   * Unlike palette and size, depth is part of the request: the pane in view
   * is re-read and re-subscribed at the new depth, so the buffer and the
   * live stream both move with it. A no-op before a pane has loaded, and
   * when the depth is the one the pane was already loaded at.
   */
  applyScrollback(lines: number): void {
    if (!this.term || !this.currentHost || !this.currentId || lines === this.loadedLines) {
      return;
    }
    void this.load(this.currentHost, this.currentId);
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
    this.truncated = false;
    // One read of the setting per load, used by both requests below: the
    // first paint and the live stream must ask for the same depth, or the
    // stream's first push cuts the first paint's history back to its own.
    const lines = this.terminalScrollback.lines();
    this.loadedLines = lines;
    this.frameReceived.set(false);
    this.hasContent.set(false);
    this.failure.set(null);
    this.loading.set(true);
    try {
      const result = await this.ws.request(host, 'pane.read', {
        pane_id: id,
        format: READ_FORMAT,
        source: READ_SOURCE,
        lines,
      });
      if (this.isStale(host, id)) {
        return; // the pane moved on again while this request was in flight
      }
      if (result) {
        this.lastSnapshot = result.content;
        this.truncated = result.truncated;
        this.term.write(this.withNotice(result.content));
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
          // a narrower source — or fewer lines — than the first paint deletes
          // this pane's scrollback on the first poll.
          source: READ_SOURCE,
          format: READ_FORMAT,
          lines,
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

  /** Releases the terminal, the DOM listeners and the subscription. */
  dispose(): void {
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    this.el?.removeEventListener('touchstart', this.onTouchStart);
    this.el?.removeEventListener('touchmove', this.onTouchMove);
    this.el?.removeEventListener('touchend', this.onTouchEnd);
    this.el?.removeEventListener('touchcancel', this.onTouchEnd);
    this.outputEventsSub?.unsubscribe();
    this.outputEventsSub = null;
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
    this.paint(this.term, payload.content, payload.truncated);
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
   * - **Redraw.** Anything else (vim, htop, `clear`, a reflow) — which is
   *   every frame of an agent TUI. The reset and the replacement content go
   *   out as ONE write, with the viewport's absolute line offset captured
   *   before and restored after — except when the reader was already at the
   *   bottom, where following the tail is the point.
   *
   * The redraw path must never call `Terminal.reset()`. `reset()` empties the
   * screen straight away while the replacement content goes through xterm's
   * *asynchronous* write queue, so the terminal renders at least one fully
   * blank frame in between. At the bridge's 150ms poll
   * (`OUTPUT_POLL_INTERVAL_MS`) that is a whole-screen strobe at ~6.5Hz on any
   * pane running a full-screen TUI — measured at exactly one blank rendered
   * frame per `pane.output` event. That is inside the 3-30Hz band WCAG 2.3.1
   * calls a seizure risk, so it is an accessibility defect, not a cosmetic
   * one. `RIS` is the same full reset delivered *inside* the write stream:
   * xterm parses the reset and the new content in one pass and refreshes once,
   * so no blank frame is ever painted. `e2e/terminal-flicker.spec.ts` holds
   * the line.
   *
   * A change in `truncated` always takes the redraw path: the truncation
   * line sits above the snapshot, so gaining or losing it is not an append.
   * Every redraw re-writes the line while the snapshot is still truncated —
   * `RIS` would otherwise wipe it with the rest of the screen.
   */
  private paint(term: Terminal, content: string, truncated: boolean): void {
    const previous = this.lastSnapshot;
    const truncationChanged = truncated !== this.truncated;
    this.lastSnapshot = content;
    this.truncated = truncated;
    if (
      !truncationChanged &&
      previous.length > 0 &&
      content.length >= previous.length &&
      content.startsWith(previous)
    ) {
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
    term.write(RIS + this.withNotice(content), () => {
      if (!wasAtBottom) {
        term.scrollToLine(anchoredAt);
      }
    });
  }

  /**
   * The snapshot as written to the buffer: preceded, when herdr cut it short,
   * by one faint line saying so. A state, not an event — it lives where the
   * missing history would be, not in a toast (docs/UX-GUIDELINES.md).
   *
   * Safe to prepend because herdr's snapshot carries no cursor positioning:
   * one extra leading row shifts every row down by one and overwrites
   * nothing. `lastSnapshot` holds the raw snapshot, never this, so append
   * detection is unaffected. The raise hint is left off at herdr's ceiling,
   * where no setting brings the missing history back.
   */
  private withNotice(content: string): string {
    if (!this.truncated) {
      return content;
    }
    let line = fill(COPY.terminal.truncated, { lines: String(this.loadedLines) });
    if (this.loadedLines < HERDR_READ_LINE_CEILING) {
      line += ` ${COPY.terminal.truncatedRaise}`;
    }
    return `${SGR_DIM}${line}${SGR_RESET}\r\n${content}`;
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
