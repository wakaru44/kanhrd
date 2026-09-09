import { test, expect } from "./fixtures/kanhrd";
import { herdrAvailable, herdrPaneRead, herdrPaneSendText } from "./fixtures/herdr";
import { allCards, terminalContainer, xtermElement, xtermRows } from "./helpers/selectors";
import { waitFor } from "./helpers/wait";
import type { Page } from "@playwright/test";

/**
 * Tier-2: click card -> xterm.js terminal, type, verify echo. Mirrors the
 * flows L5B's throwaway Playwright driver used during tier-2 validation
 * (tmp/foreman/VALIDATION-TIER2.md), including the two adversarial repros
 * that round-1 found broken and round-2 confirmed fixed:
 *   - Bug A: per-keystroke sends racing and arriving scrambled.
 *   - Bug B: `pane.subscribe_output` going silent after the first snapshot.
 * These must not regress.
 *
 * Tests use `echo <marker>\r` rather than destructive input, so the marker
 * is harmless even if the pane hosts a real interactive shell or agent.
 *
 * Navigation always goes through clicking a card (SPA-internal routing),
 * never `page.goto()` straight to `/pane/:host/:id` — a direct full-page
 * load of that deep link does not trigger the component's
 * `pane.read`/`pane.subscribe_output` calls (confirmed by inspecting the WS
 * traffic: zero requests fire on a cold deep-link load, vs. the expected
 * `pane.read` + `pane.subscribe_output` pair firing right after an
 * SPA-internal card click). That's a real behavior gap in the app's
 * routing, out of this lane's scope to fix (apps/web/src is L3B/L3C's
 * lane) — this suite works around it by testing the flow the brief
 * actually describes and real users actually take: click card -> terminal.
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

/** Clicks the first available card and waits for the terminal to mount. */
async function openFirstPane(app: Page): Promise<void> {
  const cards = allCards(app);
  await expect(cards.first()).toBeVisible({ timeout: 10_000 });
  await cards.first().click();
  await expect(xtermElement(app)).toBeVisible({ timeout: 3_000 });
}

test("clicking a card navigates to the pane detail view and mounts a live terminal", async ({
  app,
  panePicker,
}) => {
  await openFirstPane(app);

  await expect(app).toHaveURL(new RegExp(`/pane/${panePicker.host}/${escapeRegExp(panePicker.id)}$`));

  await waitFor(async () => ((await xtermRows(app).textContent()) ?? "").trim().length > 0, {
    timeoutMs: 3_000,
    message: "terminal never rendered non-empty pane content",
  });
});

test("typing fast into the terminal arrives at the real pane in order (no keystroke scrambling)", async ({
  app,
  panePicker,
}) => {
  await openFirstPane(app);

  const marker = `kanhrd-e2e-${Date.now()}`;
  await terminalContainer(app).click();
  // page.keyboard.type sends one key event per character with no artificial
  // delay — this is the exact input pattern that produced scrambled output
  // in tier-2 round 1 (per-keystroke unawaited sends racing over separate
  // herdr socket connections).
  await app.keyboard.type(`echo ${marker}\r`);

  await waitFor(
    async () => (await herdrPaneRead(panePicker.id)).includes(`echo ${marker}`),
    { timeoutMs: 5_000, message: `marker "${marker}" never landed in order at the real pane` },
  );
});

test("output typed externally via herdr appears live in the terminal DOM (no reload)", async ({
  app,
  panePicker,
}) => {
  await openFirstPane(app);
  // Let the initial pane.read + pane.subscribe_output snapshot settle before
  // driving an external change, so this test isolates the live-update path
  // (pane.output event -> xterm.write) rather than the initial-load path.
  await waitFor(async () => ((await xtermRows(app).textContent()) ?? "").trim().length > 0, {
    timeoutMs: 3_000,
  });

  const marker = `kanhrd-e2e-live-${Date.now()}`;
  // Bypasses the bridge/browser entirely — proves the poller's hash-fallback
  // dedup (worked around herdr's revision:0 bug) actually delivers events
  // end-to-end into the mounted terminal, not just that the browser can
  // render its own input locally.
  await herdrPaneSendText(panePicker.id, `echo ${marker}\r`);

  await waitFor(
    async () => ((await xtermRows(app).textContent()) ?? "").includes(marker),
    { timeoutMs: 3_000, message: `externally-sent marker "${marker}" never appeared in the terminal DOM` },
  );
});

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
