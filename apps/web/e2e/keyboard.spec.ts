import type { Locator, Page } from "@playwright/test";
import { test, expect } from "./fixtures/kanhrd";
import { herdrAvailable, herdrPaneList } from "./fixtures/herdr";
import { allCards } from "./helpers/selectors";

/**
 * Herdr/tmux-style prefix keyboard shortcuts (L-KEYS). Default prefix
 * `Ctrl+B`, two-stage chord (press prefix, release, then the action key
 * within 2s) — see `src/app/state/keyboard.service.ts`. Semantic selectors
 * are kept local to this file rather than added to `helpers/selectors.ts`,
 * following `tier3.spec.ts`'s precedent for markup this lane doesn't own —
 * see `src/app/{shared/keyboard-help-overlay,rail,board}.html` for source.
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

// --- local selectors -------------------------------------------------------

function helpOverlay(page: Page): Locator {
  return page.locator("app-keyboard-help-overlay .modal");
}

function plusButton(page: Page): Locator {
  return page.locator(".plus-button");
}

function plusMenu(page: Page): Locator {
  return page.locator(".plus-menu");
}

function railElement(page: Page): Locator {
  return page.locator(".rail");
}

async function pressChord(page: Page, key: string): Promise<void> {
  await page.keyboard.press("Control+b");
  await page.keyboard.press(key);
}

// ---------------------------------------------------------------------------

test("'?' opens the help overlay with every shortcut category", async ({ app }) => {
  await app.locator("body").click(); // make sure focus isn't inside a text input
  await app.keyboard.press("?");

  await expect(helpOverlay(app)).toBeVisible({ timeout: 3_000 });
  const headings = await helpOverlay(app).locator(".shortcut-group h3").allTextContents();
  expect(headings).toEqual(["Navigation", "Lifecycle", "View", "Help"]);

  await app.keyboard.press("Escape");
  await expect(helpOverlay(app)).toBeHidden({ timeout: 3_000 });
});

test("prefix+t toggles the theme via KeyboardService -> ThemeService", async ({ app }) => {
  const html = app.locator("html");
  const initial = await html.getAttribute("data-theme");
  expect(initial === "dark" || initial === "light").toBe(true);
  const expectedToggled = initial === "dark" ? "light" : "dark";

  await pressChord(app, "t");

  await expect(html).toHaveAttribute("data-theme", expectedToggled, { timeout: 3_000 });
});

test("prefix+n on the board advances the rail's tab filter", async ({ app }) => {
  const tabRows = app.locator(".tab-row");
  const count = await tabRows.count();
  test.skip(count < 2, "needs at least 2 tabs in the rail to observe next-tab advancing");

  // Establish a known "current tab" first: click the first tab row.
  await tabRows.first().click();
  await expect(tabRows.first()).toHaveClass(/active/, { timeout: 3_000 });

  await pressChord(app, "n");

  // prefix+n must move the active tab filter off the first row.
  await expect(tabRows.first()).not.toHaveClass(/active/, { timeout: 3_000 });
  const activeCount = await app.locator(".tab-row.active").count();
  expect(activeCount).toBe(1);
});

test("Escape closes the plus-menu", async ({ app }) => {
  test.skip(!(await plusButton(app).isVisible()), "no host advertises a lifecycle-create capability");

  await plusButton(app).click();
  await expect(plusMenu(app)).toBeVisible({ timeout: 3_000 });

  await app.keyboard.press("Escape");
  await expect(plusMenu(app)).toBeHidden({ timeout: 3_000 });
});

test("focused terminal swallows prefix+c: Ctrl+B reaches xterm.js, not the app shortcut", async ({ app }) => {
  const before = await herdrPaneList();

  await allCards(app).first().click();
  await expect(app.locator(".xterm-rows")).toBeVisible({ timeout: 10_000 });

  // Click into the visible terminal grid — xterm.js focuses its hidden
  // `.xterm-helper-textarea` input itself on click (that textarea is
  // typically positioned off-viewport, so clicking it directly can fail).
  await app.locator(".xterm-screen").click();
  await expect(app.locator(".xterm-helper-textarea")).toBeFocused({ timeout: 3_000 });

  await pressChord(app, "c");

  // Give the (suppressed) chord a moment to have fired if suppression were
  // broken, then confirm no new pane was created via the herdr CLI —
  // independent of the browser/bridge, per the brief's own "verify
  // indirectly" guidance for this scenario.
  await app.waitForTimeout(500);
  const after = await herdrPaneList();
  expect(after.length).toBe(before.length);
});
