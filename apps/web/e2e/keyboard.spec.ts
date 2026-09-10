import type { Locator, Page } from "@playwright/test";
import { test, expect } from "./fixtures/kanhrd";
import { herdrAvailable, herdrPaneList } from "./fixtures/herdr";
import { allCards, cardOpenLink } from "./helpers/selectors";
import { COPY } from "../src/app/shared/copy";

/**
 * Herdr/tmux-style prefix keyboard shortcuts (L-KEYS). Default prefix
 * `Ctrl+B`, two-stage chord (press prefix, release, then the action key
 * within 2s) — see `src/app/state/keyboard.service.ts`. Semantic selectors
 * are kept local to this file rather than added to `helpers/selectors.ts`,
 * following `tier3.spec.ts`'s precedent for markup this suite doesn't own —
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

async function pressChord(page: Page, key: string): Promise<void> {
  await page.keyboard.press("Control+b");
  await page.keyboard.press(key);
}

// ---------------------------------------------------------------------------

test("a bare '?' is not a global binding", async ({ app }) => {
  await app.locator("body").click(); // make sure focus isn't inside a text input

  // An unmodified `?` is deliberately NOT forwarded at all
  // (`App.onKeydown` returns early on it — docs/UX-GUIDELINES.md,
  // "Keyboard-first, but the terminal owns its keys"): binding it globally
  // would break vim, less, fzf and every TUI running inside a card.
  await app.keyboard.press("?");
  await app.waitForTimeout(300);
  await expect(helpOverlay(app)).toHaveCount(0);
});

/*
 * APPLICATION DEFECT, NOT A STALE SPEC — this assertion is correct and is
 * left standing; `test.fixme` marks it as known-failing rather than
 * weakening it or deleting it.
 *
 * `App.onKeydown` (apps/web/src/app/app.ts) returns early for ANY
 * unmodified `?`, before `KeyboardService.handleKeydown` — which is where
 * the armed-chord state lives. So the second key of the documented
 * `prefix + ?` chord is swallowed exactly like a bare `?`, and
 * `KeyboardService.dispatchChordAction`'s `case "?": openHelp()` can never
 * be reached. The help overlay is currently unreachable by keyboard, and
 * the app header renders no visible help control either, while
 * `formatBinding` still advertises "? or Ctrl+B + ?" in the settings
 * shortcut table. Fix belongs in app.ts (let the guard fall through while
 * the chord is armed), which is outside this suite's writable scope.
 */
test.fixme("prefix+? opens the help overlay with every shortcut category", async ({ app }) => {
  await app.locator("body").click();

  await pressChord(app, "?");

  await expect(helpOverlay(app)).toBeVisible({ timeout: 3_000 });
  const headings = await helpOverlay(app).locator(".shortcut-group h3").allTextContents();
  expect(headings).toEqual([
    COPY.help.categories.Navigation,
    COPY.help.categories.Lifecycle,
    COPY.help.categories.View,
    COPY.help.categories.Help,
  ]);

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

test("an unmodified Escape with no app chrome open is left to the page", async ({ app }) => {
  // Escape is scoped to open chrome (help overlay, drawer, plus menu,
  // toasts) — never a global binding, or it breaks vim/less/fzf inside a
  // card. With nothing open it must change nothing, including the scope.
  await app.locator("body").click();
  await app.keyboard.press("Escape");
  await expect(app).toHaveURL(/\/$/);
  await expect(helpOverlay(app)).toHaveCount(0);
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

  await cardOpenLink(allCards(app).filter({ has: app.locator("a.card-open") }).first()).click();
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
