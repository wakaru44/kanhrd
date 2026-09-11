/**
 * LIVE-ONLY FOR NOW — this file needs a real herdr session and skips
 * without one, but its assertions are about SPA behaviour, not about
 * herdr's wire. Moving it onto the `page.route` mock fixture
 * (`helpers/mock-bridge.ts`) so it runs on any machine is task 4.2 of the
 * `add-test-herdr-isolation` change; until then its coverage is only real
 * on a machine with herdr installed.
 *
 * The session it drives is the run's own throwaway one
 * (`kanhrd-test-e2e`), started, seeded and disposed of by
 * `fixtures/isolated-bridge.mjs` — never the operator's.
 */
import { test, expect } from './fixtures/kanhrd';
import { herdrAvailable } from './fixtures/herdr';
import { waitForStableCount } from './helpers/wait';
import type { Locator, Page } from '@playwright/test';

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
  return page.locator('.rail');
}

function scopePill(page: Page): Locator {
  return page.locator('.scope-pill');
}

test('clicking a rail tab navigates to /workspace/:id/tab/:id, shows the scope pill, and scopes the board', async ({
  app,
}) => {
  // The rail renders once `pane.list` lands; an instantaneous `.count()`
  // right after navigation can snapshot an empty rail and skip a test that
  // should have run.
  const tabRows = rail(app).locator('.tab-row');
  const count = await waitForStableCount(tabRows);
  test.skip(count < 1, 'no tabs in the rail to click');

  const firstTab = tabRows.first();
  const tabName = (await firstTab.locator('.tab-name').textContent())?.trim();

  await firstTab.click();

  await expect(app).toHaveURL(/\/workspace\/[^/]+\/tab\/[^/]+$/, { timeout: 5_000 });
  await expect(firstTab).toHaveClass(/active/);
  await expect(scopePill(app)).toBeVisible({ timeout: 3_000 });
  if (tabName) {
    await expect(scopePill(app)).toContainText(tabName);
  }

  // clicking × returns to unscoped `/`
  await scopePill(app).locator('.scope-pill-close').click();
  await expect(app).toHaveURL(/\/$/, { timeout: 5_000 });
  await expect(scopePill(app)).toBeHidden({ timeout: 3_000 });
});

test('clicking the active tab again navigates back to /', async ({ app }) => {
  const tabRows = rail(app).locator('.tab-row');
  test.skip((await waitForStableCount(tabRows)) < 1, 'no tabs in the rail to click');

  const firstTab = tabRows.first();
  await firstTab.click();
  await expect(app).toHaveURL(/\/workspace\//, { timeout: 5_000 });

  await firstTab.click();
  await expect(app).toHaveURL(/\/$/, { timeout: 5_000 });
});

test("an unmodified Escape does NOT clear the scope — the pill's own × does", async ({ app }) => {
  const tabRows = rail(app).locator('.tab-row');
  test.skip((await waitForStableCount(tabRows)) < 1, 'no tabs in the rail to click');

  await tabRows.first().click();
  await expect(scopePill(app)).toBeVisible({ timeout: 3_000 });
  const scopedUrl = app.url();

  // Escape is scoped to open app chrome only (App.onKeydown returns early
  // on an unmodified Escape with no chrome open — docs/UX-GUIDELINES.md,
  // "No global unmodified Escape and no global `?`"). A scope pill is not
  // chrome, so Escape must leave the URL alone; the visible × is the
  // documented affordance, and it is asserted in the first test above.
  await app.locator('body').click();
  await app.keyboard.press('Escape');
  await app.waitForTimeout(300);

  expect(app.url()).toBe(scopedUrl);
  await expect(scopePill(app)).toBeVisible();

  await scopePill(app).locator('.scope-pill-close').click();
  await expect(app).toHaveURL(/\/$/, { timeout: 5_000 });
});
