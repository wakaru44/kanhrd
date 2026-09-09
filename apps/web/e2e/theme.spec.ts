import { test, expect } from "./fixtures/kanhrd";
import { herdrAvailable } from "./fixtures/herdr";

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

test("clicking the header theme toggle switches data-theme and persists across reload", async ({ app }) => {
  const html = app.locator("html");
  const initial = await html.getAttribute("data-theme");
  expect(initial === "dark" || initial === "light").toBe(true);
  const expectedToggled = initial === "dark" ? "light" : "dark";

  await app.locator(".theme-toggle").click();

  // ThemeService applies `data-theme` via an `effect()`, which flushes
  // asynchronously (Angular's zoneless scheduler) — poll rather than
  // reading the attribute once right after the click.
  await expect(html).toHaveAttribute("data-theme", expectedToggled, { timeout: 3_000 });

  await app.reload();
  await expect(app.locator(".state.loading")).toHaveCount(0, { timeout: 10_000 });
  await expect(html).toHaveAttribute("data-theme", expectedToggled, { timeout: 3_000 });
});

test("theme toggle button label reflects the opposite theme (what clicking it switches to)", async ({ app }) => {
  const theme = await app.locator("html").getAttribute("data-theme");
  const expectedGlyph = theme === "dark" ? "☀" : "☾";
  await expect(app.locator(".theme-toggle")).toHaveText(expectedGlyph);
});
