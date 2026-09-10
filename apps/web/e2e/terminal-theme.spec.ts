import { test, expect } from "./fixtures/kanhrd";
import { herdrAvailable } from "./fixtures/herdr";

/**
 * Terminal theme picker (L-UX2, new feature): Settings > Terminal lets the
 * user pick a built-in xterm.js palette, applied uniformly to every open
 * terminal (`src/app/state/terminal-theme.service.ts`).
 *
 * xterm.js (v6) paints its theme background as an inline style on
 * `.xterm-scrollable-element`, a child of `.xterm-viewport` — verified
 * live by dumping every `[class*="xterm"]` element's computed
 * `background-color`; `.xterm`/`.xterm-viewport`/`.xterm-screen` themselves
 * stay transparent/black, so this targets the element that actually
 * carries the color.
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

test("changing the terminal theme to Monokai changes the open terminal's background color", async ({
  app,
  panePicker,
}) => {
  await app.goto("/settings");
  // Section headings are lowercase per docs/BRAND.md's voice.
  await expect(app.locator(".settings-section h2").first()).toHaveText("appearance");
  await expect(app.locator(".settings-section h2").nth(1)).toHaveText("terminal");

  const select = app.locator("#terminal-theme");
  await select.selectOption("monokai");
  await expect(select).toHaveValue("monokai");

  await app.goto(`/pane/${panePicker.host}/${panePicker.id}`);
  await expect(app.locator(".xterm-viewport")).toBeVisible({ timeout: 10_000 });
  const scrollable = app.locator(".xterm-scrollable-element");

  const bg = await scrollable.evaluate((el) => getComputedStyle(el).backgroundColor);
  // Monokai's background is #272822 -> rgb(39, 40, 34).
  expect(bg).toBe("rgb(39, 40, 34)");
});
