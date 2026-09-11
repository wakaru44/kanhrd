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
 * Dark/light theme toggle (L-UX polish pass). The header exposes a
 * `.theme-toggle` icon button that flips `data-theme` on `<html>` and
 * persists the choice to `localStorage['kanhrd.theme']` — see
 * `src/app/state/theme.service.ts`.
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

test('clicking the header theme toggle switches data-theme and persists across reload', async ({
  app,
}) => {
  const html = app.locator('html');
  const initial = await html.getAttribute('data-theme');
  expect(initial === 'dark' || initial === 'light').toBe(true);
  const expectedToggled = initial === 'dark' ? 'light' : 'dark';

  await app.locator('.theme-toggle').click();

  // ThemeService applies `data-theme` via an `effect()`, which flushes
  // asynchronously (Angular's zoneless scheduler) — poll rather than
  // reading the attribute once right after the click.
  await expect(html).toHaveAttribute('data-theme', expectedToggled, { timeout: 3_000 });

  await app.reload();
  await expect(app.locator('.state.loading')).toHaveCount(0, { timeout: 10_000 });
  await expect(html).toHaveAttribute('data-theme', expectedToggled, { timeout: 3_000 });
});

test('theme toggle button icon reflects the opposite theme (what clicking it switches to)', async ({
  app,
}) => {
  // The glyph became a lucide-angular <svg> icon (L-UX2 icon pass) —
  // `data-theme-target` on the button carries the same "what clicking this
  // switches to" fact for assertions, now that there's no text to read.
  const theme = await app.locator('html').getAttribute('data-theme');
  const expectedTarget = theme === 'dark' ? 'light' : 'dark';
  await expect(app.locator('.theme-toggle')).toHaveAttribute('data-theme-target', expectedTarget);
});
