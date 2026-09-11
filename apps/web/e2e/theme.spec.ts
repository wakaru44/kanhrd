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

/**
 * The board's washi/sumi choice. The header's `.theme-toggle` no longer
 * flips it in one click — it opens the theme panel (`shared/theme-panel`),
 * which carries a row for the board and a row for the terminal palette. The
 * board row writes `data-theme` on `<html>` and persists the choice to
 * `localStorage['kanhrd.theme']` — see `src/app/state/theme.service.ts`.
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

test('picking the other theme in the header panel switches data-theme and persists across reload', async ({
  app,
}) => {
  const html = app.locator('html');
  const initial = await html.getAttribute('data-theme');
  expect(initial === 'dark' || initial === 'light').toBe(true);
  const expectedToggled = initial === 'dark' ? 'light' : 'dark';

  await app.locator('.theme-toggle').click();
  const panel = app.locator('.theme-panel');
  await expect(panel).toBeVisible();
  await panel.locator('[role="radio"][aria-checked="false"]').click();

  // ThemeService applies `data-theme` via an `effect()`, which flushes
  // asynchronously (Angular's zoneless scheduler) — poll rather than
  // reading the attribute once right after the click.
  await expect(html).toHaveAttribute('data-theme', expectedToggled, { timeout: 3_000 });

  await app.reload();
  await expect(app.locator('.state.loading')).toHaveCount(0, { timeout: 10_000 });
  await expect(html).toHaveAttribute('data-theme', expectedToggled, { timeout: 3_000 });
});

test('the header control opens the panel instead of toggling, and shows the current theme', async ({
  app,
}) => {
  // The glyph is a lucide-angular <svg>, so `data-theme-shown` carries the
  // fact for assertions. It is the CURRENT theme now, not the target: the
  // button opens a panel, it does not switch anything.
  const theme = await app.locator('html').getAttribute('data-theme');
  const trigger = app.locator('.theme-toggle');
  await expect(trigger).toHaveAttribute('data-theme-shown', theme!);
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');

  await trigger.click();

  await expect(app.locator('.theme-panel')).toBeVisible();
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  await expect(app.locator('html')).toHaveAttribute('data-theme', theme!);

  await app.keyboard.press('Escape');
  await expect(app.locator('.theme-panel')).toHaveCount(0);
});
