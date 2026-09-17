/**
 * LIVE-ONLY — this file needs a real herdr session and skips without one.
 *
 * The read-only file panel against a real checkout. The run's seeded panes
 * are cwd'd into THIS repository and the bridge shares their filesystem, so
 * `files_local` holds and the four methods answer for real: this is the one
 * place the panel is proven against git rather than against a fake.
 *
 * Nothing here writes. The panel has no control that could, and the specs
 * only read — a failure that left the checkout modified would be a bug in
 * the panel, not in the test.
 */
import { test, expect } from './fixtures/kanhrd';
import { herdrAvailable } from './fixtures/herdr';
import { xtermElement } from './helpers/selectors';

let preflightReason: string | undefined;

test.beforeAll(async () => {
  const result = await herdrAvailable();
  if (!result.ok) preflightReason = result.reason;
});

test.beforeEach(() => {
  test.skip(!!preflightReason, `herdr pre-flight failed: ${preflightReason}`);
});

/** Opens the first card's pane detail and waits for the terminal to be live. */
async function openPane(app: import('@playwright/test').Page) {
  await app.locator('a.card-open').first().click();
  await expect(xtermElement(app)).toBeVisible({ timeout: 10_000 });
  await expect(app.locator('.terminal-loading')).toHaveCount(0, { timeout: 10_000 });
}

test('the panel opens on the pane’s own checkout and reads it', async ({ app }) => {
  await openPane(app);

  const toggle = app.locator('[data-panel-toggle]');
  await expect(toggle).toBeVisible();
  // Collapsed by default: the ruling from the lab, not a preference.
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(app.locator('app-file-panel')).toHaveCount(0);

  await toggle.click();
  const panel = app.locator('app-file-panel');
  await expect(panel).toBeVisible();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');

  // The real root of this repository, one level, from `repo.tree`.
  await expect(panel.locator('[data-path="apps"]')).toBeVisible({ timeout: 10_000 });
  await expect(panel.locator('[data-path="package.json"]')).toBeVisible();
  // `.git` is never listed.
  await expect(panel.locator('[data-path=".git"]')).toHaveCount(0);

  // `repo.status` reached the status line: a real branch name.
  await expect(panel.locator('[data-status-line] .branch')).not.toBeEmpty({ timeout: 10_000 });
});

test('a directory is listed only when it is opened, one level at a time', async ({ app }) => {
  await openPane(app);
  await app.locator('[data-panel-toggle]').click();
  const panel = app.locator('app-file-panel');
  await expect(panel.locator('[data-path="apps"]')).toBeVisible({ timeout: 10_000 });

  // Nothing below the root before the operator asks for it.
  await expect(panel.locator('[data-path="apps/web"]')).toHaveCount(0);

  await panel.locator('[data-path="apps"]').click();
  await expect(panel.locator('[data-path="apps/web"]')).toBeVisible({ timeout: 10_000 });
  await expect(panel.locator('[data-path="apps"]')).toHaveAttribute('aria-expanded', 'true');

  // Still one level: the grandchildren are not there either.
  await expect(panel.locator('[data-path="apps/web/src"]')).toHaveCount(0);
});

test('a file opens read-only, with source and diff and no way to edit', async ({ app }) => {
  await openPane(app);
  await app.locator('[data-panel-toggle]').click();
  const panel = app.locator('app-file-panel');

  await panel.locator('[data-path="package.json"]').click({ timeout: 10_000 });
  const viewer = panel.locator('app-file-view');
  await expect(viewer).toBeVisible();

  await viewer.locator('[data-mode="source"]').click();
  await expect(viewer.locator('ol.code li').first()).toBeVisible({ timeout: 10_000 });
  await expect(viewer).toContainText('"name"');

  await viewer.locator('[data-mode="diff"]').click();
  // A committed, untouched file has nothing against HEAD — stated, not blank.
  await expect(viewer).toContainText(/no changes against head\.|@@/, { timeout: 10_000 });

  // Read-only: nothing in the panel takes text but the goto field.
  const writable = panel.locator(
    'textarea, [contenteditable="true"], input:not([aria-label="go to path"])'
  );
  await expect(writable).toHaveCount(0);
});

test('a pasted path is revealed, and one outside the checkout is refused in place', async ({
  app,
}) => {
  await openPane(app);
  await app.locator('[data-panel-toggle]').click();
  const panel = app.locator('app-file-panel');
  await expect(panel.locator('[data-path="apps"]')).toBeVisible({ timeout: 10_000 });

  const field = panel.locator('input[aria-label="go to path"]');
  await field.fill('apps/web/package.json');
  await panel.locator('button.goto-open').click();

  await expect(panel.locator('app-file-view')).toContainText('apps/web/package.json', {
    timeout: 10_000,
  });

  await field.fill('/etc/passwd');
  await panel.locator('button.goto-open').click();
  const error = panel.locator('.goto-error');
  await expect(error).toBeVisible({ timeout: 10_000 });
  await expect(error).toContainText('etc/passwd');
  // Refused in place: the field says so and the panel's contents are the
  // ones the last good path put there. (At this width the panel shows one
  // surface at a time, so "the tree is untouched" is read on the way back.)
  await expect(panel.locator('app-file-view')).toContainText('apps/web/package.json');
  await panel.locator('[data-surface="browser"]').click();
  await expect(panel.locator('[data-path="apps"]')).toBeVisible();
});

test('the split is draggable by keyboard and survives a reload', async ({ app }) => {
  await openPane(app);
  await app.locator('[data-panel-toggle]').click();

  const splitter = app.locator('[data-splitter]');
  await expect(splitter).toBeVisible();
  const before = Number(await splitter.getAttribute('aria-valuenow'));

  await splitter.focus();
  await app.keyboard.press('ArrowLeft');
  // Zoneless change detection lands a tick later than the keypress resolves.
  const after = before - 5;
  await expect(splitter).toHaveAttribute('aria-valuenow', String(after));

  await app.reload();
  await expect(xtermElement(app)).toBeVisible({ timeout: 10_000 });
  await app.locator('[data-panel-toggle]').click();
  await expect(app.locator('[data-splitter]')).toHaveAttribute('aria-valuenow', String(after), {
    timeout: 10_000,
  });
});

test('the key bar keeps its place while the panel has focus', async ({ app }) => {
  await openPane(app);
  const keyBar = app.locator('app-key-bar');
  const before = await keyBar.boundingBox();

  await app.locator('[data-panel-toggle]').click();
  const panel = app.locator('app-file-panel');
  await expect(panel.locator('[data-path="apps"]')).toBeVisible({ timeout: 10_000 });
  await panel.locator('[data-path="apps"]').click();

  expect(await keyBar.boundingBox()).toEqual(before);
});
