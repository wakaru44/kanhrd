import type { Locator, Page } from "@playwright/test";

/**
 * Semantic selectors for kanhrd's SPA. Kept centralized so a markup change
 * only needs updating here, not across every spec. Sourced directly from
 * apps/web/src/app/{board,pane-detail}/*.html — update alongside any markup
 * change in those templates.
 */

export function brand(page: Page): Locator {
  return page.locator(".brand");
}

export function filterBar(page: Page): Locator {
  return page.locator(".filter-bar");
}

export function hostChip(page: Page, host: string): Locator {
  return filterBar(page).locator(".host-chip", { hasText: host });
}

export function statusChip(page: Page, status: string): Locator {
  return filterBar(page).locator(".status-chip", { hasText: status });
}

export function allCards(page: Page): Locator {
  return page.locator(".card");
}

export function columnByStatus(page: Page, status: string): Locator {
  return page.locator(`.column[data-status="${status}"]`);
}

export function cardsInColumn(page: Page, status: string): Locator {
  return columnByStatus(page, status).locator(".card");
}

/**
 * The card's own host seal (inside `.card`, distinct from the filter bar's
 * `.host-chip`). The redesign renamed this element from `.host-chip` to
 * `.host-seal` (`src/app/board/card.html`).
 */
export function cardHostChip(card: Locator): Locator {
  return card.locator(".host-seal");
}

/**
 * The card's opening control. Since the card became a `<div class="card">`
 * grid with `<a class="card-open">` and `.card-actions` as SIBLINGS, the
 * card itself is no longer the anchor — read `href` off this, never off
 * `.card`. Renders as a `<span class="card-open">` (no href) for a
 * tier-1-only card, which is exactly what `card--static` means.
 */
export function cardOpenLink(card: Locator): Locator {
  return card.locator("a.card-open");
}

/** The card's title text, link or not. */
export function cardTitle(card: Locator): Locator {
  return card.locator(".card-open");
}

/** The card's action cluster — visible on first render, never a hover reveal. */
export function cardActions(card: Locator): Locator {
  return card.locator(".card-actions");
}

/** The always-visible `LucideMoreHorizontal` overflow trigger on a card. */
export function cardOverflowTrigger(card: Locator): Locator {
  return card.locator(".card-action.overflow-trigger");
}

/** The board's status-column strip — the mobile pager, a scrolling row on desktop. */
export function boardStrip(page: Page): Locator {
  return page.locator(".board-strip");
}

/** The mobile status switcher (`role="tablist"`), rendered only below 900px. */
export function statusSwitcher(page: Page): Locator {
  return page.locator("app-status-switcher .switcher");
}

/** The switcher's segments, in `STATUS_COLUMN_ORDER`. */
export function switcherSegments(page: Page): Locator {
  return statusSwitcher(page).locator('[role="tab"]');
}

export function terminalContainer(page: Page): Locator {
  return page.locator(".terminal-container");
}

export function xtermElement(page: Page): Locator {
  return page.locator(".xterm");
}

/**
 * The actual rendered terminal grid text (xterm.js's `.xterm-rows` layer).
 * Prefer this over `.terminal-container`'s full textContent for content
 * assertions — xterm.js injects a `<style>` tag as a sibling inside the
 * container, whose CSS text would otherwise make "non-empty" checks
 * trivially true even when the terminal itself has never rendered anything.
 */
export function xtermRows(page: Page): Locator {
  return page.locator(".xterm-rows");
}

