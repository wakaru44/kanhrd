import { test, expect } from "./fixtures/kanhrd";
import { herdrAvailable } from "./fixtures/herdr";
import { allCards, cardHostChip, filterBar, hostChip, xtermElement, xtermRows } from "./helpers/selectors";
import { waitFor } from "./helpers/wait";

/**
 * Mobile-viewport smoke suite. Runs only under the `mobile` Playwright
 * project (`devices['iPhone 13']`, ~390x844) — see `playwright.config.ts`.
 * Reuses the same board/terminal fixtures as tier1/tier2; this file adds
 * mobile-specific layout assertions instead of re-testing desktop behavior.
 *
 * Note: `.rail` (apps/web/src/app/board/board.scss) is `display: none` below
 * a 900px viewport width, and `.board-grid` switches to horizontal
 * scroll-snap columns below 1100px — both are intentional at the iPhone 13's
 * 390px width, not bugs.
 *
 * `.plus-button`/`.plus-menu` and `.chip`/`.host-chip`/`.status-chip`
 * selectors below aren't in helpers/selectors.ts (out of this lane's file
 * scope) and are inlined here instead.
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

test("board renders at mobile viewport with at least one card", async ({ app }) => {
  const cards = allCards(app);
  await expect(cards.first()).toBeVisible({ timeout: 10_000 });
  expect(await cards.count()).toBeGreaterThan(0);
});

test("rail is hidden by default below the 900px breakpoint", async ({ app }) => {
  await expect(allCards(app).first()).toBeVisible({ timeout: 10_000 });
  // .rail is `display: none` under 900px (board.scss) — no visible toggle
  // affordance currently replaces it at this width. Both the <app-rail
  // class="rail"> host and its inner <nav class="rail"> match `.rail`;
  // target the `nav` landmark specifically to avoid a strict-mode conflict.
  await expect(app.locator("nav.rail")).toBeHidden();
});

test("card text stays within the viewport width", async ({ app }) => {
  const cards = allCards(app);
  await expect(cards.first()).toBeVisible({ timeout: 10_000 });
  const viewport = app.viewportSize();
  expect(viewport).not.toBeNull();
  const viewportWidth = viewport!.width;

  const first = cards.first();
  // .board-grid is a horizontally-scrollable strip below 1100px (board.scss)
  // — a card can legitimately sit in a column that's off-screen until
  // scrolled. Scroll it into view first so this test checks text
  // readability/overflow, not scroll position.
  await first.scrollIntoViewIfNeeded();
  for (const selector of [".agent-name", ".path", ".host-chip"]) {
    const el = first.locator(selector);
    if ((await el.count()) === 0) {
      continue;
    }
    const box = await el.first().boundingBox();
    expect(box).not.toBeNull();
    // Text element itself must not be wider than the viewport (readability
    // sanity), regardless of where its scrolled-to column sits.
    expect(box!.width).toBeLessThanOrEqual(viewportWidth);
  }
});

test("filter chips are tappable (measures against the 40x40px touch-target minimum)", async ({ app }) => {
  await expect(filterBar(app)).toBeVisible();
  const chips = app.locator(".chip");
  const count = await chips.count();
  expect(count).toBeGreaterThan(0);

  // Chips must at least be clickable (functional tap check) — this suite
  // owns e2e/*, not apps/web/src/**, so it can't resize them.
  await chips.first().click();
  await chips.first().click(); // toggle back off, leaves filter state as found

  const undersized: string[] = [];
  for (let i = 0; i < count; i++) {
    const box = await chips.nth(i).boundingBox();
    if (!box || box.width < 40 || box.height < 40) {
      undersized.push((await chips.nth(i).textContent())?.trim() ?? `chip[${i}]`);
    }
  }
  // Known layout gap, not asserted as a hard failure: sizing is owned by
  // L-UX, not this e2e lane (report-only per this lane's brief). Recorded
  // as a test annotation so it shows up in the HTML/list report without
  // failing the mobile project run.
  test.info().annotations.push({
    type: undersized.length > 0 ? "issue" : "info",
    description:
      undersized.length > 0
        ? `chips under the 40x40 touch-target minimum: ${undersized.join(", ")}`
        : "all chips meet the 40x40 touch-target minimum",
  });
});

test("clicking a card opens the terminal and xterm.js renders content", async ({ app, panePicker }) => {
  const cards = allCards(app);
  await expect(cards.first()).toBeVisible({ timeout: 10_000 });
  await cards.first().click();

  await expect(app).toHaveURL(new RegExp(`/pane/${panePicker.host}/`));
  await expect(xtermElement(app)).toBeVisible({ timeout: 3_000 });

  await waitFor(async () => ((await xtermRows(app).textContent()) ?? "").trim().length > 0, {
    timeoutMs: 3_000,
    message: "terminal never rendered non-empty pane content at mobile viewport",
  });
});

test("header plus menu opens without clipping off-screen", async ({ app }) => {
  const plusButton = app.locator(".plus-button");
  if ((await plusButton.count()) === 0) {
    test.skip(true, "plus menu not available for this bridge/capabilities configuration");
  }
  await expect(plusButton).toBeVisible();
  await plusButton.click();

  const menu = app.locator(".plus-menu");
  await expect(menu).toBeVisible();
  const box = await menu.boundingBox();
  const viewport = app.viewportSize();
  expect(box).not.toBeNull();
  expect(viewport).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(viewport!.width + 1);
});

test("no horizontal page-level scrollbar on the board", async ({ app }) => {
  await expect(allCards(app).first()).toBeVisible({ timeout: 10_000 });
  // Intentionally checks document scroll width, not .board-grid's own
  // overflow-x (that inner horizontal scroll is deliberate scroll-snap
  // paging below 1100px per board.scss, not a layout leak).
  const overflowsHorizontally = await app.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
  );
  expect(overflowsHorizontally).toBe(false);
});

test("toggling the local host chip still hides and restores cards at mobile width", async ({ app }) => {
  const cards = allCards(app);
  await expect(cards.first()).toBeVisible({ timeout: 10_000 });
  const hostName = (await cardHostChip(cards.first()).textContent())?.trim();
  test.skip(!hostName, "could not read host name from first card");

  await hostChip(app, hostName as string).click();
  await expect(cards).toHaveCount(0);

  await hostChip(app, hostName as string).click();
  await expect(cards.first()).toBeVisible({ timeout: 5_000 });
});
