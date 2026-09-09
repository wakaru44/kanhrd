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
import { ThemeService } from "../state/theme.service";
import { ClockTick, formatElapsed } from "../util/clock";

/** Mirrors `[data-theme="dark"]` in styles.scss — xterm.js takes its own theme object, it doesn't read CSS custom properties. */
const XTERM_THEME_DARK = {
  background: "#14161c",
  foreground: "#e6e8ee",
  cursor: "#e6e8ee",
  selectionBackground: "#3c4252",
  black: "#14161c",
  brightBlack: "#5a6072",
};

/** Mirrors `[data-theme="light"]` in styles.scss. */
const XTERM_THEME_LIGHT = {
  background: "#f4f5f7",
  foreground: "#1b1e26",
  cursor: "#1b1e26",
  selectionBackground: "#d7dae1",
  black: "#f4f5f7",
  brightBlack: "#8b91a1",
};

const XTERM_FONT_FAMILY =
  'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace';

/**
 * Tier-2 terminal detail view: an xterm.js terminal fed by `pane.read` +
 * `pane.subscribe_output`, with input relayed via `pane.send_text` /
 * `pane.send_keys`. See CONTRACT-TIER2.md section 6 — `pane.resize` never
 * succeeds in this tier, so window/container resizing is a pure client-side
 * (`FitAddon`) cosmetic concern with no wire call.
 */
@Component({
  selector: "app-pane-detail",
  imports: [RouterLink],
  templateUrl: "./pane-detail.html",
  styleUrl: "./pane-detail.scss",
})
export class PaneDetail implements AfterViewInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly ws = inject(WsClient);
  private readonly store = inject(PanesStore);
  private readonly themeService = inject(ThemeService);
  protected readonly clock = inject(ClockTick);

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
  protected readonly capabilities = computed(() => this.store.capabilitiesSignal().get(this.host()));
  protected readonly graphicsAvailable = computed(() => this.capabilities()?.paneGraphics === true);
  protected readonly pollIntervalMs = computed(() => this.capabilities()?.outputPollIntervalMs ?? 150);

  private term: Terminal | null = null;
  private fitAddon: FitAddon | null = null;
  private subscriptionId: string | null = null;
  private subscriptionHost: string | null = null;
  private outputEventsSub: Subscription | null = null;
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
  private readonly onWindowResize = (): void => {
    this.fitAddon?.fit();
  };

  // --- stats strip: revision count, last-poll timestamp, subscription
  // health. All from data already on the tier-2 wire surface (`pane.read`'s
  // and `pane.output`'s `revision` — see BridgeMethodResult/BridgeEventPayload
  // in wire.ts) — no bridge change needed.
  protected readonly revision = signal<number | null>(null);
  protected readonly lastPollAt = signal<number | null>(null);
  protected readonly subscribed = signal(false);

  protected readonly lastPollLabel = computed(() => {
    const at = this.lastPollAt();
    if (at === null) {
      return "never";
    }
    return `${formatElapsed(this.clock.now() - at)} ago`;
  });

  constructor() {
    // Switches the live terminal's colors immediately when the header/
    // settings theme toggle flips — xterm.js takes its own theme object and
    // does not read CSS custom properties.
    effect(() => {
      const theme = this.themeService.theme();
      untracked(() => {
        if (this.term) {
          this.term.options.theme = theme === "light" ? XTERM_THEME_LIGHT : XTERM_THEME_DARK;
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
      theme: this.themeService.theme() === "light" ? XTERM_THEME_LIGHT : XTERM_THEME_DARK,
      fontFamily: XTERM_FONT_FAMILY,
      fontSize: 13,
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
    window.addEventListener("resize", this.onWindowResize);

    this.outputEventsSub = this.ws.events$
      .pipe(filter((evt): evt is WsEvent<"pane.output"> => evt.event === "pane.output"))
      .subscribe((evt) => this.handleOutputEvent(evt));

    this.viewReady.set(true);
  }

  ngOnDestroy(): void {
    window.removeEventListener("resize", this.onWindowResize);
    this.outputEventsSub?.unsubscribe();
    this.teardownSubscription();
    this.term?.dispose();
    this.term = null;
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
        this.term.write(result.content);
        this.revision.set(result.revision);
        this.lastPollAt.set(Date.now());
      }
      const sub = await this.ws.request(host, "pane.subscribe_output", { pane_id: id });
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
    } catch {
      // Bridge unreachable, tier-1 bridge, or connection dropped mid-load —
      // per the runtime/client boundary guardrail this is a client-local
      // outcome: leave the terminal showing whatever it already has rather
      // than tearing down the view or the WS connection.
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
    this.term.reset();
    this.term.write(payload.content);
    this.revision.set(payload.revision);
    this.lastPollAt.set(Date.now());
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
