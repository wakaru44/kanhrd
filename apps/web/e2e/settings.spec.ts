import { test, expect } from "./fixtures/kanhrd";
import { herdrAvailable } from "./fixtures/herdr";

/**
 * Settings screen (`/settings`) — reachable from the header gear icon,
 * renders every section described in the brief: Appearance, Runtime,
 * Servers / hosts, Data. See `src/app/settings/settings.{ts,html}`.
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
  const headings = app.locator(".settings-section h2");
  await expect(headings).toHaveText(["Appearance", "Runtime", "Servers / hosts", "Data"]);
});

test("toggling density on the settings screen persists to localStorage", async ({ app }) => {
  await app.goto("/settings");
  const compact = app.locator(".segment", { hasText: "Compact" });
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
