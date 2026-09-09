import {
  AfterViewInit,
  Component,
  ElementRef,
  OnDestroy,
  ViewChild,
  computed,
  inject,
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

const XTERM_THEME = {
  background: "#14161c",
  foreground: "#e6e8ee",
  cursor: "#e6e8ee",
  selectionBackground: "#3c4252",
  black: "#14161c",
  brightBlack: "#5a6072",
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
  private outputEventsSub: Subscription | null = null;

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

  ngAfterViewInit(): void {
    const term = new Terminal({
      theme: XTERM_THEME,
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

    void this.loadInitial();
  }

  ngOnDestroy(): void {
    window.removeEventListener("resize", this.onWindowResize);
    this.outputEventsSub?.unsubscribe();
    const host = this.host();
    if (this.subscriptionId && host) {
      void this.ws.request(host, "pane.unsubscribe_output", { subscription_id: this.subscriptionId });
    }
    this.term?.dispose();
    this.term = null;
  }

  private async loadInitial(): Promise<void> {
    const host = this.host();
    const id = this.id();
    if (!host || !id || !this.term) {
      return;
    }
    try {
      const result = await this.ws.request(host, "pane.read", {
        pane_id: id,
        format: "ansi",
        source: "recent",
      });
      if (result) {
        this.term.write(result.content);
      }
      const sub = await this.ws.request(host, "pane.subscribe_output", { pane_id: id });
      this.subscriptionId = sub?.subscription_id ?? null;
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
