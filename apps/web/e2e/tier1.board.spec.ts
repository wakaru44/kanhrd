import { test, expect } from "./fixtures/kanhrd";
import { herdrAvailable } from "./fixtures/herdr";
import { waitForStableCount } from "./helpers/wait";
import {
  brand,
  filterBar,
  hostChip,
  statusChip,
  allCards,
  cardHostChip,
  columnByStatus,
  cardsInColumn,
} from "./helpers/selectors";

/**
 * Tier-1: kanban board rendering, real cards from local herdr, host/status
 * filter chips. Mirrors the flows L5B's throwaway Playwright driver used
 * during tier-1/tier-2 validation (see tmp/foreman/VALIDATION-TIER1.md and
 * VALIDATION-TIER2.md).
 */

let preflightReason: string | undefined;

test.beforeAll(async () => {
  const result = await herdrAvailable();
  if (!result.ok) {
    preflightReason = result.reason;
  }
});

test.beforeEach(() => {
  test.skip(!!preflightReason, `herdr pre-flight failed: ${preflightReason}`);
});

test("board loads and shows the kanhrd brand", async ({ app }) => {
  await expect(brand(app)).toBeVisible();
  await expect(brand(app)).toHaveText(/kanhrd/i);
});

test("filter bar renders one host chip per configured host (local)", async ({ app }) => {
  await expect(filterBar(app)).toBeVisible();
  await expect(hostChip(app, "local")).toBeVisible();
});

test("at least one real pane renders as a card", async ({ app }) => {
  const cards = allCards(app);
  await expect(cards.first()).toBeVisible({ timeout: 10_000 });
  expect(await cards.count()).toBeGreaterThan(0);
});

test("every card shows a host chip labeled local", async ({ app }) => {
  const cards = allCards(app);
  await expect(cards.first()).toBeVisible({ timeout: 10_000 });
  const count = await cards.count();
  for (let i = 0; i < count; i++) {
    await expect(cardHostChip(cards.nth(i))).toHaveText("local");
  }
});

test("toggling a status filter chip hides and restores that column's cards", async ({ app }) => {
  // Pick whichever status column currently has at least one card, so this
  // test doesn't depend on a specific pane's live agent_status.
  const statuses = ["working", "blocked", "idle", "done", "unknown"];
  let targetStatus: string | undefined;
  for (const status of statuses) {
    const column = columnByStatus(app, status);
    if ((await column.count()) > 0 && (await cardsInColumn(app, status).count()) > 0) {
      targetStatus = status;
      break;
    }
  }
  test.skip(!targetStatus, "no populated status column found to toggle");
  const status = targetStatus as string;

  // ponytail: stabilizes the pre-toggle read against a pane.created/closed
  // burst happening right at snapshot time. We deliberately do NOT assert
  // the post-restore count equals this snapshot: real herdr state here
  // churns fast enough (observed 7->9->7->10->9 within a few seconds) that
  // any exact-equality assertion taken before vs. after the toggle click is
  // comparing against data that's already gone stale by the time it runs.
  // The state-agnostic invariant that actually holds regardless of churn
  // rate is "toggled off -> exactly empty, toggled back on -> non-empty
  // again", not "toggled back on -> exactly what it was before".
  const cardsBefore = await waitForStableCount(cardsInColumn(app, status));
  expect(cardsBefore).toBeGreaterThan(0);

  await statusChip(app, status).click();
  await expect(columnByStatus(app, status)).toHaveCount(0);

  await statusChip(app, status).click();
  await expect(columnByStatus(app, status)).toHaveCount(1);
});

test("toggling the local host chip off hides cards, toggling back restores them", async ({ app }) => {
  const cards = allCards(app);
  await expect(cards.first()).toBeVisible({ timeout: 10_000 });
  // ponytail: same reasoning as the status-filter test above — real herdr
  // state here churns too fast for a pre-toggle snapshot to still be valid
  // by the time the post-restore assertion runs, so we assert "hidden then
  // non-empty again" rather than "restored to the exact same count".
  const countBefore = await waitForStableCount(cards);
  expect(countBefore).toBeGreaterThan(0);

  await hostChip(app, "local").click();
  await expect(cards).toHaveCount(0);

  await hostChip(app, "local").click();
  await expect(cards.first()).toBeVisible({ timeout: 5_000 });
  expect(await cards.count()).toBeGreaterThan(0);
});
