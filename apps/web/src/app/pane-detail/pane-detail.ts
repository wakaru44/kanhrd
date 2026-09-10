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
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { map } from 'rxjs';
import { PanesStore, paneKey } from '../state/panes.store';
import { WsClient } from '../state/ws-client';
import { TerminalThemeService } from '../state/terminal-theme.service';
import { TerminalFontSizeService } from '../state/terminal-font-size.service';
import { ToastService } from '../state/toast.service';
import { ClockTick, formatElapsed } from '../util/clock';
import { COPY, fill } from '../shared/copy';
import { RenameModal } from '../shared/rename-modal';
import { paneTitle } from '../util/pane-title';
import {
  LucideArrowLeft,
  LucidePencil,
  LucideRefreshCw,
  LucideTriangleAlert,
  LucideUnplug,
} from '../shared/icons';
import { BoardReturnService } from '../state/board-return.service';
import { PaneTerminal } from './pane-terminal';

/**
 * The reliability states this view can be in. They are mutually exclusive
 * and none of them is faked — see docs/UX-GUIDELINES.md ("Reliability
 * states tell the truth"). `stale` and `unavailable` never blank the
 * terminal: whatever already rendered stays on screen underneath.
 *
 * All but `unavailable` come straight from `PaneTerminal.state()`; host
 * connectivity is the only one this view knows about and the terminal does
 * not.
 */
export type PaneViewState = 'loading' | 'failed' | 'unavailable' | 'stale' | 'empty' | 'live';

/**
 * Tier-2 terminal detail view: header, meta strip, rename flow, and the box
 * a `PaneTerminal` renders into. Everything terminal-shaped — xterm, the
 * wire calls that feed it, input, fit, touch — lives in `PaneTerminal`; this
 * component owns the route, the chrome around the terminal, and the one
 * piece of state the terminal cannot know (whether the pane's host is in
 * view).
 *
 * This component registers **no global keyboard handler**. An unmodified
 * `Escape` or a bare `?` bound at the document would be swallowed away from
 * vim, less, fzf and every other TUI running inside the pane; the visible
 * back control in the header is the escape hatch, and app-level bindings
 * stay with the existing explicit prefix-shortcut mechanism.
 */
@Component({
  selector: 'app-pane-detail',
  imports: [
    RouterLink,
    RenameModal,
    LucideArrowLeft,
    LucidePencil,
    LucideRefreshCw,
    LucideTriangleAlert,
    LucideUnplug,
  ],
  templateUrl: './pane-detail.html',
  styleUrl: './pane-detail.scss',
})
export class PaneDetail implements AfterViewInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly ws = inject(WsClient);
  private readonly store = inject(PanesStore);
  private readonly toast = inject(ToastService);
  protected readonly clock = inject(ClockTick);
  private readonly boardReturn = inject(BoardReturnService);

  /**
   * The terminal, and everything that hangs off it. Constructed here rather
   * than injected: it is this view's own object, one per mounted view, and
   * it takes no DI of its own.
   */
  private readonly terminal = new PaneTerminal({
    ws: this.ws,
    terminalTheme: inject(TerminalThemeService),
    terminalFontSize: inject(TerminalFontSizeService),
    toast: this.toast,
  });

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

  @ViewChild('terminalContainer', { static: true })
  private readonly containerRef!: ElementRef<HTMLDivElement>;

  protected readonly host = toSignal(
    this.route.paramMap.pipe(map((params) => params.get('host') ?? '')),
    { initialValue: '' }
  );
  protected readonly id = toSignal(
    this.route.paramMap.pipe(map((params) => params.get('id') ?? '')),
    { initialValue: '' }
  );

  protected readonly pane = computed(() =>
    this.store.panesSignal().get(paneKey(this.host(), this.id()))
  );

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

  /** Whether `pane.rename` will succeed on this pane's host. */
  protected readonly paneRenameAvailable = computed(
    () => this.store.capabilitiesSignal().get(this.host())?.paneRename === true
  );

  protected readonly showRename = signal(false);
  protected readonly statusKey = computed(() => this.pane()?.agent_status ?? 'unknown');
  protected readonly statusLabel = computed(() => {
    const key = this.statusKey();
    return key in COPY.status ? COPY.status[key as keyof typeof COPY.status] : COPY.status.unknown;
  });

  /**
   * Whether the host this pane lives on is currently in view. An unknown
   * host is *not* reported as gone — only a host the bridge has told us
   * about and marked disconnected.
   */
  private readonly hostInSight = computed(() => {
    const entry = this.store.hostsSignal().find((h) => h.name === this.host());
    return entry ? entry.connected : true;
  });

  /** Flips true once the terminal container exists, so the load effect below has something to write into. */
  private readonly viewReady = signal(false);

  // --- meta strip: revision count, last-poll timestamp, subscription
  // health. All from data already on the tier-2 wire surface (`pane.read`'s
  // and `pane.output`'s `revision` — see BridgeMethodResult/BridgeEventPayload
  // in wire.ts) — no bridge change needed. Elapsed is observed client time,
  // never presented as a server-authoritative duration.

  /**
   * Data readouts, not product copy (see the header comment in
   * `shared/copy.ts`): a revision id and an observed elapsed duration.
   * They are formatted here rather than in the template so the template
   * itself carries no free-standing string.
   */
  protected readonly revisionLabel = computed(() => {
    const rev = this.terminal.revision();
    return rev === null ? 'rev —' : `rev ${rev}`;
  });
  protected readonly lastPollLabel = computed(() => {
    const at = this.terminal.lastPollAt();
    if (at === null) {
      return 'updated —';
    }
    return `updated ${formatElapsed(this.clock.now() - at)} ago`;
  });

  /** herdr's own wording for the failed read, quoted verbatim and never rewritten. */
  protected readonly failureReason = computed(() => this.terminal.failureReason());

  /**
   * The terminal's own reliability state, with the one thing it cannot know
   * laid over the top: a host the bridge has marked disconnected outranks
   * everything else.
   */
  protected readonly viewState = computed<PaneViewState>(() =>
    this.hostInSight() ? this.terminal.state() : 'unavailable'
  );

  constructor() {
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
        void this.terminal.load(host, id);
      });
    });
  }

  ngAfterViewInit(): void {
    this.terminal.attach(this.containerRef.nativeElement);
    this.viewReady.set(true);
  }

  ngOnDestroy(): void {
    this.terminal.dispose();
  }

  protected async onRenameSaved(label: string | null): Promise<void> {
    this.showRename.set(false);
    try {
      await this.store.renamePane(this.host(), this.id(), label);
    } catch (err) {
      this.toast.push({
        level: 'error',
        message: fill(COPY.toast.renameFailed, {
          reason: err instanceof Error ? err.message : String(err),
        }),
      });
    }
  }

  /** Failed state's only action: re-run the same load for the pane in the route. */
  protected retry(): void {
    this.terminal.retry();
  }
}
