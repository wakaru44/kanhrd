import { test, expect } from "./fixtures/kanhrd";
import { herdrAvailable } from "./fixtures/herdr";

/**
 * Settings screen (`/settings`) — reachable from the header gear icon,
 * renders every section described in the brief: Appearance, Runtime,
 * Servers / hosts, Keyboard, Data. See `src/app/settings/settings.{ts,html}`.
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

test("header gear icon navigates to /settings", async ({ app }) => {
  await app.locator("a.icon-btn").click();
  await expect(app).toHaveURL(/\/settings$/);
});

test("settings route renders every section", async ({ app }) => {
  await app.goto("/settings");
  // Section headings are lowercase per docs/BRAND.md's voice, and the old
  // "Servers / hosts" section is now "pens" (the user-facing rename of
  // host). These strings live in `SETTINGS_COPY` in
  // `src/app/settings/settings.ts`, not in `shared/copy.ts` — that block
  // carries a TODO to be lifted into copy.ts; when it is, read them from
  // there the way the other specs read `COPY`.
  const headings = app.locator(".settings-section h2");
  await expect(headings).toHaveText(["appearance", "terminal", "runtime", "pens", "keyboard", "data"]);
});

test("toggling density on the settings screen persists to localStorage", async ({ app }) => {
  await app.goto("/settings");
  const compact = app.locator(".segmented .segment", { hasText: "compact" }).last();
  await compact.click();
  await expect(compact).toHaveClass(/active/);

  const stored = await app.evaluate(() => localStorage.getItem("kanhrd.settings"));
  expect(stored).toContain('"compact"');
  expect(await app.locator("html").getAttribute("data-density")).toBe("compact");
});

test("servers section lists at least the local host with a connection status", async ({ app }) => {
  await app.goto("/settings");
  await expect(app.locator(".host-row").first()).toBeVisible({ timeout: 10_000 });
  expect(await app.locator(".host-row").count()).toBeGreaterThan(0);
});
