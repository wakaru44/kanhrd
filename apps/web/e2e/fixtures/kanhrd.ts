import { test as base, expect, type Page } from "@playwright/test";
import { allCards, cardHostChip } from "../helpers/selectors";

export interface PanePickerResult {
  /** Host name shown on the card, e.g. "local". */
  host: string;
  /** Pane id parsed out of the card's `/pane/:host/:id` link, e.g. "w6:p1". */
  id: string;
}

interface KanhrdFixtures {
  /** Navigates to `/` and waits for the board to finish rendering. */
  app: Page;
  /** First available card's `{ host, id }`, so tests don't hardcode a pane id that may not exist next run. */
  panePicker: PanePickerResult;
}

export const test = base.extend<KanhrdFixtures>({
  app: async ({ page }, use) => {
    await page.goto("/");
    // Board renders either a state message (loading/error/empty) or the
    // grid; wait for the loading state to resolve either way before handing
    // the page to the test.
    await expect(page.locator(".state.loading")).toHaveCount(0, { timeout: 10_000 });
    await use(page);
  },

  panePicker: async ({ app }, use) => {
    const cards = allCards(app);
    await expect(cards.first()).toBeVisible({ timeout: 10_000 });
    const first = cards.first();
    const href = await first.getAttribute("href");
    if (!href) {
      throw new Error(
        "panePicker: first .card has no href — it may be a card--static (tier-1-only host) rather than a terminal-capable card",
      );
    }
    // href shape: /pane/<host>/<id>  (id itself may contain ':', e.g. "w6:p1")
    const match = /^\/pane\/([^/]+)\/(.+)$/.exec(href);
    if (!match) {
      throw new Error(`panePicker: unexpected card href shape: ${href}`);
    }
    const [, host, id] = match;
    const hostChipText = (await cardHostChip(first).textContent())?.trim();
    await use({ host: hostChipText || host, id: decodeURIComponent(id) });
  },
});

export { expect };
