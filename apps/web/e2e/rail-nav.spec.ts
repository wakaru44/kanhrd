import { test, expect } from "./fixtures/kanhrd";
import { herdrAvailable } from "./fixtures/herdr";
import type { Locator, Page } from "@playwright/test";

/**
 * Rail = navigator (decision locked, L-UX2): clicking a tab in the rail
 * navigates to `/workspace/:workspaceId/tab/:tabId` instead of just setting
 * a local filter signal. See `src/app/board/board.ts`'s route-sync effect
 * and `src/app/rail/rail.ts`'s `onTabClick`/`onWorkspaceClick`.
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

function rail(page: Page): Locator {
  return page.locator(".rail");
}

function scopePill(page: Page): Locator {
  return page.locator(".scope-pill");
}

test("clicking a rail tab navigates to /workspace/:id/tab/:id, shows the scope pill, and scopes the board", async ({
  app,
}) => {
  const tabRows = rail(app).locator(".tab-row");
  const count = await tabRows.count();
  test.skip(count < 1, "no tabs in the rail to click");

  const firstTab = tabRows.first();
  const tabName = (await firstTab.locator(".tab-name").textContent())?.trim();

  await firstTab.click();

  await expect(app).toHaveURL(/\/workspace\/[^/]+\/tab\/[^/]+$/, { timeout: 5_000 });
  await expect(firstTab).toHaveClass(/active/);
  await expect(scopePill(app)).toBeVisible({ timeout: 3_000 });
  if (tabName) {
    await expect(scopePill(app)).toContainText(tabName);
  }

  // clicking × returns to unscoped `/`
  await scopePill(app).locator(".scope-pill-close").click();
  await expect(app).toHaveURL(/\/$/, { timeout: 5_000 });
  await expect(scopePill(app)).toBeHidden({ timeout: 3_000 });
});

test("clicking the active tab again navigates back to /", async ({ app }) => {
  const tabRows = rail(app).locator(".tab-row");
  test.skip((await tabRows.count()) < 1, "no tabs in the rail to click");

  const firstTab = tabRows.first();
  await firstTab.click();
  await expect(app).toHaveURL(/\/workspace\//, { timeout: 5_000 });

  await firstTab.click();
  await expect(app).toHaveURL(/\/$/, { timeout: 5_000 });
});

test("Escape clears the scope pill", async ({ app }) => {
  const tabRows = rail(app).locator(".tab-row");
  test.skip((await tabRows.count()) < 1, "no tabs in the rail to click");

  await tabRows.first().click();
  await expect(scopePill(app)).toBeVisible({ timeout: 3_000 });

  await app.keyboard.press("Escape");

  await expect(app).toHaveURL(/\/$/, { timeout: 5_000 });
  await expect(scopePill(app)).toBeHidden({ timeout: 3_000 });
});
