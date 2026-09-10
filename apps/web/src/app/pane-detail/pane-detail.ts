import {
  AfterViewInit,
  Component,
  ElementRef,
  OnDestroy,
  ViewChild,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from "@angular/core";
import { toSignal } from "@angular/core/rxjs-interop";
import { ActivatedRoute, RouterLink } from "@angular/router";
import { Subscription, filter, map } from "rxjs";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import type { BridgeEventPayload, WsEvent } from "@kanhrd/schema";
import { PanesStore, paneKey } from "../state/panes.store";
import { WsClient } from "../state/ws-client";
import { classifyInput } from "./key-mapping";
import { TerminalThemeService } from "../state/terminal-theme.service";
import { TerminalFontSizeService } from "../state/terminal-font-size.service";
import { ToastService } from "../state/toast.service";
import { ClockTick, formatElapsed } from "../util/clock";
import { COPY, fill } from "../shared/copy";
import { RenameModal } from "../shared/rename-modal";
import { paneTitle } from "../util/pane-title";
import {
  LucideArrowLeft,
  LucidePencil,
  LucideRefreshCw,
  LucideTriangleAlert,
  LucideUnplug,
} from "../shared/icons";
import { BoardReturnService } from "../state/board-return.service";

/**
 * xterm.js takes a font *string*, not a CSS custom property, so the
 * `--font-mono` role from docs/DESIGN-SYSTEM.md is transcribed here. Keep
 * this stack in step with `--font-mono` in shared/typography.scss.
 */
const XTERM_FONT_FAMILY =
  '"JetBrains Mono", ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace';

/**
 * The reliability states this view can be in. They are mutually exclusive
 * and none of them is faked — see docs/UX-GUIDELINES.md ("Reliability
 * states tell the truth"). `stale` and `unavailable` never blank the
 * terminal: whatever already rendered stays on screen underneath.
 */
export type PaneViewState = "loading" | "failed" | "unavailable" | "stale" | "empty" | "live";

/**
 * Tier-2 terminal detail view: an xterm.js terminal fed by `pane.read` +
 * `pane.subscribe_output`, with input relayed via `pane.send_text` /
 * `pane.send_keys`. See CONTRACT-TIER2.md section 6 — `pane.resize` never
 * succeeds in this tier, so window/container resizing is a pure client-side
 * (`FitAddon`) cosmetic concern with no wire call.
 *
 * This component registers **no global keyboard handler**. An unmodified
 * `Escape` or a bare `?` bound at the document would be swallowed away from
 * vim, less, fzf and every other TUI running inside the pane; the visible
 * back control in the header is the escape hatch, and app-level bindings
 * stay with the existing explicit prefix-shortcut mechanism.
 */
@Component({
  selector: "app-pane-detail",
  imports: [
    RouterLink,
    RenameModal,
    LucideArrowLeft,
    LucidePencil,
    LucideRefreshCw,
    LucideTriangleAlert,
    LucideUnplug,
  ],
  templateUrl: "./pane-detail.html",
  styleUrl: "./pane-detail.scss",
})
export class PaneDetail implements AfterViewInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly ws = inject(WsClient);
  private readonly store = inject(PanesStore);
  private readonly terminalTheme = inject(TerminalThemeService);
  private readonly terminalFontSize = inject(TerminalFontSizeService);
  private readonly toast = inject(ToastService);
  protected readonly clock = inject(ClockTick);
  private readonly boardReturn = inject(BoardReturnService);

  protected readonly copy = COPY;

  /**
   * Where "back to the board" goes: the board URL this pane was opened
   * from, so a card opened under a scoped board returns to that scope
   * instead of dumping the user on an unscoped board
   * (docs/UX-GUIDELINES.md, "Focus and terminal input survive navigation").
   * `/` when the pane was reached by a deep link and there is nothing to
   * return to — the board is still the right destination, just not a
   * remembered one.
   *
   * Captured once, at construction: the router tears the board down before
   * it builds this view, so the record is already there, and it must not
   * change under the user while they are looking at the terminal.
   */
  protected readonly backUrl = this.boardReturn.boardUrl();

  /** True from the moment a `pane.read` request goes out until its first content lands (or fails). Drives the `.terminal-loading` overlay. */
  protected readonly loading = signal(false);
  /** Set when a `pane.read` rejects. Cleared on the next attempt. Carries herdr's own wording, quoted verbatim. */
  protected readonly failure = signal<string | null>(null);
  /** True once a read or an output frame has landed for the current pane, whether or not it carried any bytes. */
  private readonly frameReceived = signal(false);
  /** True while the terminal is showing content the user can read. A disconnect must never flip this back to false. */
  private readonly hasContent = signal(false);

  @ViewChild("terminalContainer", { static: true })
  private readonly containerRef!: ElementRef<HTMLDivElement>;

  protected readonly host = toSignal(
    this.route.paramMap.pipe(map((params) => params.get("host") ?? "")),
    { initialValue: "" },
  );
  protected readonly id = toSignal(
    this.route.paramMap.pipe(map((params) => params.get("id") ?? "")),
    { initialValue: "" },
  );

  protected readonly pane = computed(() => this.store.panesSignal().get(paneKey(this.host(), this.id())));

  /**
   * UI-sans title, never the display serif: this is a repeated technical
   * identifier. Same precedence the board card uses (`util/pane-title.ts`),
   * with the route's own id as the fallback for a pane the store has not
   * seen yet.
   */
  protected readonly title = computed(() => {
    const pane = this.pane();
    return pane ? paneTitle(pane) : this.id();
  });

  /** herdr's git provenance for this pane's workspace — the FULL path here, never the card's truncated form. */
  protected readonly project = computed(() => this.pane()?.project ?? null);

  /** Whether `pane.rename` will succeed on this pane's pen. */
  protected readonly paneRenameAvailable = computed(
    () => this.store.capabilitiesSignal().get(this.host())?.paneRename === true,
  );

  protected readonly showRename = signal(false);
  protected readonly statusKey = computed(() => this.pane()?.agent_status ?? "unknown");
  protected readonly statusLabel = computed(() => {
    const key = this.statusKey();
    return key in COPY.status ? COPY.status[key as keyof typeof COPY.status] : COPY.status.unknown;
  });

  /**
   * Whether the pen this pane lives on is currently in view. An unknown
   * host is *not* reported as gone — only a host the bridge has told us
   * about and marked disconnected.
   */
  private readonly penInSight = computed(() => {
    const entry = this.store.hostsSignal().find((h) => h.name === this.host());
    return entry ? entry.connected : true;
  });

  private term: Terminal | null = null;
  private fitAddon: FitAddon | null = null;
  private subscriptionId: string | null = null;
  private subscriptionHost: string | null = null;
  private outputEventsSub: Subscription | null = null;
  /**
   * The last full snapshot written for the pane in the route, so the next one
   * can be recognised as an append instead of repainted from scratch. Cleared
   * on every pane load — a snapshot of one pane is never a prefix of another's.
   */
  private lastSnapshot = "";
  /** Flips true once the terminal container exists, so the load effect below has something to write into. */
  private readonly viewReady = signal(false);

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
        console.warn("pane-detail: send failed", err);
      });
  }
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
    const screen = this.containerRef?.nativeElement.querySelector(".xterm-screen");
    if (!screen || rows <= 0) {
      return 0;
    }
    return screen.getBoundingClientRect().height / rows;
  }

  private fitToContainer(): void {
    const el = this.containerRef?.nativeElement;
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

  // --- meta strip: revision count, last-poll timestamp, subscription
  // health. All from data already on the tier-2 wire surface (`pane.read`'s
  // and `pane.output`'s `revision` — see BridgeMethodResult/BridgeEventPayload
  // in wire.ts) — no bridge change needed. Elapsed is observed client time,
  // never presented as a server-authoritative duration.
  protected readonly revision = signal<number | null>(null);
  protected readonly lastPollAt = signal<number | null>(null);
  protected readonly subscribed = signal(false);

  /**
   * Data readouts, not product copy (see the header comment in
   * `shared/copy.ts`): a revision id and an observed elapsed duration.
   * They are formatted here rather than in the template so the template
   * itself carries no free-standing string.
   */
  protected readonly revisionLabel = computed(() => {
    const rev = this.revision();
    return rev === null ? "rev —" : `rev ${rev}`;
  });
  protected readonly lastPollLabel = computed(() => {
    const at = this.lastPollAt();
    if (at === null) {
      return "updated —";
    }
    return `updated ${formatElapsed(this.clock.now() - at)} ago`;
  });

  /** herdr's own wording for the failed read, quoted verbatim and never rewritten. */
  protected readonly failureReason = computed(() => this.failure() ?? "");

  /**
   * The single source of truth for what the terminal area shows. Order
   * matters: a disconnected pen outranks everything, a failure only wins
   * while there is nothing to read, and content that already rendered is
   * marked stale rather than thrown away.
   */
  protected readonly viewState = computed<PaneViewState>(() => {
    if (!this.penInSight()) {
      return "unavailable";
    }
    if (this.hasContent()) {
      const settled = !this.loading();
      const lost = !this.ws.connected() || (settled && !this.subscribed());
      return lost ? "stale" : "live";
    }
    if (this.failure() !== null) {
      return "failed";
    }
    if (this.loading() || !this.frameReceived()) {
      return "loading";
    }
    return "empty";
  });

  constructor() {
    // Swaps the live terminal's colors immediately when the terminal theme
    // setting changes (Settings > Terminal) — xterm.js takes its own theme
    // object and does not read CSS custom properties. Applied uniformly to
    // every terminal instance; see TerminalThemeService's doc.
    effect(() => {
      const theme = this.terminalTheme.theme();
      untracked(() => {
        if (this.term) {
          this.term.options.theme = theme;
        }
      });
    });

    // The theme effect's sibling, with one extra obligation: a colour change
    // leaves cell geometry alone, a size change does not. The same pixel box
    // now holds a different number of cells, so without a refit `cols`/`rows`
    // keep their old values and the terminal either renders into a fraction
    // of its box or overflows a container that is `overflow: hidden` — with
    // the prompt clipped out of reach. The `ResizeObserver` cannot cover
    // this: it watches the *container*, whose box does not change when only
    // the cell inside it does, so no callback fires. Order matters — the
    // option is assigned first so xterm has re-measured the cell before
    // `fit()` divides the box by it.
    effect(() => {
      const fontSize = this.terminalFontSize.size();
      untracked(() => {
        if (this.term) {
          this.term.options.fontSize = fontSize;
          this.fitToContainer();
        }
      });
    });

    // Fetch (and refetch) this pane's content whenever the route resolves to
    // a different pane or the socket (re)connects — driven off signals
    // (Angular 20 way) rather than a one-shot `ngOnInit`/`ngAfterViewInit`
    // call. A cold full-page load of `/pane/:host/:id` used to race the WS
    // connection: the old code fired `pane.read`/`pane.subscribe_output`
    // exactly once from `ngAfterViewInit`, which silently failed (caught,
    // swallowed) if the socket wasn't OPEN yet — that's the app-routing gap
    // the E2E suite worked around (apps/web/e2e/README.md). Keying this off
    // `ws.connected()` too means a later connect (or reconnect) retries it,
    // and keying it off `host()`/`id()` means navigating between panes
    // in-place (without an intervening destroy) also refetches.
    effect(() => {
      const host = this.host();
      const id = this.id();
      const connected = this.ws.connected();
      const ready = this.viewReady();
      if (!ready || !host || !id || !connected) {
        return;
      }
      untracked(() => {
        void this.loadForPane(host, id);
      });
    });
  }

  ngAfterViewInit(): void {
    const term = new Terminal({
      theme: this.terminalTheme.theme(),
      fontFamily: XTERM_FONT_FAMILY,
      fontSize: this.terminalFontSize.size(),
      convertEol: true,
      scrollback: 5000,
    });
    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(this.containerRef.nativeElement);
    fitAddon.fit();
    term.onData((data) => this.handleInput(data));

    this.term = term;
    this.fitAddon = fitAddon;
    this.resizeObserver = new ResizeObserver(() => this.fitToContainer());
    this.resizeObserver.observe(this.containerRef.nativeElement);

    const container = this.containerRef.nativeElement;
    container.addEventListener("touchstart", this.onTouchStart, { passive: true });
    container.addEventListener("touchmove", this.onTouchMove, { passive: false });
    container.addEventListener("touchend", this.onTouchEnd, { passive: true });
    container.addEventListener("touchcancel", this.onTouchEnd, { passive: true });

    this.outputEventsSub = this.ws.events$
      .pipe(filter((evt): evt is WsEvent<"pane.output"> => evt.event === "pane.output"))
      .subscribe((evt) => this.handleOutputEvent(evt));

    this.viewReady.set(true);
  }

  ngOnDestroy(): void {
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    const container = this.containerRef?.nativeElement;
    container?.removeEventListener("touchstart", this.onTouchStart);
    container?.removeEventListener("touchmove", this.onTouchMove);
    container?.removeEventListener("touchend", this.onTouchEnd);
    container?.removeEventListener("touchcancel", this.onTouchEnd);
    this.outputEventsSub?.unsubscribe();
    this.teardownSubscription();
    this.term?.dispose();
    this.term = null;
  }

  protected async onRenameSaved(label: string | null): Promise<void> {
    this.showRename.set(false);
    try {
      await this.store.renamePane(this.host(), this.id(), label);
    } catch (err) {
      this.toast.push({
        level: "error",
        message: fill(COPY.toast.renameFailed, {
          reason: err instanceof Error ? err.message : String(err),
        }),
      });
    }
  }

  /** Failed state's only action: re-run the same load for the pane in the route. */
  protected retry(): void {
    const host = this.host();
    const id = this.id();
    if (!host || !id) {
      return;
    }
    void this.loadForPane(host, id);
  }

  private teardownSubscription(): void {
    if (this.subscriptionId && this.subscriptionHost) {
      void this.ws.request(this.subscriptionHost, "pane.unsubscribe_output", {
        subscription_id: this.subscriptionId,
      });
    }
    this.subscriptionId = null;
    this.subscriptionHost = null;
    this.subscribed.set(false);
  }

  private async loadForPane(host: string, id: string): Promise<void> {
    if (!this.term) {
      return;
    }
    this.teardownSubscription();
    this.term.reset();
    this.lastSnapshot = "";
    this.frameReceived.set(false);
    this.hasContent.set(false);
    this.failure.set(null);
    this.loading.set(true);
    try {
      const result = await this.ws.request(host, "pane.read", {
        pane_id: id,
        format: "ansi",
        source: "recent",
      });
      if (this.host() !== host || this.id() !== id) {
        return; // stale: the route moved on again while this request was in flight
      }
      if (result) {
        this.lastSnapshot = result.content;
        this.term.write(result.content);
        this.revision.set(result.revision);
        this.lastPollAt.set(Date.now());
        this.frameReceived.set(true);
        this.hasContent.set(result.content.length > 0);
      }
      // `loading` stays true across the subscribe round-trip on purpose:
      // it suppresses a one-frame `stale` flash between the read landing
      // and the subscription being confirmed.
      try {
        const sub = await this.ws.request(host, "pane.subscribe_output", {
          pane_id: id,
          // The same request the initial read above makes. `pane.output` is a
          // full snapshot painted over the whole terminal, so a live stream at
          // a narrower source than the first paint deletes this pane's
          // scrollback on the first poll.
          source: "recent",
          format: "ansi",
        });
        if (this.host() !== host || this.id() !== id) {
          if (sub) {
            void this.ws.request(host, "pane.unsubscribe_output", { subscription_id: sub.subscription_id });
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
          level: "error",
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

  private handleOutputEvent(evt: WsEvent<"pane.output">): void {
    if (!this.term) {
      return;
    }
    const payload = evt.payload as BridgeEventPayload["pane.output"];
    if (payload.subscription_id !== this.subscriptionId) {
      return;
    }
    this.paint(this.term, payload.content);
    this.revision.set(payload.revision);
    this.lastPollAt.set(Date.now());
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

  private handleInput(data: string): void {
    const host = this.host();
    const id = this.id();
    if (!host || !id) {
      return;
    }
    const action = classifyInput(data);
    if (action.kind === "keys" && action.keys) {
      const keys = action.keys;
      this.enqueueSend(() => this.ws.request(host, "pane.send_keys", { pane_id: id, keys }));
      return;
    }
    if (action.unmapped) {
      // eslint-disable-next-line no-console -- best-effort fallback, worth surfacing during development
      console.warn(`pane-detail: unmapped control bytes in input, sending as text: ${JSON.stringify(data)}`);
    }
    const text = action.text ?? "";
    this.enqueueSend(() => this.ws.request(host, "pane.send_text", { pane_id: id, text }));
  }
}
