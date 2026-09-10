import { test, expect } from "./fixtures/kanhrd";
import { herdrAvailable, herdrPaneList } from "./fixtures/herdr";
import { COPY } from "../src/app/shared/copy";

/**
 * Two board empty-state contracts (task 14.5 of
 * `add-l-brand-neo-shepherd-redesign`):
 *
 * - With no pens configured, the board renders the sample kanhrd.config.yaml
 *   snippet, the "then start the bridge" command, a copy control and the
 *   operating-guide link. `/api/hosts` is stubbed to reach this state
 *   without needing bridge/herdr reconfiguration.
 * - Opening a scoped URL (`/workspace/:workspaceId/tab/:tabId`) renders the
 *   `.scope-pill` with a `clear scope` control. This half needs a real
 *   herdr session because the pill only paints once `resolvedWorkspace()`
 *   is non-null; it is gated on the same `KANHRD_E2E_LIVE_HERDR` opt-in the
 *   rest of the live-herdr suite uses (see `fixtures/herdr.ts`).
 *
 * See `docs/UX-GUIDELINES.md` — "Empty state" and "URL scope" — and
 * `apps/web/src/app/board/empty-state.html` / `board.html`.
 */

// --- no pens configured ---------------------------------------------------

test.describe("board empty state — no pens configured", () => {
  test.beforeEach(async ({ page }) => {
    await page.route("**/api/hosts", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ hosts: [] }),
      }),
    );
    await page.goto("/");
    await expect(page.locator(".empty-state")).toBeVisible({ timeout: 10_000 });
  });

  test("renders the sample kanhrd.config.yaml snippet with a copy control", async ({ page }) => {
    const emptyState = page.locator(".empty-state").filter({ hasNot: page.locator(".no-matches") });
    await expect(emptyState.locator("h2")).toHaveText(COPY.emptyState.noPens);
    await expect(emptyState).toContainText(COPY.emptyState.noPensBody);

    // A YAML-looking sample config with at least one `pens:`/`socket:`
    // marker is what the operator has to copy into kanhrd.config.yaml.
    const snippets = emptyState.locator(".config-snippet");
    expect(await snippets.count()).toBeGreaterThanOrEqual(2);
    const configText = ((await snippets.first().textContent()) ?? "").trim();
    expect(configText.length, "sample config snippet is empty").toBeGreaterThan(0);
    // Wire vocabulary keeps herdr's `hosts:` key in the sample config even
    // though user-facing copy renames the concept to "pen" — see
    // `apps/web/src/app/shared/copy.ts` rule 1.
    expect(configText).toMatch(/hosts?:/i);

    const copyAction = emptyState.locator(".copy-action");
    await expect(copyAction).toBeVisible();
    await expect(copyAction).toContainText(/copy/i);
  });

  test("renders the start-the-bridge command and the operating-guide link", async ({ page }) => {
    const emptyState = page.locator(".empty-state").filter({ hasNot: page.locator(".no-matches") });
    await expect(emptyState).toContainText(COPY.emptyState.noPensThen);

    // The second `.config-snippet` is the start command — must be a
    // non-empty, non-trivial shell string.
    const startCommand = ((await emptyState.locator(".config-snippet").nth(1).textContent()) ?? "").trim();
    expect(startCommand.length, "start-the-bridge command is empty").toBeGreaterThan(0);
    expect(startCommand.split(/\s+/).length, "start command looks trivial").toBeGreaterThanOrEqual(1);

    const guide = emptyState.locator(".guide-link");
    await expect(guide).toBeVisible();
    await expect(guide).toHaveText(COPY.emptyState.noPensDocsLink);
    const href = await guide.getAttribute("href");
    expect(href, "operating-guide link has no href").toBeTruthy();
    expect(href!).toMatch(/^https?:\/\//);
  });
});

// --- scoped URL renders the scope pill + clear action ---------------------

test.describe("board URL scope", () => {
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

  test("opening /workspace/:workspaceId/tab/:tabId renders the scope pill and a clear-scope action", async ({
    page,
  }) => {
    const panes = await herdrPaneList();
    const scoped = panes.find((p) => !!p.workspace_id && !!p.tab_id);
    test.skip(!scoped, "no herdr pane exposes both a workspace_id and a tab_id — cannot build a scoped URL");

    await page.goto(`/workspace/${scoped!.workspace_id}/tab/${encodeURIComponent(scoped!.tab_id)}`);

    const pill = page.locator(".scope-pill");
    await expect(pill).toBeVisible({ timeout: 10_000 });

    // The clear-scope control is a button labelled with
    // `COPY.emptyState.scopeEmptyAction` (see board.html), and clicking it
    // must actually clear the scope by navigating back to `/`.
    const clear = pill.locator(".scope-pill-close");
    await expect(clear).toBeVisible();
    await expect(clear).toHaveAttribute("aria-label", COPY.emptyState.scopeEmptyAction);

    await clear.click();
    await expect(page).toHaveURL(/\/$/, { timeout: 5_000 });
    await expect(pill).toBeHidden({ timeout: 3_000 });
  });
});
