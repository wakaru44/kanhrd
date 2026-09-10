import { Injectable } from "@angular/core";
import type { AgentStatus } from "@kanhrd/schema";

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
  columnKeys: readonly string[],
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
 * The one board position remembered across a trip into a pane.
 *
 * Opening a card is a round trip, not a departure: coming back should put
 * the user where they were — same scope, same page, same scroll, same card
 * under the cursor — rather than at the top of an unscoped board
 * (docs/UX-GUIDELINES.md, "Focus and terminal input survive navigation").
 *
 * The record is written in two halves, because neither half knows the
 * other's business. `Card` knows which card was opened and writes that on
 * the click, before the navigation it starts. `Board` knows the URL and the
 * scroll geometry and writes those as it is torn down, folding in whichever
 * card was clicked during that visit. `Board` consumes the whole thing the
 * next time it mounts.
 *
 * Deliberately in-memory only: this is one navigation's worth of state, not
 * a preference. A reload starts fresh, which is what a reload should do.
 */
@Injectable({ providedIn: "root" })
export class BoardReturnService {
  private pending: BoardReturn | null = null;
  /** The card clicked during the current board visit, awaiting the geometry half. */
  private clickedCard: { paneKey: string; status: AgentStatus; index: number } | null = null;

  /** `Card`: this card is being opened. Called before the navigation it triggers. */
  rememberCard(paneKey: string, status: AgentStatus, index: number): void {
    this.clickedCard = { paneKey, status, index };
  }

  /**
   * `Board`: this is where I was. Folds in the card clicked during this
   * visit (if any) and forgets it, so a later departure by some other route
   * cannot inherit a stale card.
   */
  rememberBoard(geometry: {
    url: string;
    scrollLeft: number;
    scrollTops: Readonly<Partial<Record<AgentStatus, number>>>;
  }): void {
    const card = this.clickedCard;
    this.clickedCard = null;
    this.pending = {
      url: geometry.url,
      scrollLeft: geometry.scrollLeft,
      scrollTops: geometry.scrollTops,
      paneKey: card?.paneKey ?? null,
      status: card?.status ?? null,
      index: card?.index ?? 0,
    };
  }

  /** Where a pane's back control should go. `/` when there is nothing remembered. */
  boardUrl(): string {
    return this.pending?.url ?? "/";
  }

  /**
   * `Board`, on mount: take the record and clear it. Consumed either way —
   * a record is good for exactly one return, and a board that came up
   * somewhere else has no use for one belonging to a different URL.
   */
  take(): BoardReturn | null {
    const record = this.pending;
    this.pending = null;
    return record;
  }

  clear(): void {
    this.pending = null;
    this.clickedCard = null;
  }
}
