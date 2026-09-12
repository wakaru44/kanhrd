import { test, expect, type Page } from '@playwright/test';
import { HOSTS, buildSixHundredPanes } from './fixtures/six-hundred-panes';
import { installMock, urlForState, type StateName } from './helpers/mock-bridge';

/**
 * Task 17.10 (`add-l-brand-neo-shepherd-redesign`) — capture the neo-shepherd
 * spec's viewport × state matrix and 600-pane fixture, and record first-shell
 * paint timing plus contrast and keyboard probes at each cell.
 *
 * Unlike `tier1.board.spec.ts`, this suite is FULLY MOCKED — every cell
 * intercepts `/api/hosts` and the `/ws` transport before `page.goto('/')`, so
 * it needs no herdr at all, not even the run's own session. That is deliberate: 600 panes is not something a live herdr can
 * be trusted to expose without side effects.
 *
 * Timings, contrast findings and keyboard findings are recorded per cell via
 * `test.info().annotations` and `console.log` so they surface in the
 * Playwright report and stdout without gating on a fixed budget (no CI
 * baseline yet — see the change proposal).
 */

// Viewports come straight from docs/UX-GUIDELINES.md (390 mobile reference,
// 900 breakpoint) and docs/DESIGN-SYSTEM.md (side-by-side ≥ 900). Two desktop
// widths bracket the range operators actually run kanhrd at.
const VIEWPORTS = [
  { name: 'mobile-390', width: 390, height: 844 },
  { name: 'small-900', width: 900, height: 720 },
  { name: 'desktop-1280', width: 1280, height: 800 },
  { name: 'wide-1920', width: 1920, height: 1080 },
] as const;

const STATES: readonly StateName[] = [
  'empty',
  'populated-small',
  'populated-600',
  'scoped',
  'error',
  'offline',
];

/**
 * WCAG 2.1 relative-luminance + contrast ratio. Kept inline (no axe-core
 * dependency, per ponytail — the repo already has none and the check we need
 * is one formula).
 */
function relativeLuminance([r, g, b]: [number, number, number]): number {
  const chan = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * chan(r) + 0.7152 * chan(g) + 0.0722 * chan(b);
}

function contrastRatio(fg: [number, number, number], bg: [number, number, number]): number {
  const l1 = relativeLuminance(fg);
  const l2 = relativeLuminance(bg);
  const [lighter, darker] = l1 >= l2 ? [l1, l2] : [l2, l1];
  return (lighter + 0.05) / (darker + 0.05);
}

function parseRgb(css: string): [number, number, number] | null {
  // Handles both `rgb(r, g, b)` and `rgba(r, g, b, a)`. Anything else (named
  // colours, currentColor, oklch, ...) resolves through getComputedStyle to
  // rgb/rgba in every browser we run.
  const m = /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/.exec(css);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

/**
 * Resolves the effective background of an element by walking up ancestors
 * until a non-transparent one is found; falls back to white. Same trick every
 * a11y sampler uses because `getComputedStyle` doesn't do it for you.
 */
async function sampleColorPair(
  page: Page,
  selector: string
): Promise<{ fg: [number, number, number]; bg: [number, number, number] } | null> {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel) as HTMLElement | null;
    if (!el) return null;
    const parse = (s: string): [number, number, number] | null => {
      const m = /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([0-9.]+))?/.exec(s);
      if (!m) return null;
      const a = m[4] === undefined ? 1 : Number(m[4]);
      if (a === 0) return null;
      return [Number(m[1]), Number(m[2]), Number(m[3])];
    };
    const fg = parse(getComputedStyle(el).color);
    if (!fg) return null;
    let cursor: HTMLElement | null = el;
    while (cursor) {
      const bg = parse(getComputedStyle(cursor).backgroundColor);
      if (bg) return { fg, bg };
      cursor = cursor.parentElement;
    }
    return { fg, bg: [255, 255, 255] };
  }, selector);
}

// --- mock transport --------------------------------------------------------

// --- fixture sanity check --------------------------------------------------

test('fixture — buildSixHundredPanes returns exactly 600 panes', () => {
  const panes = buildSixHundredPanes();
  expect(panes.length).toBe(600);
  // Basic schema shape: every pane has the load-bearing fields the board reads.
  for (const p of panes) {
    expect(p.id).toBeTruthy();
    expect(p.host).toBeTruthy();
    expect(p.workspace.id).toBeTruthy();
    expect(p.tab.id).toBeTruthy();
    expect(p.agent_status).toBeTruthy();
  }
});

// --- the matrix ------------------------------------------------------------

for (const vp of VIEWPORTS) {
  for (const state of STATES) {
    test(`viewport-matrix — ${vp.name} × ${state}`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await installMock(page, { state });

      const t0 = Date.now();
      await page.goto(urlForState(state));

      // First-shell paint: the board's `<main>` region is on screen and at
      // least one settled paint surface follows — cards, the empty state,
      // the error banner, or the boot skeleton (for `offline`, whose
      // httpResource can legitimately stay in loading while retrying).
      await expect(page.locator('main')).toBeVisible({ timeout: 10_000 });
      const shellSurface = page.locator(
        '.card, .empty-state, .state.state-failed, .board-skeleton'
      );
      await expect
        .poll(async () => await shellSurface.count(), {
          timeout: 10_000,
          message: `no shell surface painted at ${vp.name}/${state}`,
        })
        .toBeGreaterThan(0);
      const firstShellMs = Date.now() - t0;
      test.info().annotations.push({
        type: 'first-shell-ms',
        description: `${vp.name}/${state}: ${firstShellMs}ms`,
      });
      // eslint-disable-next-line no-console
      console.log(`[viewport-matrix] ${vp.name}/${state} first-shell=${firstShellMs}ms`);

      // --- state-specific "did the right screen render" assertion ---------
      if (state === 'empty') {
        // No hosts advertise cards — filter bar has no host chips.
        await expect(page.locator('.card')).toHaveCount(0);
      } else if (state === 'populated-small') {
        await expect(page.locator('.card').first()).toBeVisible({ timeout: 10_000 });
        const count = await page.locator('.card').count();
        expect(count).toBeGreaterThan(0);
        expect(count).toBeLessThanOrEqual(6);
      } else if (state === 'populated-600' || state === 'scoped') {
        // Cards are virtualized above ~200 rows; assert at least one is
        // materialised. The store still holds 600 (or the workspace's 50)
        // regardless of what the DOM materialises.
        await expect(page.locator('.card').first()).toBeVisible({ timeout: 10_000 });
      } else if (state === 'error') {
        // Either the explicit failure banner or the skeleton/state.loading —
        // whichever Angular's httpResource surfaces. Both are acceptable
        // shell-paint surfaces for a bridge that errored on /api/hosts.
        const failedOrSkeleton = page.locator('.state.state-failed, .board-skeleton');
        await expect(failedOrSkeleton.first()).toBeVisible({ timeout: 10_000 });
      } else if (state === 'offline') {
        // Bridge unreachable — the loading state resolves to an empty board;
        // the "bridge disconnected" toast may or may not be flushed inside
        // the shell window depending on retry timing, so we don't assert on
        // it here. What matters is the shell painted without hanging.
        await expect(page.locator('.card')).toHaveCount(0);
      }

      // --- contrast probe -------------------------------------------------
      // Sample the brand wordmark and, when present, the first card's title.
      const contrastFindings: Array<{ label: string; ratio: number }> = [];
      const probes: Array<{ selector: string; label: string }> = [
        { selector: '.brand', label: 'brand-wordmark' },
      ];
      if (state === 'populated-small' || state === 'populated-600' || state === 'scoped') {
        probes.push({ selector: '.card .card-open', label: 'card-title' });
      } else if (state === 'error') {
        probes.push({ selector: '.state-text', label: 'error-text' });
      }
      for (const probe of probes) {
        const pair = await sampleColorPair(page, probe.selector);
        if (!pair) continue;
        const ratio = contrastRatio(pair.fg, pair.bg);
        contrastFindings.push({ label: probe.label, ratio });
        // WCAG AA body text is 4.5:1. Interactive/large-text is 3:1. We
        // enforce 3:1 for every probe — if the brand ever fails this the
        // redesign token layer is broken.
        expect(ratio, `contrast ${probe.label} at ${vp.name}/${state}`).toBeGreaterThanOrEqual(3.0);
      }
      test.info().annotations.push({
        type: 'contrast',
        description:
          `${vp.name}/${state}: ` +
          contrastFindings.map((f) => `${f.label}=${f.ratio.toFixed(2)}`).join(', '),
      });

      // --- keyboard probe -------------------------------------------------
      // Tab a few times; each stop must reveal a focus indicator distinct
      // from the element's resting state. Escape returns focus to <body>
      // (nothing higher is trapping it at boot).
      await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur?.());
      await page.locator('body').click({ position: { x: 1, y: 1 } });
      let focusStopsChecked = 0;
      let focusStopsWithIndicator = 0;
      for (let i = 0; i < 5; i++) {
        await page.keyboard.press('Tab');
        const info = await page.evaluate(() => {
          const el = document.activeElement as HTMLElement | null;
          if (!el || el === document.body) return null;
          const cs = getComputedStyle(el);
          const hasOutline = cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0;
          const hasBoxShadow = cs.boxShadow !== 'none';
          const tag = el.tagName.toLowerCase();
          return { tag, hasOutline, hasBoxShadow };
        });
        if (!info) break;
        focusStopsChecked++;
        if (info.hasOutline || info.hasBoxShadow) focusStopsWithIndicator++;
      }
      // If nothing focusable exists (rare — empty + no hosts + no header
      // controls would still expose the brand link) allow zero stops.
      if (focusStopsChecked > 0) {
        expect(
          focusStopsWithIndicator,
          `every keyboard stop at ${vp.name}/${state} shows a focus indicator`
        ).toBe(focusStopsChecked);
      }
      await page.keyboard.press('Escape');
      test.info().annotations.push({
        type: 'keyboard',
        description: `${vp.name}/${state}: ${focusStopsWithIndicator}/${focusStopsChecked} stops indicated`,
      });
      // eslint-disable-next-line no-console
      console.log(
        `[viewport-matrix] ${vp.name}/${state} keyboard=${focusStopsWithIndicator}/${focusStopsChecked}`
      );
    });
  }
}

// --- theme panel bounds at the mobile reference width -----------------------

/**
 * `docs/UX-GUIDELINES.md` assertion 39 — the header's theme panel is a
 * non-modal dialog, and at the 390px reference width it must open inside the
 * viewport rather than clipping past its edge. Same shape as
 * `mobile.spec.ts [8]` asserts for the board's `+` menu, but mocked: the
 * header is app chrome, so it renders in every state this harness serves and
 * the assertion needs no herdr.
 */
test('theme panel — opens inside the viewport at 390px', async ({ page }) => {
  const width = 390;
  await page.setViewportSize({ width, height: 844 });
  await installMock(page, { state: 'populated-small' });
  await page.goto('/');

  const trigger = page.locator('.theme-toggle');
  await expect(trigger).toBeVisible({ timeout: 10_000 });
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');

  await trigger.click();

  // Open for real, not vacuously: the trigger says so and the dialog exists.
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  const panel = page.locator('[role="dialog"].theme-panel');
  await expect(panel).toBeVisible();

  const box = await panel.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(width + 1);

  // And it does not widen the page while it is open.
  const overflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1);

  await page.keyboard.press('Escape');
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
});
