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

/** Card's own host chip (inside `.card`, distinct from the filter bar's `.host-chip`). */
export function cardHostChip(card: Locator): Locator {
  return card.locator(".host-chip");
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

export function liveIndicator(page: Page): Locator {
  return page.locator(".live-indicator");
}
