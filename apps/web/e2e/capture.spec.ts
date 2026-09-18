import { test, expect, type Page } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { installMock, urlForState, type StateName } from './helpers/mock-bridge';

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
const FROZEN_EPOCH = new Date('2026-01-15T09:00:00.000Z');

/**
 * How far the clock advances after load before the shot is taken. Chosen so
 * `formatElapsed` renders minutes rather than `0s` — see the note above.
 */
const ADVANCE_MS = 7 * 60 * 1000;

const SCREENSHOTS_DIR = resolve(__dirname, '../../../docs/screenshots');

interface Capture {
  /** Output basename, snake_case to match `docs/screenshots/`. */
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
  /**
   * Controls to click, in order, before shooting — for a subject that only
   * exists once something is open. Each is waited for, so a menu that has
   * not painted yet fails the capture rather than shooting past it.
   */
  readonly open?: readonly string[];
  /** `localStorage` seeded before the app boots — theme, palette, density. */
  readonly storage?: Readonly<Record<string, string>>;
}

/**
 * The six terminal palettes, in the order `TERMINAL_THEME_OPTIONS` lists them
 * (`state/terminal-theme.service.ts`). `auto` is deliberately absent: it is
 * not a palette, it follows the app theme, and showing it in a palette
 * gallery would be showing washi or sumi twice under a third name.
 */
const PALETTES: readonly { value: string; label: string }[] = [
  { value: 'washi', label: 'washi' },
  { value: 'sumi', label: 'sumi' },
  { value: 'catppuccin-mocha', label: 'catppuccin mocha' },
  { value: 'monokai', label: 'monokai' },
  { value: 'solarized-dark', label: 'solarized dark' },
  { value: 'solarized-light', label: 'solarized light' },
];

/**
 * Terminal content for the pane-detail capture. Static and ANSI-free so the
 * shot cannot vary: the mock confirms `pane.subscribe_output` and then sends
 * nothing, because a live stream would repaint mid-capture.
 */
const TERMINAL_CONTENT = [
  '$ pnpm --filter @kanhrd/bridge dev',
  '',
  '  bridge listening on 127.0.0.1:5173',
  '  host local  -> ~/.config/herdr/herdr.sock  connected',
  '  host remote-a -> ssh://remote-a           connected',
  '  host remote-b -> ssh://remote-b           connected',
  '',
  '  watching 3 hosts, 6 panes',
  '$ ',
].join('\r\n');

/**
 * The committed set, deliberately small. The 4 × 6 viewport/state matrix in
 * `viewport-matrix.spec.ts` exists to probe contrast, keyboard and paint
 * timing across every cell; it is not a gallery, and publishing 24 permanent
 * LFS blobs to illustrate one README section would be a poor trade.
 *
 * The phone shot (`docs/screenshots/mobile_kanban.jpg`) is deliberately NOT
 * here. It is taken by hand against a live herdr, because this mock advertises
 * tier-1: a generated phone capture renders no create button, no card overflow
 * actions and no real elapsed times, making it a poorer image than the one it
 * would overwrite. Capturing it here silently clobbered that file once already.
 */

/**
 * One parked column, holding the `done` card, seeded into `localStorage`
 * before the app boots.
 *
 * Parking is browser-local by design (`state/parked.store.ts`), so there is
 * no server state to mock: the column IS this document. A board shot
 * without one cannot show the feature at all, and — for the card-actions
 * shot — cannot show the distinction the move menu rests on, that `move
 * to…` offers herdr destinations and never a parked column.
 */
const PARKED_COLUMN = {
  'kanhrd.parked-columns': JSON.stringify({
    version: 1,
    columns: [{ id: 'p1', name: 'shipped', exitRule: 'never', order: 0 }],
    membership: { 'local:local-ws1-tab2-p6': 'p1' },
  }),
} as const;

const CAPTURES: readonly Capture[] = [
  {
    file: 'desktop_board.png',
    state: 'populated-small',
    // Wide enough for all five status columns AND the operator's own
    // parked column beside them, without the board's horizontal scroll
    // clipping either — at 1280 even `unknown` is cut.
    width: 1960,
    height: 440,
    why: "the headline shot — every status column, the operator's own column, and a rail with two workspaces",
    storage: PARKED_COLUMN,
  },
  {
    file: 'desktop_board_scoped.png',
    state: 'scoped',
    width: 1680,
    height: 900,
    why: 'URL-is-state: the rail scoped into one workspace, linkable',
  },
  {
    file: 'desktop_board_dense.png',
    state: 'populated-600',
    width: 1920,
    height: 1080,
    why: '600 panes across 3 hosts — density the board is expected to survive',
  },
  {
    file: 'empty_state.png',
    state: 'empty',
    width: 1280,
    height: 620,
    why: 'empty states are next steps, not messages (docs/UX-GUIDELINES.md)',
  },
  {
    file: 'terminal_detail.png',
    state: 'populated-small',
    width: 1280,
    height: 560,
    why: "the live terminal per card — tier-2's headline capability",
    path: '/pane/local/local-ws1-tab1-p1',
    tier3: true,
    waitFor: '.xterm-screen',
  },
  {
    file: 'card_actions.png',
    state: 'populated-small',
    width: 1960,
    height: 500,
    why: "a card's four named controls, its move menu, and the tabs that menu can send it to",
    // One shot, not three: the row, the menu it opens and the destination
    // list under `another tab` are the same subject at three depths, and
    // the committed set is deliberately small (see the note above).
    //
    // The parked column is in frame on purpose. It is what makes the rule
    // visible rather than merely stated: the open menu lists herdr
    // destinations — other tabs, a new tab, a new workspace — and the
    // operator's own column is NOT among them, because parking is a
    // different operation with a different blast radius.
    tier3: true,
    storage: PARKED_COLUMN,
    open: ['.card .card-action.move', '.overflow-menu .move-existing-tab'],
    waitFor: '.card .card-action.move',
  },
  {
    file: 'settings.png',
    state: 'populated-small',
    width: 1280,
    height: 1000,
    why: 'theme, density, terminal font size and the six terminal palettes',
    path: '/settings',
    // tier-3 so the runtime section shows a real advertised poll cadence
    // instead of the `0ms` the tier-1 fallback renders.
    tier3: true,
    waitFor: 'main',
  },
];

/** Boots the app at a frozen instant with the mocked bridge, ready to shoot. */
async function bootFrozen(page: Page, capture: Capture): Promise<void> {
  await page.setViewportSize({ width: capture.width, height: capture.height });
  // Install before any app code runs, so `ClockTick`'s constructor and its
  // `setInterval` are both under the fake clock.
  await page.clock.install({ time: FROZEN_EPOCH });
  if (capture.storage) {
    const seed = capture.storage;
    await page.addInitScript((entries: Record<string, string>) => {
      for (const [k, v] of Object.entries(entries)) localStorage.setItem(k, v);
    }, seed);
  }
  await installMock(page, {
    state: capture.state,
    tier3: capture.tier3,
    terminalContent: capture.tier3 ? TERMINAL_CONTENT : undefined,
  });

  await page.goto(capture.path ?? urlForState(capture.state));
  await expect(page.locator('main')).toBeVisible({ timeout: 10_000 });

  if (capture.waitFor) {
    await expect(page.locator(capture.waitFor).first()).toBeVisible({ timeout: 10_000 });
  } else {
    const shellSurface = page.locator('.card, .empty-state, .state.state-failed, .board-skeleton');
    await expect
      .poll(async () => await shellSurface.count(), {
        timeout: 10_000,
        message: `no shell surface painted for ${capture.file}`,
      })
      .toBeGreaterThan(0);
  }

  for (const selector of capture.open ?? []) {
    const control = page.locator(selector).first();
    await control.waitFor({ state: 'visible', timeout: 10_000 });
    await control.click();
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

    const first = await page.screenshot({ fullPage: false, animations: 'disabled' });
    const second = await page.screenshot({ fullPage: false, animations: 'disabled' });

    expect(
      first.equals(second),
      `${capture.file} is not reproducible: two consecutive shots differ, so committing it ` +
        `would churn an LFS blob on every regeneration. Something on this screen is still ` +
        `moving — an unfrozen timer, an animation, or a live subscription.`
    ).toBe(true);

    const out = resolve(SCREENSHOTS_DIR, capture.file);
    await mkdir(dirname(out), { recursive: true });
    await writeFile(out, first);

    // eslint-disable-next-line no-console
    console.log(`[capture] ${capture.file} (${capture.width}×${capture.height}) — ${capture.why}`);
  });
}

/**
 * The six-palette composite — the last subject `README.md` promised.
 *
 * A palette gallery cannot be one page capture: only one palette is active
 * at a time, and the setting lives in `localStorage` under
 * `kanhrd.terminal-theme`. So this shoots the terminal element once per
 * palette, seeding the setting before the app boots, then lays the six tiles
 * out on a page built with `page.setContent` and shoots that. Compositing in
 * the browser keeps the whole thing dependency-free — no image library — and
 * inherits the same frozen clock and determinism gate as every other capture.
 */
test('capture — terminal_palettes.png', async ({ browser }) => {
  const tiles: { label: string; dataUri: string }[] = [];

  for (const palette of PALETTES) {
    // A FRESH context per palette, not one reused page. Re-booting the same
    // page stacks a second set of `page.route` / `routeWebSocket` handlers
    // and a second `clock.install`, and the terminal then paints its chrome
    // but never its text — which is precisely the thing a palette gallery
    // exists to show.
    const context = await browser.newContext();
    const tilePage = await context.newPage();
    try {
      const shot = await captureTerminalTile(tilePage, palette.value);
      tiles.push({
        label: palette.label,
        dataUri: `data:image/png;base64,${shot.toString('base64')}`,
      });
    } finally {
      await context.close();
    }
  }

  const context = await browser.newContext();
  const page = await context.newPage();

  const compose = async (): Promise<Buffer> => {
    // Short viewport + fullPage so the shot grows to the grid and stops,
    // instead of padding the bottom with empty paper.
    await page.setViewportSize({ width: 1280, height: 400 });
    await page.setContent(compositeHtml(tiles), { waitUntil: 'load' });
    // Every tile is a data URI, so nothing is fetched; still, wait for decode
    // so a half-painted tile cannot reach the shot.
    await page.evaluate(async () => {
      await Promise.all(Array.from(document.images).map((img) => img.decode()));
    });
    return await page.screenshot({ fullPage: true, animations: 'disabled' });
  };

  const first = await compose();
  const second = await compose();
  expect(
    first.equals(second),
    'terminal_palettes.png is not reproducible: two consecutive composites differ.'
  ).toBe(true);

  await mkdir(SCREENSHOTS_DIR, { recursive: true });
  await writeFile(resolve(SCREENSHOTS_DIR, 'terminal_palettes.png'), first);
  await context.close();

  // eslint-disable-next-line no-console
  console.log(`[capture] terminal_palettes.png — ${PALETTES.length} palettes composited`);
});

/** Boots pane detail with one palette active and shoots the terminal element alone. */
async function captureTerminalTile(page: Page, palette: string): Promise<Buffer> {
  await bootFrozen(page, {
    file: `palette-${palette}`,
    state: 'populated-small',
    width: 900,
    height: 380,
    why: 'one tile of the palette composite',
    path: '/pane/local/local-ws1-tab1-p1',
    tier3: true,
    waitFor: '.xterm-screen',
    storage: {
      'kanhrd.terminal-theme': palette,
      // Pin the app theme too: `washi`/`sumi` render the same either way, but
      // the chrome around the terminal would otherwise follow the OS.
      'kanhrd.theme': palette === 'sumi' ? 'sumi' : 'washi',
    },
  });

  const terminal = page.locator('.terminal-wrap');
  await expect(terminal).toBeVisible({ timeout: 10_000 });

  // Guard the failure this composite hit once already: chrome painted, text
  // absent. An empty tile makes the gallery actively misleading, so fail
  // rather than publish a coloured rectangle.
  await expect(
    page.locator('.xterm-rows'),
    `palette ${palette}: terminal painted no text, so the tile would be a blank swatch`
  ).toContainText('watching 3 hosts', { timeout: 10_000 });

  return await terminal.screenshot({ animations: 'disabled' });
}

/** The composite page: a 2 x 3 grid of labelled tiles on the brand's paper cream. */
function compositeHtml(tiles: readonly { label: string; dataUri: string }[]): string {
  const cells = tiles
    .map(
      (t) => `<figure><img src="${t.dataUri}" alt=""><figcaption>${t.label}</figcaption></figure>`
    )
    .join('');
  // Colours are the two the design system names for paper and ink. This page
  // is a capture jig, not a shipped surface, so it carries no token imports.
  return `<!doctype html><meta charset="utf-8"><style>
    :root { color-scheme: light; }
    body { margin: 0; padding: 24px; background: #f4ede0; font-family: ui-sans-serif, system-ui, sans-serif; }
    .grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 20px; }
    figure { margin: 0; }
    img { display: block; width: 100%; height: auto; border-radius: 6px; }
    figcaption { margin-top: 6px; font-size: 13px; color: #6b5f4e; letter-spacing: 0.02em; }
  </style><div class="grid">${cells}</div>`;
}
