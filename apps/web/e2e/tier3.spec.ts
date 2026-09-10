import { test, expect } from "./fixtures/kanhrd";
import { herdr, herdrAvailable } from "./fixtures/herdr";
import { allCards, cardActions, cardOverflowTrigger, xtermElement, xtermRows } from "./helpers/selectors";
import { COPY } from "../src/app/shared/copy";
import { waitFor, waitForStableCount } from "./helpers/wait";
import type { Locator, Page } from "@playwright/test";

/**
 * Tier-3: pane/tab/workspace lifecycle CRUD (split/close pane, tab CRUD,
 * workspace CRUD, workspace rail, cascade purge, destructive-op
 * confirmation, capability gating, cold-load pane-detail routing).
 * Mirrors CONTRACT-TIER3.md and L3C's UX notes (tmp/foreman/kanhrd.md):
 * header "+" acts on a single "primary host"; "New tab"/"New workspace"
 * create-then-rename via an inline edit field; the tier-2 cold-load gap
 * (apps/web/e2e/README.md) is fixed, so this suite is the first to exercise
 * `page.goto('/pane/:host/:id')` directly instead of working around it.
 *
 * Semantic selectors for tier-3 markup are kept local to this file (rather
 * than added to `helpers/selectors.ts`, which is out of this lane's writable
 * scope) — see apps/web/src/app/{rail,board,shared}/*.html for the source
 * markup these are read off.
 *
 * Every test that creates herdr state (tabs) cleans it up itself, via the
 * UI where the flow under test already does so, or a `herdr` CLI fallback
 * in `finally`/`afterEach` otherwise — no leaked throwaway tabs. Throwaway
 * names are timestamped (`kanhrd-e2e-...`) so a crashed run's orphans are
 * identifiable and safe to remove by hand.
 */

// --- local selectors (tier-3 markup only) ---------------------------------

function plusButton(page: Page): Locator {
  return page.locator(".plus-button");
}

function plusMenuItem(page: Page, label: string): Locator {
  return page.locator(".plus-menu button", { hasText: label });
}

function rail(page: Page): Locator {
  return page.locator(".rail");
}

function tabRowByName(page: Page, name: string): Locator {
  return rail(page).locator(".tab-row", { hasText: name });
}

function tabRowInEditMode(page: Page): Locator {
  return rail(page).locator(".tab-row").filter({ has: page.locator(".edit-input") });
}

function railEditInput(page: Page): Locator {
  return rail(page).locator(".edit-input");
}

function workspaceRowByName(page: Page, name: string): Locator {
  return rail(page).locator(".workspace-row", { hasText: name });
}

function modal(page: Page): Locator {
  return page.locator(".modal");
}

function modalTitle(page: Page): Locator {
  return modal(page).locator(".modal-title");
}

/**
 * The modal's confirm button. `--danger-fill` is reserved for irrecoverable
 * local-data loss (docs/UX-GUIDELINES.md, "Destructive confirmations"), so a
 * pane close is `.btn.primary` without `.danger` while the rail's
 * lane/field closes still pass `[danger]="true"` — match on `.primary`,
 * which both carry.
 */
function modalConfirm(page: Page): Locator {
  return modal(page).locator(".modal-actions .btn.primary");
}

function modalCancelButton(page: Page): Locator {
  // The non-primary button in the two-button (non-refusal) modal layout.
  return modal(page).locator(".modal-actions .btn:not(.primary)");
}

function modalRefusalBody(page: Page): Locator {
  return modal(page).locator(".modal-body.refusal");
}

function cardCloseButton(card: Locator): Locator {
  return card.locator(".card-action.close");
}

/** A rail row's overflow-menu trigger — rail row actions are never hover-revealed. */
function rowMenuTrigger(row: Locator): Locator {
  return row.locator(".row-menu-trigger");
}

/** An item inside an open rail row overflow menu. */
function rowMenuItem(row: Locator, label: string): Locator {
  return row.locator(".row-menu .row-menu-item", { hasText: label });
}

/** Opens a rail row's overflow menu and clicks one of its items. No hover involved. */
async function openRowMenuAndClick(row: Locator, label: string): Promise<void> {
  await expect(rowMenuTrigger(row)).toBeVisible();
  await rowMenuTrigger(row).click();
  await rowMenuItem(row, label).click();
}

// --- herdr-side verification helpers (thin wrappers over the shared `herdr` CLI helper) ---

interface HerdrTabSummary {
  tab_id: string;
  workspace_id: string;
  label: string;
}

async function herdrTabList(): Promise<HerdrTabSummary[]> {
  const { stdout, code } = await herdr(["tab", "list"]);
  if (code !== 0) return [];
  const parsed = JSON.parse(stdout) as { result?: { tabs?: HerdrTabSummary[] } };
  return parsed.result?.tabs ?? [];
}

interface HerdrWorkspaceSummary {
  workspace_id: string;
  label: string;
}

async function herdrWorkspaceList(): Promise<HerdrWorkspaceSummary[]> {
  const { stdout, code } = await herdr(["workspace", "list"]);
  if (code !== 0) return [];
  const parsed = JSON.parse(stdout) as { result?: { workspaces?: HerdrWorkspaceSummary[] } };
  return parsed.result?.workspaces ?? [];
}

/** Best-effort direct-CLI cleanup for a throwaway tab, used as a `finally` fallback when a test's own UI-driven close didn't run (e.g. an assertion failed first). Never throws. */
async function herdrCloseTabIfPresent(tabId: string | undefined): Promise<void> {
  if (!tabId) return;
  try {
    await herdr(["tab", "close", tabId]);
  } catch {
    // best-effort; a leaked throwaway tab is logged by name for manual cleanup, not fatal to the run
  }
}

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

// --- cold-load pane detail -------------------------------------------------

test("cold-loading a pane detail URL directly mounts a live terminal (L-E2E's gap, now fixed)", async ({
  app,
  panePicker,
}) => {
  // `app` already visited "/" (via the fixture) to resolve `panePicker`, but
  // `page.goto()` below is a real full-page navigation regardless of prior
  // page state — this is the same "cold deep-link load" tier-2's README
  // flagged as broken (zero pane.read/pane.subscribe_output calls fired).
  await app.goto(`/pane/${panePicker.host}/${panePicker.id}`);

  await expect(xtermElement(app)).toBeVisible({ timeout: 3_000 });

  await waitFor(async () => ((await xtermRows(app).textContent()) ?? "").trim().length > 0, {
    timeoutMs: 3_000,
    message: "cold-loaded pane detail never rendered non-empty terminal content — pane.read likely never fired",
  });
});

// --- capability gating ------------------------------------------------------

test("card split and close affordances are visible on first render, no hover", async ({ app }) => {
  const cards = allCards(app);
  await expect(cards.first()).toBeVisible({ timeout: 10_000 });
  const card = cards.filter({ has: app.locator(".card-actions") }).first();
  test.skip(
    (await card.count()) === 0,
    "no host advertises a pane lifecycle capability — no card renders an action cluster",
  );

  const actions = cardActions(card);
  // The hover-reveal (`.card-actions { opacity: 0; pointer-events: none }`)
  // is deleted: actions render at --ink-mute and lift on hover/focus
  // (docs/UX-GUIDELINES.md, "Visible affordances"). The split control also
  // split in two: `.split-right` and `.split-down`.
  await expect(actions).toBeVisible();
  await expect(actions).toHaveCSS("opacity", "1");
  await expect(actions.locator(".card-action.split-right")).toHaveCount(1);
  await expect(actions.locator(".card-action.split-down")).toHaveCount(1);
  await expect(actions.locator(".card-action.close")).toHaveCount(1);

  // The overflow trigger is rendered but `display: none` at comfortable
  // density on a fine pointer — it is the compact/touch path, and the
  // mobile project asserts it there (mobile.spec.ts, criteria 5 and 6).
  // Here it only has to exist, so the two paths cannot drift apart.
  await expect(cardOverflowTrigger(card)).toHaveCount(1);
  await expect(cardOverflowTrigger(card)).toBeHidden();
});

// --- tab CRUD lifecycle (throwaway tab) -------------------------------------

test.describe("tab CRUD lifecycle", () => {
  let createdTabId: string | undefined;

  test.afterEach(async () => {
    await herdrCloseTabIfPresent(createdTabId);
    createdTabId = undefined;
  });

  test("create (via + menu, inline rename) then close (via rail ×) a throwaway tab", async ({ app }) => {
    const before = await herdrTabList();
    // The rail renders once `pane.list` lands, so an instantaneous count
    // right after the fixture's navigation can snapshot an empty rail.
    const beforeCount = await waitForStableCount(rail(app).locator(".tab-row"));

    await plusButton(app).click();
    await expect(plusMenuItem(app, "New tab")).toBeVisible();
    await plusMenuItem(app, "New tab").click();

    // New tab shows up in the rail within 2s.
    await expect(rail(app).locator(".tab-row")).toHaveCount(beforeCount + 1, { timeout: 2_000 });

    // Immediately in inline-rename mode (create-then-rename UX, per L3C's notes).
    const editInput = tabRowInEditMode(app).locator(".edit-input");
    await expect(editInput).toBeVisible({ timeout: 2_000 });

    const name = `kanhrd-e2e-${Date.now()}`;
    await editInput.fill(name);
    await editInput.press("Enter");

    await expect(tabRowByName(app, name)).toBeVisible({ timeout: 2_000 });
    await expect(railEditInput(app)).toHaveCount(0);

    // Verify herdr's own side actually has the new tab, independent of the browser.
    await waitFor(
      async () => {
        const tabs = await herdrTabList();
        const created = tabs.find((t) => t.label === name && !before.some((b) => b.tab_id === t.tab_id));
        if (created) createdTabId = created.tab_id;
        return created !== undefined;
      },
      { timeoutMs: 3_000, message: `tab "${name}" never appeared in herdr's own tab list` },
    );

    // Close it via the rail: visible overflow trigger -> menu item -> confirm.
    const row = tabRowByName(app, name);
    await openRowMenuAndClick(row, COPY.confirm.closeLaneAction);

    await expect(modalTitle(app)).toHaveText(COPY.confirm.closeLane);
    await modalConfirm(app).click();

    await expect(tabRowByName(app, name)).toHaveCount(0, { timeout: 2_000 });

    await waitFor(async () => !(await herdrTabList()).some((t) => t.tab_id === createdTabId), {
      timeoutMs: 3_000,
      message: `tab "${name}" (${createdTabId}) was closed in the UI but still exists on herdr's side`,
    });
    createdTabId = undefined; // already gone — nothing for afterEach to clean up
  });
});

// --- workspace close guardrail (negative test, no destruction) -------------

test("closing the only open workspace shows a refusal with no confirm button (does not close it)", async ({
  app,
}) => {
  const workspaces = await herdrWorkspaceList();
  test.skip(
    workspaces.length !== 1,
    `this host has ${workspaces.length} open workspace(s); the last-workspace guardrail can only be safely ` +
      "exercised (without destroying a real workspace) when there is exactly one open — skipping rather than " +
      "closing any of the user's real workspaces to force the scenario",
  );
  const target = workspaces[0]!;

  const row = workspaceRowByName(app, target.label);
  await expect(row).toBeVisible({ timeout: 5_000 });
  await openRowMenuAndClick(row, COPY.confirm.closeFieldAction);

  await expect(modalTitle(app)).toHaveText(COPY.confirm.closeField);
  await expect(modalRefusalBody(app)).toBeVisible();
  // Refusal mode renders no confirm button at all — only a dismiss action.
  await expect(modalConfirm(app)).toHaveCount(0);
  await expect(modal(app).locator(".modal-actions .btn")).toHaveCount(1);

  await modal(app).locator(".modal-actions .btn").click();
  await expect(modal(app)).toHaveCount(0);

  // Still open — the workspace was never actually closed.
  const after = await herdrWorkspaceList();
  expect(after.some((w) => w.workspace_id === target.workspace_id)).toBe(true);
});

// --- pane close with confirmation modal -------------------------------------

test("closing a pane's card shows a danger-styled confirmation; cancel keeps it, confirm removes it", async ({
  app,
}) => {
  let createdTabId: string | undefined;
  try {
    const before = await herdrTabList();
    await plusButton(app).click();
    await plusMenuItem(app, "New tab").click();
    const editInput = tabRowInEditMode(app).locator(".edit-input");
    await expect(editInput).toBeVisible({ timeout: 2_000 });
    const name = `kanhrd-e2e-${Date.now()}`;
    await editInput.fill(name);
    await editInput.press("Enter");
    await waitFor(
      async () => {
        const tabs = await herdrTabList();
        const created = tabs.find((t) => t.label === name && !before.some((b) => b.tab_id === t.tab_id));
        if (created) createdTabId = created.tab_id;
        return created !== undefined;
      },
      { timeoutMs: 3_000, message: `throwaway tab "${name}" never appeared on herdr's side` },
    );

    // The new tab auto-creates one pane; its card renders on the board.
    const cards = allCards(app);
    await expect(cards.first()).toBeVisible({ timeout: 5_000 });
    // Locate the specific card belonging to the new tab via its path text ("<workspace> / <tab name>").
    const targetCard = app.locator(".card", { hasText: name });
    await expect(targetCard).toHaveCount(1, { timeout: 3_000 });

    await cardCloseButton(targetCard).click();

    await expect(modalTitle(app)).toHaveText(COPY.confirm.closePane);
    await expect(modalConfirm(app)).toBeVisible();
    // The care prompt is always paired with the honest body naming what ends.
    await expect(modal(app).locator(".modal-body")).toHaveText(COPY.confirm.closePaneBody);

    // Cancel first — pane must still be there.
    await modalCancelButton(app).click();
    await expect(modal(app)).toHaveCount(0);
    await expect(app.locator(".card", { hasText: name })).toHaveCount(1);

    // Now actually confirm — safe, this is a throwaway tab/pane.
    await cardCloseButton(targetCard).click();
    await modalConfirm(app).click();

    await expect(app.locator(".card", { hasText: name })).toHaveCount(0, { timeout: 3_000 });

    // Closing the tab's only pane cascades to closing the tab itself
    // (CONTRACT-TIER3.md section 5.6) — verify herdr agrees, which also
    // means there is nothing left for this test to clean up.
    await waitFor(async () => !(await herdrTabList()).some((t) => t.tab_id === createdTabId), {
      timeoutMs: 3_000,
      message: "pane close cascaded to the tab in the UI, but the tab still exists on herdr's side",
    });
    createdTabId = undefined;
  } finally {
    await herdrCloseTabIfPresent(createdTabId);
  }
});

// --- cascade purge -----------------------------------------------------------

test("closing a tab cascades to purge its pane from the board client-side, even with no pane.closed on the wire", async ({
  app,
}) => {
  let createdTabId: string | undefined;
  try {
    const before = await herdrTabList();
    await plusButton(app).click();
    await plusMenuItem(app, "New tab").click();
    const editInput = tabRowInEditMode(app).locator(".edit-input");
    await expect(editInput).toBeVisible({ timeout: 2_000 });
    const name = `kanhrd-e2e-${Date.now()}`;
    await editInput.fill(name);
    await editInput.press("Enter");
    await waitFor(
      async () => {
        const tabs = await herdrTabList();
        const created = tabs.find((t) => t.label === name && !before.some((b) => b.tab_id === t.tab_id));
        if (created) createdTabId = created.tab_id;
        return created !== undefined;
      },
      { timeoutMs: 3_000, message: `throwaway tab "${name}" never appeared on herdr's side` },
    );

    const targetCard = app.locator(".card", { hasText: name });
    await expect(targetCard).toHaveCount(1, { timeout: 3_000 });

    // Close the TAB (not the pane) via the rail — per CONTRACT-TIER3.md
    // section 5.6, herdr only emits `tab.closed` here, never a `pane.closed`
    // for the cascaded child pane. If the SPA's client-side cascade purge
    // (panes.store.ts's `tab.closed` handler) were missing, the card would
    // be left behind as a zombie.
    const row = tabRowByName(app, name);
    await openRowMenuAndClick(row, COPY.confirm.closeLaneAction);
    await expect(modalTitle(app)).toHaveText(COPY.confirm.closeLane);
    await modalConfirm(app).click();

    await expect(tabRowByName(app, name)).toHaveCount(0, { timeout: 2_000 });
    await expect(app.locator(".card", { hasText: name })).toHaveCount(0, { timeout: 2_000 });

    await waitFor(async () => !(await herdrTabList()).some((t) => t.tab_id === createdTabId), {
      timeoutMs: 3_000,
      message: "tab close never landed on herdr's side",
    });
    createdTabId = undefined;
  } finally {
    await herdrCloseTabIfPresent(createdTabId);
  }
});
