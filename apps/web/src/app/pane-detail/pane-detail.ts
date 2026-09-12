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
  viewChild,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { map } from 'rxjs';
import type { Pane } from '@kanhrd/schema';
import { PanesStore, paneKey } from '../state/panes.store';
import { WsClient } from '../state/ws-client';
import { TerminalThemeService } from '../state/terminal-theme.service';
import { TerminalFontSizeService } from '../state/terminal-font-size.service';
import { ToastService } from '../state/toast.service';
import { ClockTick, formatElapsed } from '../util/clock';
import { COPY, fill } from '../shared/copy';
import { RenameModal } from '../shared/rename-modal';
import { paneTitle } from '../util/pane-title';
import { KeyboardService } from '../state/keyboard.service';
import {
  LucideArrowLeft,
  LucidePencil,
  LucideSquareSplitHorizontal,
  LucideRefreshCw,
  LucideTriangleAlert,
  LucideUnplug,
} from '../shared/icons';
import { BoardReturnService } from '../state/board-return.service';
import { CardSwitcher } from './card-switcher';
import { TabStrip, stepTab, tabEntries, type TabEntry } from './tab-strip';
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
 * The next card in the tab after `currentId`, wrapping past the last —
 * the single answer to "which card is next", shared by the bar's
 * next-card button and by `prefix + o` through
 * `KeyboardService.registerCardSwitcher`. `null` in a tab of one, and for
 * a pane the list does not hold.
 *
 * Order is the store's own iteration order, which is herdr's layout order
 * for every pane present at the last `pane.list` and appends anything
 * created since — see `design.md` Finding 1 for why that ceiling is
 * deliberate.
 */
export function nextSiblingCard(siblings: readonly Pane[], currentId: string): Pane | null {
  if (siblings.length < 2) {
    return null;
  }
  const index = siblings.findIndex((pane) => pane.id === currentId);
  return index < 0 ? null : siblings[(index + 1) % siblings.length];
}

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
    CardSwitcher,
    TabStrip,
    LucideArrowLeft,
    LucidePencil,
    LucideSquareSplitHorizontal,
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
  private readonly router = inject(Router);
  private readonly keyboard = inject(KeyboardService);

  /**
   * The terminal, and everything that hangs off it. Constructed here rather
   * than injected: it is this view's own object, one per mounted view, and
   * it takes no DI of its own.
   */
  private readonly terminalTheme = inject(TerminalThemeService);
  private readonly terminalFontSize = inject(TerminalFontSizeService);

  private readonly terminal = new PaneTerminal({
    ws: this.ws,
    terminalTheme: this.terminalTheme,
    terminalFontSize: this.terminalFontSize,
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

  private readonly switcher = viewChild(CardSwitcher);

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

  /**
   * Every card in this tab, the current one included: same host, same
   * `tab.id`, in `panesSignal` iteration order. Derived from data already
   * resident — no wire method, no schema field, no extra request.
   */
  protected readonly siblings = computed<readonly Pane[]>(() => {
    const pane = this.pane();
    if (!pane) {
      return [];
    }
    const host = this.host();
    return [...this.store.panesSignal().values()].filter(
      (candidate) => candidate.host === host && candidate.tab.id === pane.tab.id
    );
  });

  /** The switcher, the next-card button and both card chords all hang off this one condition. */
  protected readonly sharesTab = computed(() => this.siblings().length > 1);

  // --- the tab level ------------------------------------------------------
  //
  // herdr's model is host -> workspace -> tab -> pane, and its TUI shows the
  // bottom two levels at once. This view used to show only `siblings` (the
  // panes of ONE tab) in the slot herdr gives to tabs, so a terminal had no
  // route to another tab at all and `prefix + n` moved the board's scope
  // behind the operator's back. Both levels are drawn now, and the keys and
  // the strip share one implementation (`tabEntries` / `stepTab`).

  protected readonly tabEntries = computed<readonly TabEntry[]>(() => {
    const pane = this.pane();
    if (!pane) {
      return [];
    }
    return tabEntries(
      this.store.tabsSignal().values(),
      this.store.panesSignal().values(),
      this.host(),
      pane.workspace.id,
      pane.tab.id
    );
  });

  /** A workspace of one tab renders no strip: no empty rail, no disabled control. */
  protected readonly hasTabs = computed(() => this.tabEntries().length > 1);

  /** `prefix + n` / `prefix + p`, and the pointer's own entry links, on one implementation. */
  private stepTabBy(direction: 1 | -1): void {
    const next = stepTab(this.tabEntries(), direction);
    if (next) {
      void this.router.navigate(['/pane', next.pane.host, next.pane.id]);
    }
  }

  /** herdr's git provenance for this pane's workspace — the FULL path here, never the card's truncated form. */
  protected readonly project = computed(() => this.pane()?.project ?? null);

  /** Whether `pane.rename` will succeed on this pane's host. */
  protected readonly paneRenameAvailable = computed(
    () => this.store.capabilitiesSignal().get(this.host())?.paneRename === true
  );

  /** `workspace / tab`, from the pane already in the store. The host is the hanko seal's and is never repeated here. */
  protected readonly workspaceName = computed(() => this.pane()?.workspace.name ?? '');
  protected readonly tabName = computed(() => this.pane()?.tab.name ?? '');

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
    // One handler for "which card is next", shared with `prefix + o` and
    // `Ctrl+Alt+I` — never a second implementation living in the service.
    this.keyboard.registerCardSwitcher({
      available: () => this.sharesTab(),
      focus: () => this.switcher()?.focusCurrent(),
      nextCard: () => this.goToNextCard(),
    });

    // Same seam for the level above: with this registered, `prefix + n` /
    // `prefix + p` move the terminal the operator is looking at rather than
    // a board scope they cannot see.
    this.keyboard.registerTabNavigator({
      available: () => this.hasTabs(),
      step: (direction) => this.stepTabBy(direction),
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
        void this.terminal.load(host, id);
      });
    });

    // The terminal's appearance follows the app's settings, driven from
    // here rather than from inside `PaneTerminal`: reacting to a signal
    // wants `effect()`, `effect()` wants an injection context, and this
    // component is where one exists. `PaneTerminal` takes no DI, so it
    // offers `applyTheme`/`applyFontSize` and lets its owner decide when
    // to call them. Both are no-ops before `attach()`, which reads the
    // same two settings for the `Terminal` constructor.
    effect(() => {
      const theme = this.terminalTheme.theme();
      untracked(() => this.terminal.applyTheme(theme));
    });

    // Kept separate from the theme effect so a colour change never pays
    // for a refit: `applyFontSize` re-fits, `applyTheme` does not.
    effect(() => {
      const size = this.terminalFontSize.size();
      untracked(() => this.terminal.applyFontSize(size));
    });
  }

  ngAfterViewInit(): void {
    this.terminal.attach(this.containerRef.nativeElement);
    this.viewReady.set(true);
  }

  ngOnDestroy(): void {
    this.keyboard.registerCardSwitcher(null);
    this.keyboard.registerTabNavigator(null);
    this.terminal.dispose();
  }

  /** The next-card button and `prefix + o`. A no-op in a tab of one. */
  protected goToNextCard(): void {
    const next = nextSiblingCard(this.siblings(), this.id());
    if (next) {
      void this.router.navigate(['/pane', next.host, next.id]);
    }
  }

  /**
   * `Escape` on the switcher hands the keyboard back to the pane. xterm's
   * helper element is a real `<textarea>` inside the container, so
   * focusing it is the whole of "give the terminal its keys back" — and it
   * touches neither `PaneTerminal` nor the repaint path.
   */
  protected focusTerminal(): void {
    this.containerRef.nativeElement.querySelector('textarea')?.focus();
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
