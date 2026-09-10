import type { Locator, Page } from "@playwright/test";
import { test, expect } from "./fixtures/kanhrd";
import { herdrAvailable } from "./fixtures/herdr";
import {
  allCards,
  boardStrip,
  cardHostChip,
  cardOpenLink,
  cardOverflowTrigger,
  cardTitle,
  filterBar,
  hostChip,
  statusSwitcher,
  switcherSegments,
  xtermElement,
  xtermRows,
} from "./helpers/selectors";
import { waitFor } from "./helpers/wait";
import { COPY } from "../src/app/shared/copy";

/**
 * Mobile-viewport suite. Runs only under the `mobile` Playwright project
 * (`devices['iPhone 13']`, 390x844) — see `playwright.config.ts`.
 *
 * This file implements the numbered acceptance criteria in
 * `docs/UX-GUIDELINES.md` § "E2E-assertable requirements". Each test names
 * the criteria it covers, so a renumbering there is traceable here.
 *
 * Selectors come from `helpers/selectors.ts` where they are shared; the
 * mobile-only chrome (switcher segments, drawer, settings rows) is selected
 * locally, matching `tier3.spec.ts`'s precedent.
 */

const TOUCH_MIN = 40;

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

// --- local helpers ---------------------------------------------------------

function viewportWidth(page: Page): number {
  const viewport = page.viewportSize();
  if (!viewport) {
    throw new Error("mobile project must define a viewport");
  }
  return viewport.width;
}

/** `documentElement.scrollWidth <= clientWidth + 1` — the page never scrolls horizontally. */
async function expectNoPageHorizontalScroll(page: Page): Promise<void> {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, "document scrolls horizontally").toBeLessThanOrEqual(1);
}

async function expectTouchTarget(locator: Locator, label: string): Promise<void> {
  const box = await locator.boundingBox();
  expect(box, `${label} has no bounding box`).not.toBeNull();
  expect(box!.width, `${label} width`).toBeGreaterThanOrEqual(TOUCH_MIN);
  expect(box!.height, `${label} height`).toBeGreaterThanOrEqual(TOUCH_MIN);
}

/** Reads a design token off `:root`, e.g. `--card-compact-height` -> 44. */
async function tokenPx(page: Page, name: string): Promise<number> {
  const raw = await page.evaluate(
    (token) => getComputedStyle(document.documentElement).getPropertyValue(token).trim(),
    name,
  );
  const value = Number.parseFloat(raw);
  expect(Number.isFinite(value), `token ${name} is not a px value: "${raw}"`).toBe(true);
  return value;
}

interface StripGeometry {
  scrollLeft: number;
  clientWidth: number;
  index: number;
}

async function stripGeometry(page: Page): Promise<StripGeometry> {
  return page.evaluate(() => {
    const strip = document.querySelector<HTMLElement>(".board-strip");
    if (!strip) {
      throw new Error(".board-strip is not rendered");
    }
    const clientWidth = strip.clientWidth;
    return {
      scrollLeft: strip.scrollLeft,
      clientWidth,
      index: clientWidth > 0 ? Math.round(strip.scrollLeft / clientWidth) : 0,
    };
  });
}

/** Waits for the strip's scroll to stop moving, then returns its settled geometry. */
async function settledStrip(page: Page): Promise<StripGeometry> {
  let previous = -1;
  await waitFor(
    async () => {
      const { scrollLeft } = await stripGeometry(page);
      const stable = Math.abs(scrollLeft - previous) < 0.5;
      previous = scrollLeft;
      return stable;
    },
    { timeoutMs: 5_000, intervalMs: 150, message: "board strip never settled" },
  );
  return stripGeometry(page);
}

/** Scrolls the strip by `pages` viewports, then waits for the snap to settle. */
async function swipeStrip(page: Page, pages: number): Promise<StripGeometry> {
  await page.evaluate((count) => {
    const strip = document.querySelector<HTMLElement>(".board-strip");
    strip?.scrollBy({ left: strip.clientWidth * count, behavior: "smooth" });
  }, pages);
  return settledStrip(page);
}

/** The `app-column` for the status at `index` in the switcher's order. */
function columnAt(page: Page, index: number): Locator {
  return boardStrip(page).locator("app-column").nth(index);
}

/**
 * The first card that renders an action cluster, or `null` when no
 * lifecycle capability is advertised. Capabilities arrive over the socket
 * *after* the first cards render, so this waits rather than snapshotting
 * `.count()` the instant the board paints.
 */
async function cardWithActions(page: Page): Promise<Locator | null> {
  const card = allCards(page).filter({ has: page.locator(".card-actions") }).first();
  try {
    await expect(card).toBeVisible({ timeout: 5_000 });
  } catch {
    return null;
  }
  return card;
}

function railNav(page: Page): Locator {
  // Both `<app-rail class="rail">` and its inner `<nav class="rail">` match
  // `.rail`; the nav landmark is the unambiguous one.
  return page.locator("nav.rail");
}

// --- board, populated (criteria 1-9) --------------------------------------

test("board renders at mobile viewport with at least one card", async ({ app }) => {
  const cards = allCards(app);
  await expect(cards.first()).toBeVisible({ timeout: 10_000 });
  expect(await cards.count()).toBeGreaterThan(0);
});

test("[1] the board page never scrolls horizontally", async ({ app }) => {
  await expect(allCards(app).first()).toBeVisible({ timeout: 10_000 });
  // The paging strip's own overflow-x is the one permitted horizontal
  // scroller (docs/UX-GUIDELINES.md, "Horizontal overflow rule"); the
  // document must not scroll.
  await expectNoPageHorizontalScroll(app);
});

test("[2] nav.rail is hidden on load below the 900px breakpoint", async ({ app }) => {
  await expect(allCards(app).first()).toBeVisible({ timeout: 10_000 });
  await expect(railNav(app)).toBeHidden();
});

test("[3] every visible card renders the compact variant", async ({ app }) => {
  const cards = allCards(app);
  await expect(cards.first()).toBeVisible({ timeout: 10_000 });
  const compactHeight = await tokenPx(app, "--card-compact-height");

  const count = Math.min(await cards.count(), 8);
  for (let i = 0; i < count; i++) {
    const box = await cards.nth(i).boundingBox();
    expect(box, `card[${i}] has no bounding box`).not.toBeNull();
    expect(Math.abs(box!.height - compactHeight), `card[${i}] height ${box!.height}`).toBeLessThanOrEqual(1);
  }
});

test("[4] card title, host seal and overflow trigger fit and do not overlap", async ({ app }) => {
  const card = await cardWithActions(app);
  test.skip(card === null, "no host advertises a pane lifecycle capability — no card renders an overflow trigger");
  const width = viewportWidth(app);

  const parts: Array<[string, Locator]> = [
    ["title", cardTitle(card!)],
    ["host seal", cardHostChip(card!)],
    ["overflow trigger", cardOverflowTrigger(card!)],
  ];
  const boxes: Array<{ label: string; box: NonNullable<Awaited<ReturnType<Locator["boundingBox"]>>> }> = [];
  for (const [label, locator] of parts) {
    const box = await locator.boundingBox();
    expect(box, `${label} has no bounding box`).not.toBeNull();
    expect(box!.width, `${label} wider than the viewport`).toBeLessThanOrEqual(width);
    boxes.push({ label, box: box! });
  }

  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i]!;
      const b = boxes[j]!;
      const overlaps =
        a.box.x < b.box.x + b.box.width &&
        b.box.x < a.box.x + a.box.width &&
        a.box.y < b.box.y + b.box.height &&
        b.box.y < a.box.y + a.box.height;
      expect(overlaps, `${a.label} overlaps ${b.label}`).toBe(false);
    }
  }
});

test("[5][6] the overflow menu is reachable by role without hover and its items are tappable", async ({
  app,
}) => {
  const card = await cardWithActions(app);
  test.skip(card === null, "no host advertises a pane lifecycle capability — no card renders an overflow trigger");

  // No hover anywhere in this test: the trigger is visible on first render.
  const trigger = card!.getByRole("button", { name: /more actions/i });
  await expect(trigger).toBeVisible();
  await expectTouchTarget(trigger, "overflow trigger");

  await trigger.click();
  // The menu renders on a signal effect, so wait for it rather than taking
  // an instantaneous `.count()` snapshot.
  await expect(card!.locator(".overflow-menu")).toBeVisible();
  const items = card!.locator('.overflow-menu [role="menuitem"]');
  await expect(items).not.toHaveCount(0);
  const count = await items.count();
  for (let i = 0; i < count; i++) {
    await expectTouchTarget(items.nth(i), `menu item[${i}]`);
  }

  await app.keyboard.press("Escape");
  await expect(card!.locator(".overflow-menu")).toHaveCount(0);
});

test("[7] filter chips meet the 40x40px touch-target minimum and are tappable", async ({ app }) => {
  await expect(filterBar(app)).toBeVisible();
  const chips = app.locator(".chip");
  const count = await chips.count();
  expect(count).toBeGreaterThan(0);

  await chips.first().click();
  await chips.first().click(); // toggle back off, leaves filter state as found

  for (let i = 0; i < count; i++) {
    const label = (await chips.nth(i).textContent())?.trim() ?? `chip[${i}]`;
    await expectTouchTarget(chips.nth(i), `chip "${label}"`);
  }
});

test("[8] the + menu opens inside the viewport", async ({ app }) => {
  const plusButton = app.locator(".plus-button");
  test.skip(
    (await plusButton.count()) === 0,
    "plus menu not available for this bridge/capabilities configuration",
  );
  await expect(plusButton).toBeVisible();
  await expectTouchTarget(plusButton, "+ button");
  await plusButton.click();

  const menu = app.locator(".plus-menu");
  await expect(menu).toBeVisible();
  const box = await menu.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(viewportWidth(app) + 1);

  await app.keyboard.press("Escape");
});

test("[9] header hamburger, theme toggle and settings link are visible and tappable", async ({ app }) => {
  for (const [label, locator] of [
    ["hamburger", app.locator(".hamburger")],
    ["theme toggle", app.locator(".theme-toggle")],
    ["settings link", app.locator("header a.icon-btn")],
  ] as Array<[string, Locator]>) {
    await expect(locator, `${label} not visible`).toBeVisible();
    await expectTouchTarget(locator, label);
  }
});

// --- board paging (criteria 10-22) ----------------------------------------

test("[10] the strip and its columns declare the snap contract", async ({ app }) => {
  await expect(allCards(app).first()).toBeVisible({ timeout: 10_000 });
  const strip = boardStrip(app);
  await expect(strip).toHaveCSS("scroll-snap-type", "x mandatory");

  const columns = strip.locator("app-column");
  const count = await columns.count();
  expect(count).toBeGreaterThan(0);
  for (let i = 0; i < count; i++) {
    await expect(columns.nth(i)).toHaveCSS("scroll-snap-align", "start");
    await expect(columns.nth(i)).toHaveCSS("scroll-snap-stop", "always");
  }
});

test("[11] one column fills the strip and no neighbour peeks", async ({ app }) => {
  await expect(allCards(app).first()).toBeVisible({ timeout: 10_000 });
  const geometry = await settledStrip(app);
  const stripBox = await boardStrip(app).boundingBox();
  expect(stripBox).not.toBeNull();

  const columns = boardStrip(app).locator("app-column");
  const count = await columns.count();
  for (let i = 0; i < count; i++) {
    const box = await columns.nth(i).boundingBox();
    expect(box, `column[${i}] has no bounding box`).not.toBeNull();
    expect(
      Math.abs(box!.width - geometry.clientWidth),
      `column[${i}] is not the full strip width`,
    ).toBeLessThanOrEqual(1);

    if (i === geometry.index) {
      continue;
    }
    // Every other column lies entirely outside the strip's visible rect.
    const outside = box!.x + box!.width <= stripBox!.x + 1 || box!.x >= stripBox!.x + stripBox!.width - 1;
    expect(outside, `column[${i}] is partially visible beside the current one`).toBe(true);
  }
});

test("[12][14] one swipe advances exactly one column and never rests between pages", async ({ app }) => {
  await expect(allCards(app).first()).toBeVisible({ timeout: 10_000 });
  const start = await settledStrip(app);
  test.skip(
    (await boardStrip(app).locator("app-column").count()) < 2,
    "fewer than two visible status columns — nothing to page to",
  );
  expect(start.index).toBe(0);

  const after = await swipeStrip(app, 1);
  expect(Math.abs(after.scrollLeft - after.clientWidth), "did not settle one page across").toBeLessThanOrEqual(1);
  expect(after.index).toBe(start.index + 1);
  expect(after.scrollLeft % after.clientWidth).toBeLessThanOrEqual(1);
});

test.skip("[13] a hard fling does not skip a column", () => {
  // SKIPPED FOR AN ENVIRONMENTAL REASON, NOT AN APPLICATION ONE.
  //
  // `scroll-snap-stop: always` is declared on every column and is asserted
  // by criterion [10] above. Headless Chromium's synthesized gesture /
  // programmatic `scrollBy` path does not honour `scroll-snap-stop`: a bare
  // control page carrying only these CSS declarations and no kanhrd code
  // overshoots identically. Real iOS/Android honour it. Greening this would
  // mean either weakening the assertion or adding production JS to satisfy
  // a synthetic gesture — both are rejects. The declaration assertion in
  // [10] is the honest proxy; re-enable this when the runner grows a
  // gesture path that respects the property.
});

test("[15][16][17][18] the switcher reaches every status and is the strip's selection", async ({ app }) => {
  await expect(allCards(app).first()).toBeVisible({ timeout: 10_000 });
  const segments = switcherSegments(app);
  const columns = boardStrip(app).locator("app-column");
  const count = await segments.count();
  expect(count, "the mobile status switcher rendered no segments").toBeGreaterThan(0);
  expect(count, "one segment per visible column").toBe(await columns.count());

  for (let i = 0; i < count; i++) {
    await expectTouchTarget(segments.nth(i), `segment[${i}]`); // [18]

    await segments.nth(i).click(); // [15]
    const geometry = await settledStrip(app);
    expect(geometry.index, `tapping segment[${i}] did not page to its column`).toBe(i);

    // [16] exactly one selected segment, and it is the tapped one.
    for (let j = 0; j < count; j++) {
      await expect(segments.nth(j)).toHaveAttribute("aria-selected", j === i ? "true" : "false");
    }

    // [17] the selected segment shows the column's card count; the others show none.
    const renderedCards = await columnAt(app, i).locator(".card").count();
    await expect(segments.nth(i).locator(".segment-count")).toHaveText(String(renderedCards));
    for (let j = 0; j < count; j++) {
      if (j !== i) {
        await expect(segments.nth(j).locator(".segment-count")).toHaveCount(0);
      }
    }
  }

  // [16] a swipe moves the selection too — the strip and the switcher are one state.
  await segments.first().click();
  await settledStrip(app);
  test.skip(count < 2, "fewer than two visible status columns — nothing to swipe to");
  const swiped = await swipeStrip(app, 1);
  await expect(segments.nth(swiped.index)).toHaveAttribute("aria-selected", "true");
  await expect(segments.first()).toHaveAttribute("aria-selected", swiped.index === 0 ? "true" : "false");
});

test("[19] the switcher stays put while the current column's cards scroll", async ({ app }) => {
  await expect(allCards(app).first()).toBeVisible({ timeout: 10_000 });
  const switcher = statusSwitcher(app);
  await expect(switcher).toBeVisible();
  const before = await switcher.boundingBox();

  await app.evaluate(() => {
    const body = document.querySelector<HTMLElement>(".board-strip app-column .column-body");
    body?.scrollTo({ top: body.scrollHeight });
  });
  await app.waitForTimeout(200);

  await expect(switcher).toBeVisible();
  const after = await switcher.boundingBox();
  expect(before).not.toBeNull();
  expect(after).not.toBeNull();
  expect(Math.abs(after!.y - before!.y), "the switcher scrolled away with the cards").toBeLessThanOrEqual(1);
});

test("[20] hiding the current status leaves the strip on a visible column", async ({ app }) => {
  await expect(allCards(app).first()).toBeVisible({ timeout: 10_000 });
  const segments = switcherSegments(app);
  const before = await segments.count();
  test.skip(before < 2, "need at least two visible statuses to hide one and still have a page");

  const currentIndex = (await settledStrip(app)).index;
  const currentLabel = (await segments.nth(currentIndex).locator(".segment-label").textContent())?.trim();
  expect(currentLabel).toBeTruthy();
  const chip = app.locator(".status-chip", { hasText: currentLabel! });

  try {
    await chip.click();
    await expect(segments).toHaveCount(before - 1);
    await expect(app.locator(".status-chip", { hasText: currentLabel! })).toHaveAttribute(
      "aria-pressed",
      "false",
    );

    const settled = await settledStrip(app);
    expect(settled.index).toBeLessThan(before - 1);
    expect(settled.scrollLeft % settled.clientWidth).toBeLessThanOrEqual(1);
    await expect(segments.nth(settled.index)).toHaveAttribute("aria-selected", "true");
  } finally {
    await chip.click(); // restore the filter state this test found
    await expect(segments).toHaveCount(before);
  }
});

test("[21] hiding every status replaces the pager with the no-matches empty state", async ({ app }) => {
  await expect(allCards(app).first()).toBeVisible({ timeout: 10_000 });
  const chips = app.locator(".status-chip");
  const chipCount = await chips.count();

  for (let i = 0; i < chipCount; i++) {
    const chip = chips.nth(i);
    if ((await chip.getAttribute("aria-pressed")) === "true") {
      await chip.click();
    }
  }

  await expect(statusSwitcher(app)).toHaveCount(0);
  await expect(boardStrip(app)).toHaveCount(0);
  const emptyState = app.locator(".empty-state.no-matches");
  await expect(emptyState).toBeVisible();
  await expect(emptyState.locator("h2")).toHaveText(COPY.emptyState.noMatches);

  const clear = emptyState.locator(".action", { hasText: COPY.emptyState.noMatchesAction });
  await expect(clear).toBeVisible();
  await clear.click();

  // `clear filters` restores every column, which also restores the filter
  // state this test found.
  await expect(statusSwitcher(app)).toBeVisible();
});

test("[22] the board exposes no drag affordance on a status column", async ({ app }) => {
  await expect(allCards(app).first()).toBeVisible({ timeout: 10_000 });
  const offenders = await app.evaluate(() => {
    const found: string[] = [];
    if (document.querySelector("[cdkDrag], [cdkdrag], .cdk-drag, [cdkDropList], [cdkdroplist]")) {
      found.push("cdkDrag/cdkDropList");
    }
    if (document.querySelector('[draggable="true"]')) {
      found.push('draggable="true"');
    }
    for (const el of Array.from(document.querySelectorAll(".column, .column *, .card, .card *"))) {
      const cursor = getComputedStyle(el).cursor;
      if (cursor === "grab" || cursor === "grabbing") {
        found.push(`cursor:${cursor} on ${el.className}`);
      }
    }
    return found;
  });
  expect(offenders, "status columns must expose no drag affordance").toEqual([]);
});

// --- board, empty (criteria 23-24) ----------------------------------------

test.describe("board — no pens configured", () => {
  test.beforeEach(async ({ page }) => {
    // The board's pen list is an HTTP resource (`/api/hosts`,
    // `PanesStore.hostsResource`), so the no-pens state is reachable by
    // stubbing that one response — no herdr reconfiguration, and every
    // other path stays real.
    await page.route("**/api/hosts", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ hosts: [] }) }),
    );
    await page.goto("/");
    await expect(page.locator(".empty-state")).toBeVisible({ timeout: 10_000 });
  });

  test("[23] the config snippet scrolls inside its own block, never the page", async ({ page }) => {
    const snippets = page.locator(".config-snippet");
    expect(await snippets.count()).toBeGreaterThan(0);
    // The snippet block may overflow itself (it is its own scroller)...
    const overflowing = await snippets.first().evaluate((el) => el.scrollWidth >= el.clientWidth);
    expect(overflowing).toBe(true);
    // ...but the document may not.
    await expectNoPageHorizontalScroll(page);
  });

  test("[24] the copy button and operating-guide link are visible and tappable", async ({ page }) => {
    const copyButton = page.locator(".copy-action");
    await expect(copyButton).toBeVisible();
    await expectTouchTarget(copyButton, "copy button");

    const guideLink = page.locator(".guide-link");
    await expect(guideLink).toBeVisible();
    await expect(guideLink).toHaveText(COPY.emptyState.noPensDocsLink);
    await expectTouchTarget(guideLink, "operating-guide link");
  });
});

// --- pane detail (criteria 25-28) -----------------------------------------

test("[25][27] tapping a card opens the terminal, and the pane route does not scroll horizontally", async ({
  app,
  panePicker,
}) => {
  const cards = allCards(app);
  await expect(cards.first()).toBeVisible({ timeout: 10_000 });
  await cardOpenLink(cards.filter({ has: app.locator("a.card-open") }).first()).click();

  await expect(app).toHaveURL(new RegExp(`/pane/${panePicker.host}/`));
  await expect(xtermElement(app)).toBeVisible({ timeout: 5_000 });

  await waitFor(async () => ((await xtermRows(app).textContent()) ?? "").trim().length > 0, {
    timeoutMs: 5_000,
    message: "terminal never rendered non-empty pane content at mobile viewport",
  });

  await expectNoPageHorizontalScroll(app);
});

test("[26] the pane-detail back control is visible without scrolling and focusable first", async ({
  app,
  panePicker,
}) => {
  await app.goto(`/pane/${panePicker.host}/${panePicker.id}`);
  const back = app.locator(".detail-header .back");
  await expect(back).toBeVisible();
  await expect(back).toHaveText(new RegExp(COPY.nav.backToBoard));
  await expectTouchTarget(back, "back control");

  // Visible without scrolling: inside the viewport on first paint.
  const box = await back.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.y + box!.height).toBeLessThanOrEqual(app.viewportSize()!.height);

  const firstIsBack = await app.evaluate(() => {
    const header = document.querySelector(".detail-header");
    const focusable = header?.querySelector<HTMLElement>(
      'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    return focusable?.classList.contains("back") ?? false;
  });
  expect(firstIsBack, "the back control is not the header's first focusable element").toBe(true);
});

test("[28] with the terminal focused, Escape and ? reach the terminal, not the app", async ({
  app,
  panePicker,
}) => {
  await app.goto(`/pane/${panePicker.host}/${panePicker.id}`);
  await expect(app.locator(".xterm-rows")).toBeVisible({ timeout: 10_000 });
  await app.locator(".xterm-screen").click();
  await expect(app.locator(".xterm-helper-textarea")).toBeFocused({ timeout: 3_000 });

  const url = app.url();
  await app.keyboard.press("Escape");
  await app.keyboard.press("?");
  await app.waitForTimeout(300);

  expect(app.url()).toBe(url);
  await expect(app.locator("app-keyboard-help-overlay .modal")).toHaveCount(0);
});

// --- settings (criteria 29-31) --------------------------------------------

test("[29][30][31] the settings screen stacks, fits and stays tappable", async ({ app }) => {
  await app.goto("/settings");
  await expect(app.locator(".settings-section").first()).toBeVisible({ timeout: 10_000 });

  await expectNoPageHorizontalScroll(app); // [29]

  // [30] every row stacks: the label's box ends at or above the control's.
  const unstacked = await app.evaluate(() => {
    const bad: string[] = [];
    for (const row of Array.from(document.querySelectorAll<HTMLElement>(".setting-row"))) {
      const label = row.querySelector<HTMLElement>(".setting-label");
      const control = label?.nextElementSibling as HTMLElement | null;
      if (!label || !control) {
        continue;
      }
      const labelRect = label.getBoundingClientRect();
      const controlRect = control.getBoundingClientRect();
      if (labelRect.bottom > controlRect.top + 1) {
        bad.push(label.textContent?.trim() ?? "(unnamed row)");
      }
    }
    return bad;
  });
  expect(unstacked, "these setting rows are still side-by-side at 390px").toEqual([]);

  // [31] the controls the criteria name.
  await expectTouchTarget(app.locator("#terminal-theme"), "terminal-theme select");
  await expectTouchTarget(app.locator("#requested-poll-ms"), "poll override input");
  const segments = app.locator(".segmented .segment");
  await expect(segments).toHaveCount(2);
  await expectTouchTarget(segments.nth(0), "density segment 1");
  await expectTouchTarget(segments.nth(1), "density segment 2");
  await expectTouchTarget(app.locator(".settings-section .btn").first(), "theme button");
});

// --- nav drawer (criteria 32-36) ------------------------------------------

test("[32][35] the hamburger opens the drawer as an overlay and the backdrop closes it", async ({ app }) => {
  await expect(allCards(app).first()).toBeVisible({ timeout: 10_000 });
  const hamburger = app.locator(".hamburger");
  await expect(hamburger).toBeVisible();
  await expect(railNav(app)).toBeHidden();

  await hamburger.click();
  await expect(railNav(app)).toBeVisible({ timeout: 3_000 });
  await expect(app.locator(".rail-backdrop")).toBeVisible();

  // [35] every drawer row is tappable.
  const rows = railNav(app).locator(".workspace-row, .tab-row");
  const rowCount = await rows.count();
  for (let i = 0; i < rowCount; i++) {
    await expectTouchTarget(rows.nth(i), `drawer row[${i}]`);
  }

  // The drawer is pinned left and sits above the backdrop — click the
  // backdrop near the right edge so the click lands on it, not the drawer.
  await app.locator(".rail-backdrop").click({ position: { x: viewportWidth(app) - 5, y: 10 } });
  await expect(railNav(app)).toBeHidden();
  await expect(app.locator(".rail-backdrop")).toBeHidden();
});

test("[33][34] the open drawer traps focus, and Escape closes it and restores focus", async ({ app }) => {
  await expect(allCards(app).first()).toBeVisible({ timeout: 10_000 });
  const hamburger = app.locator(".hamburger");
  await hamburger.click();
  await expect(railNav(app)).toBeVisible({ timeout: 3_000 });

  // [33] focus moved into the drawer and Tab keeps it there.
  const insideAfterOpen = await app.evaluate(
    () => document.querySelector("nav.rail")?.contains(document.activeElement) ?? false,
  );
  expect(insideAfterOpen, "opening the drawer did not move focus into it").toBe(true);

  for (let i = 0; i < 8; i++) {
    await app.keyboard.press("Tab");
    const stillInside = await app.evaluate(
      () => document.querySelector("nav.rail")?.contains(document.activeElement) ?? false,
    );
    expect(stillInside, `Tab #${i + 1} left the drawer`).toBe(true);
  }

  // [34] Escape closes it — the drawer is app chrome, so Escape is scoped
  // to it (this is not a global binding).
  await app.keyboard.press("Escape");
  await expect(railNav(app)).toBeHidden({ timeout: 3_000 });
  await expect(hamburger).toBeFocused();
});

test("[36] crossing back above 900px with the drawer open restores the inline rail", async ({ app }) => {
  await expect(allCards(app).first()).toBeVisible({ timeout: 10_000 });
  await app.locator(".hamburger").click();
  await expect(railNav(app)).toBeVisible({ timeout: 3_000 });

  try {
    await app.setViewportSize({ width: 1000, height: 844 });
    await expect(railNav(app)).toBeVisible();
    await expect(app.locator(".rail-backdrop")).toBeHidden();
    await expect(statusSwitcher(app)).toHaveCount(0);
  } finally {
    await app.setViewportSize({ width: 390, height: 844 });
  }
});

// --- toasts (criteria 37-38) ----------------------------------------------

test.describe("toasts at 390px", () => {
  /**
   * Forces exactly one bridge method (`pane.close`) to fail while proxying
   * every other frame to the real bridge — the same interception
   * `toasts.spec.ts` uses on desktop. Nothing is actually closed.
   */
  async function forceCloseFailure(page: Page): Promise<void> {
    await page.routeWebSocket(/\/ws$/, (ws) => {
      const server = ws.connectToServer();
      ws.onMessage((message) => {
        const text = typeof message === "string" ? message : message.toString();
        let parsed: { id?: string; method?: string } | null = null;
        try {
          parsed = JSON.parse(text) as { id?: string; method?: string };
        } catch {
          // not JSON — forward as-is
        }
        if (parsed?.method === "pane.close") {
          ws.send(
            JSON.stringify({
              id: parsed.id,
              ok: false,
              error: { code: "forced_e2e_failure", message: "forced failure for the mobile toast test" },
            }),
          );
          return;
        }
        server.send(text);
      });
      server.onMessage((message) => ws.send(message));
    });
    await page.goto("/");
    await expect(page.locator(".state.loading")).toHaveCount(0, { timeout: 10_000 });
  }

  /** Compact/touch: a card's close action lives only behind the overflow trigger. */
  async function requestCloseViaOverflow(page: Page): Promise<void> {
    const card = allCards(page).filter({ has: page.locator(".card-actions") }).first();
    await expect(card).toBeVisible({ timeout: 10_000 });
    await card.getByRole("button", { name: /more actions/i }).click();
    const close = card.locator('.overflow-menu [role="menuitem"].close');
    await expect(close).toBeVisible();
    await close.click();
  }

  test("[37] a toast stacks below the header, never over it", async ({ page }) => {
    await forceCloseFailure(page);
    test.skip((await cardWithActions(page)) === null, "no host advertises paneClose — nothing to fail");

    await requestCloseViaOverflow(page);
    await page.locator("app-confirm-modal .modal-actions .btn.primary").click();

    const toast = page.locator(".toast.error");
    await expect(toast).toBeVisible({ timeout: 5_000 });
    await expect(toast).toContainText(COPY.toast.closeFailed.split("{")[0]!.trim());

    const headerBox = await page.locator("header.app-header").boundingBox();
    const toastBox = await toast.boundingBox();
    expect(headerBox).not.toBeNull();
    expect(toastBox).not.toBeNull();
    expect(toastBox!.y, "the mobile toast stack covers the header controls").toBeGreaterThanOrEqual(
      headerBox!.y + headerBox!.height - 1,
    );
  });

  test("[38] a dialog's buttons stay hittable while a toast is showing", async ({ page }) => {
    await forceCloseFailure(page);
    test.skip((await cardWithActions(page)) === null, "no host advertises paneClose — nothing to fail");

    // First failure raises the toast...
    await requestCloseViaOverflow(page);
    await page.locator("app-confirm-modal .modal-actions .btn.primary").click();
    await expect(page.locator(".toast.error")).toBeVisible({ timeout: 5_000 });

    // ...then reopen the dialog while it is still showing. `keep` must be
    // hittable, and clicking it must actually dismiss the dialog.
    await requestCloseViaOverflow(page);
    const dialog = page.locator("app-confirm-modal .modal");
    await expect(dialog).toBeVisible();
    await expect(page.locator(".toast.error")).toBeVisible();

    const keep = dialog.locator(".modal-actions .btn:not(.primary)");
    const confirm = dialog.locator(".modal-actions .btn.primary");
    await expect(keep).toBeVisible();
    await expect(confirm).toBeVisible();
    await keep.click();
    await expect(dialog).toHaveCount(0);
  });
});

// --- filters still work at this width -------------------------------------

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
