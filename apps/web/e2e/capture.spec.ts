import { test, expect, type Page } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { installMock, urlForState, type StateName } from "./helpers/mock-bridge";

/**
 * Documentation captures for `README.md`'s gallery.
 *
 * This is NOT a test suite in the usual sense: it writes binaries into
 * `docs/screenshots/`, which are committed to Git LFS. It therefore runs in
 * its own Playwright project and only via `make screenshots` — never as part
 * of `make test-e2e`, and never in CI. Regenerating a committed LFS blob is a
 * deliberate act, because every version of it is kept forever.
 *
 * Reproducibility has two halves and the harness only solved one:
 *
 *  - **Data** is deterministic already. `fixtures/six-hundred-panes.ts` uses
 *    no `Math.random`, and `helpers/mock-bridge.ts` serves it over a fully
 *    mocked `/api/hosts` + `/ws`, so no herdr is involved and no operator
 *    socket is touched.
 *  - **Time** is not. Every card renders
 *    `formatElapsed(clock.now() - statusSince)` off `ClockTick`, a root
 *    signal driven by a live `setInterval` (`util/clock.ts`). Left alone,
 *    two runs of the same fixture differ on every card.
 *
 * So each capture installs Playwright's clock at a fixed epoch BEFORE
 * navigating, then pauses it a fixed interval later. The advance matters:
 * `statusSince` is seeded at card construction, so a bare freeze renders
 * every card at `0s`. Advancing past load yields a stable *and* plausible
 * elapsed reading instead.
 *
 * Each shot is taken twice and the buffers compared. A capture that is not
 * byte-identical across two consecutive runs on this machine never reaches
 * LFS. Note the scope of that claim: font rasterisation differs between
 * machines, so this gate proves *this* machine is reproducible, not that two
 * machines agree. It is not a visual-regression baseline and must not be
 * used as one.
 */

/** Fixed wall-clock instant every capture boots at. Arbitrary, but pinned. */
const FROZEN_EPOCH = new Date("2026-01-15T09:00:00.000Z");

/**
 * How far the clock advances after load before the shot is taken. Chosen so
 * `formatElapsed` renders minutes rather than `0s` — see the note above.
 */
const ADVANCE_MS = 7 * 60 * 1000;

const SCREENSHOTS_DIR = resolve(__dirname, "../../../docs/screenshots");

interface Capture {
  /** Output basename, snake_case to match the existing `mobile_kanban.png`. */
  readonly file: string;
  readonly state: StateName;
  readonly width: number;
  readonly height: number;
  /** What this capture is for, so a future reader knows why it is committed. */
  readonly why: string;
  /** Route to shoot, when it is not the state's own default board URL. */
  readonly path?: string;
  /** Serve tier-3 capabilities + terminal content (pane detail needs both). */
  readonly tier3?: boolean;
  /** A selector that must be visible before the shot is taken. */
  readonly waitFor?: string;
}

/**
 * Terminal content for the pane-detail capture. Static and ANSI-free so the
 * shot cannot vary: the mock confirms `pane.subscribe_output` and then sends
 * nothing, because a live stream would repaint mid-capture.
 */
const TERMINAL_CONTENT = [
  "$ pnpm --filter @kanhrd/bridge dev",
  "",
  "  bridge listening on 127.0.0.1:5173",
  "  host local  -> ~/.config/herdr/herdr.sock  connected",
  "  host remote-a -> ssh://remote-a           connected",
  "  host remote-b -> ssh://remote-b           connected",
  "",
  "  watching 3 hosts, 6 panes",
  "$ ",
].join("\r\n");

/**
 * The committed set, deliberately small. The 4 × 6 viewport/state matrix in
 * `viewport-matrix.spec.ts` exists to probe contrast, keyboard and paint
 * timing across every cell; it is not a gallery, and publishing 24 permanent
 * LFS blobs to illustrate one README section would be a poor trade.
 */
const CAPTURES: readonly Capture[] = [
  {
    file: "desktop_board.png",
    state: "populated-small",
    // Wide enough that all five status columns fit without the board's
    // horizontal scroll clipping `unknown` — at 1280 the last column is cut.
    width: 1680,
    height: 500,
    why: "the headline shot — a realistic board with every status column visible",
  },
  {
    file: "desktop_board_scoped.png",
    state: "scoped",
    width: 1680,
    height: 900,
    why: "URL-is-state: the rail scoped into one workspace, linkable",
  },
  {
    file: "desktop_board_dense.png",
    state: "populated-600",
    width: 1920,
    height: 1080,
    why: "600 panes across 3 hosts — density the board is expected to survive",
  },
  {
    file: "empty_state.png",
    state: "empty",
    width: 1280,
    height: 620,
    why: "empty states are next steps, not messages (docs/UX-GUIDELINES.md)",
  },
  {
    file: "terminal_detail.png",
    state: "populated-small",
    width: 1280,
    height: 560,
    why: "the live terminal per card — tier-2's headline capability",
    path: "/pane/local/local-ws1-tab1-p1",
    tier3: true,
    waitFor: ".xterm-screen",
  },
  {
    file: "settings.png",
    state: "populated-small",
    width: 1280,
    height: 1000,
    why: "theme, density, terminal font size and the six terminal palettes",
    path: "/settings",
    // tier-3 so the runtime section shows a real advertised poll cadence
    // instead of the `0ms` the tier-1 fallback renders.
    tier3: true,
    waitFor: "main",
  },
];

/** Boots the app at a frozen instant with the mocked bridge, ready to shoot. */
async function bootFrozen(page: Page, capture: Capture): Promise<void> {
  await page.setViewportSize({ width: capture.width, height: capture.height });
  // Install before any app code runs, so `ClockTick`'s constructor and its
  // `setInterval` are both under the fake clock.
  await page.clock.install({ time: FROZEN_EPOCH });
  await installMock(page, {
    state: capture.state,
    tier3: capture.tier3,
    terminalContent: capture.tier3 ? TERMINAL_CONTENT : undefined,
  });

  await page.goto(capture.path ?? urlForState(capture.state));
  await expect(page.locator("main")).toBeVisible({ timeout: 10_000 });

  if (capture.waitFor) {
    await expect(page.locator(capture.waitFor).first()).toBeVisible({ timeout: 10_000 });
  } else {
    const shellSurface = page.locator(".card, .empty-state, .state.state-failed, .board-skeleton");
    await expect
      .poll(async () => await shellSurface.count(), {
        timeout: 10_000,
        message: `no shell surface painted for ${capture.file}`,
      })
      .toBeGreaterThan(0);
  }

  // Advance and pin. `pauseAt` leaves the clock stopped, so nothing ticks
  // between the two shots of the determinism gate.
  await page.clock.pauseAt(new Date(FROZEN_EPOCH.getTime() + ADVANCE_MS));

  // The elapsed text re-renders off the tick; give the signal one frame to
  // flush before shooting.
  await page.waitForTimeout(100);
}

for (const capture of CAPTURES) {
  test(`capture — ${capture.file}`, async ({ page }) => {
    await bootFrozen(page, capture);

    const first = await page.screenshot({ fullPage: false, animations: "disabled" });
    const second = await page.screenshot({ fullPage: false, animations: "disabled" });

    expect(
      first.equals(second),
      `${capture.file} is not reproducible: two consecutive shots differ, so committing it ` +
        `would churn an LFS blob on every regeneration. Something on this screen is still ` +
        `moving — an unfrozen timer, an animation, or a live subscription.`,
    ).toBe(true);

    const out = resolve(SCREENSHOTS_DIR, capture.file);
    await mkdir(dirname(out), { recursive: true });
    await writeFile(out, first);

    // eslint-disable-next-line no-console
    console.log(`[capture] ${capture.file} (${capture.width}×${capture.height}) — ${capture.why}`);
  });
}
