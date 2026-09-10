import { Injectable, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router } from '@angular/router';
import { filter, map } from 'rxjs';
import type { AgentStatus } from '@kanhrd/schema';

/** Where the board was, and what was focused on it, when a card was opened. */
export interface BoardReturn {
  /** The board URL the card was opened from — `/`, `/workspace/:id`, or `/workspace/:id/tab/:id`. */
  readonly url: string;
  /** `${host}:${paneId}` of the opened card, or `null` when the board was left some other way. */
  readonly paneKey: string | null;
  /** The status column that card was in, so a vanished card falls back inside its own column. */
  readonly status: AgentStatus | null;
  /** The card's position in that column — the predictable neighbour when the card itself is gone. */
  readonly index: number;
  /** Horizontal paging offset of the strip. */
  readonly scrollLeft: number;
  /** Vertical offset of each status column's card list, keyed by status. */
  readonly scrollTops: Readonly<Partial<Record<AgentStatus, number>>>;
}

/** The geometry half of a record: everything about a board position that is not the URL. */
export interface BoardGeometry {
  readonly scrollLeft: number;
  readonly scrollTops: Readonly<Partial<Record<AgentStatus, number>>>;
}

/**
 * How long the board keeps trying to put the user back where they were
 * before giving up and leaving them at the top. Cards arrive with
 * `pane.list`, so the target may not exist for a beat after mount; past
 * this, the data is late enough that a jump would be more surprising than
 * the reset.
 */
export const RESTORE_GRACE_MS = 2000;

/** How often the restore pump re-checks for a target that has not rendered yet. */
const RESTORE_RETRY_MS = 50;

/**
 * The three URL shapes that are a board (docs/UX-GUIDELINES.md, "URL is
 * state"). Anything else — a pane, settings, an unknown URL — is somewhere
 * the user goes *from* a board, never a place to come back to.
 */
const BOARD_URL = /^\/(?:workspace\/[^/?#]+(?:\/tab\/[^/?#]+)?)?$/;

export function isBoardUrl(url: string): boolean {
  return BOARD_URL.test(url.split(/[?#]/)[0]);
}

/**
 * What the service needs from the view to put the user back, and nothing
 * more. The board owns every piece of template knowledge here — which
 * element scrolls a column, how a card is queried, what a horizontal offset
 * means to the pager — and the service owns the protocol: the retry pump,
 * the grace deadline, the URL match, and scroll before focus.
 */
export interface BoardRestorePort {
  /** The URL the board is on right now. */
  currentUrl(): string;
  /** `false` while the board is still on the skeleton — nothing to restore into yet. */
  ready(): boolean;
  /**
   * Put the horizontal paging offset back, and settle the pager on the page
   * it names — a strip's scroll and the pager's selection are one state.
   * A board with no single strip (swimlanes on) has nowhere to put it.
   */
  restorePage(scrollLeft: number): void;
  /**
   * Put one status column's vertical offset back. A board whose columns
   * live inside bands has no single column per status, so this is a no-op
   * there rather than a guess at which band was meant.
   */
  restoreColumnScroll(status: AgentStatus, scrollTop: number): void;
  /** `${host}:${paneId}` of every card in a status column, in order. */
  columnKeys(status: AgentStatus): readonly string[];
  /**
   * Focus that card — unless the user has already placed focus somewhere
   * themselves, which is never taken away from them.
   *
   * `true` once the card has been reached (focused, or deliberately left
   * alone); `false` while it has not rendered yet, which is the pump's cue
   * to look again.
   */
  focusCard(paneKey: string): boolean;
}

/**
 * Which card should hold focus on return.
 *
 * The card that was opened, if it is still there. Otherwise the card now
 * standing where it stood — a predictable neighbour, not the top of the
 * column and not nothing (docs/UX-GUIDELINES.md, "Keyboard-first"). A
 * column that emptied out while the user was away has no target at all.
 */
export function returnFocusTarget(
  paneKey: string | null,
  index: number,
  columnKeys: readonly string[]
): string | null {
  if (paneKey !== null && columnKeys.includes(paneKey)) {
    return paneKey;
  }
  if (columnKeys.length === 0) {
    return null;
  }
  return columnKeys[Math.min(Math.max(index, 0), columnKeys.length - 1)];
}

/**
 * The round trip out of the board and back into it.
 *
 * Opening a card is a round trip, not a departure: coming back should put
 * the user where they were — same scope, same page, same scroll, same card
 * under the cursor — rather than at the top of an unscoped board
 * (docs/UX-GUIDELINES.md, "Focus and terminal input survive navigation").
 *
 * The record is written in two halves, because neither half knows the
 * other's business. `Card` knows which card was opened and writes that on
 * the click, before the navigation it starts. `Board` knows the scroll
 * geometry and writes that as it is torn down. The URL is nobody's to hand
 * over: the service watches the router itself and keeps the last
 * board-shaped one, because the only moment a departing component could
 * hand one over is `ngOnDestroy`, and by then `Router.url` already names
 * the route being navigated TO. (That bug shipped once: every departure
 * remembered the pane's own URL, so the pane's "back to the board" control
 * pointed at the page the user was already on and the first click did
 * nothing.)
 *
 * Coming back, the board hands over a `BoardRestorePort` and this service
 * runs the whole restore: the record is consumed on mount but applied
 * later, because cards arrive with `pane.list` and the target usually is
 * not in the DOM yet. The pump retries until it lands or
 * `RESTORE_GRACE_MS` runs out.
 *
 * Deliberately in-memory only: this is one navigation's worth of state, not
 * a preference. A reload starts fresh, which is what a reload should do.
 */
@Injectable({ providedIn: 'root' })
export class BoardReturnService {
  private readonly router = inject(Router);

  private pending: BoardReturn | null = null;
  /** The card clicked during the current board visit, awaiting the geometry half. */
  private clickedCard: { paneKey: string; status: AgentStatus; index: number } | null = null;

  /** The last URL that was a board. Never a pane's, whatever the router is doing now. */
  private lastBoardUrl = this.router.url && isBoardUrl(this.router.url) ? this.router.url : '/';

  // --- the restore in flight, if any ------------------------------------
  private restoring: BoardReturn | null = null;
  private port: BoardRestorePort | null = null;
  private deadline = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    this.router.events
      .pipe(
        filter((event): event is NavigationEnd => event instanceof NavigationEnd),
        map((event) => event.urlAfterRedirects),
        filter(isBoardUrl),
        takeUntilDestroyed()
      )
      .subscribe((url) => (this.lastBoardUrl = url));
  }

  /** `Card`: this card is being opened. Called before the navigation it triggers. */
  rememberCard(paneKey: string, status: AgentStatus, index: number): void {
    this.clickedCard = { paneKey, status, index };
  }

  /**
   * `Board`: this is where I was, as it is torn down. Folds in the card
   * clicked during this visit (if any) and forgets it, so a later departure
   * by some other route cannot inherit a stale card. Ends any restore still
   * in flight — the board being remembered is the board going away.
   */
  rememberBoard(geometry: BoardGeometry): void {
    this.finishRestore();
    const card = this.clickedCard;
    this.clickedCard = null;
    this.pending = {
      url: this.lastBoardUrl,
      scrollLeft: geometry.scrollLeft,
      scrollTops: geometry.scrollTops,
      paneKey: card?.paneKey ?? null,
      status: card?.status ?? null,
      index: card?.index ?? 0,
    };
  }

  /** Where a pane's back control should go. `/` when there is nothing remembered. */
  boardUrl(): string {
    return this.pending?.url ?? '/';
  }

  /**
   * `Board`, on mount: take the record and start putting the user back.
   * Consumed either way — a record is good for exactly one return, and a
   * board that came up somewhere else has no use for one belonging to a
   * different URL.
   */
  restore(port: BoardRestorePort): void {
    const record = this.pending;
    this.pending = null;
    if (!record) {
      return;
    }
    this.restoring = record;
    this.port = port;
    this.deadline = Date.now() + RESTORE_GRACE_MS;
  }

  /**
   * Try again now. `Board` calls this after its first render and every time
   * the columns change — cards land with `pane.list`, well after mount — and
   * the pump calls it on its own timer in between. No-op once the restore is
   * done, so it is safe to call from anywhere.
   */
  retryRestore(): void {
    this.tryRestore();
    if (!this.restoring) {
      return;
    }
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.retryRestore(), RESTORE_RETRY_MS);
  }

  clear(): void {
    this.finishRestore();
    this.pending = null;
    this.clickedCard = null;
  }

  private tryRestore(): void {
    const record = this.restoring;
    const port = this.port;
    if (!record || !port) {
      return;
    }
    // A board that came up somewhere else has no use for someone else's
    // position, and a record that has waited too long is stale.
    if (record.url !== port.currentUrl() || Date.now() > this.deadline) {
      this.finishRestore();
      return;
    }
    if (!port.ready()) {
      return; // still on the skeleton
    }

    this.restoreScroll(record, port);

    const status = record.status;
    if (!status) {
      this.finishRestore(); // left the board without opening a card: scroll was the whole job
      return;
    }
    const target = returnFocusTarget(record.paneKey, record.index, port.columnKeys(status));
    if (!target) {
      this.finishRestore();
      return;
    }
    if (!port.focusCard(target)) {
      return; // not rendered yet — the pump will look again
    }
    this.finishRestore();
  }

  /** Scroll first, always: focus restored into a column still at the top would undo itself. */
  private restoreScroll(record: BoardReturn, port: BoardRestorePort): void {
    port.restorePage(record.scrollLeft);
    for (const [status, top] of Object.entries(record.scrollTops)) {
      if (top !== undefined) {
        port.restoreColumnScroll(status as AgentStatus, top);
      }
    }
  }

  private finishRestore(): void {
    this.restoring = null;
    this.port = null;
    clearTimeout(this.timer);
    this.timer = undefined;
  }
}
