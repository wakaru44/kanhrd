# kanhrd E2E suite

Playwright suite covering kanhrd's tiered contracts end-to-end against a
real, running local `herdr` — no mocks. This replaces the throwaway
Playwright driver L5B used during tier-2 validation
(`tmp/foreman/VALIDATION-TIER2.md`); future tiers extend this suite instead
of re-implementing a driver from `/tmp/`.

## Prerequisites

1. A local herdr server reachable at `~/.config/herdr/herdr.sock`, with at
   least one open pane. The suite pre-flight-checks this in `beforeAll` and
   skips with a clear message (not a hard fail) if herdr isn't running or has
   no panes.
2. Build the SPA and bridge (the suite does not build them for you):
   ```bash
   pnpm --filter @kanhrd/web build
   pnpm --filter @kanhrd/bridge build
   ```
   Playwright's `webServer` (see `playwright.config.ts`) spawns
   `node ../bridge/dist/main.js` from `apps/web/`, which serves the built SPA
   from `apps/web/dist/web/browser/` and proxies `/api` + `/ws` to herdr. If a
   bridge is already running on `127.0.0.1:5173`, the config reuses it
   (`reuseExistingServer: true`) instead of spawning a second one.
3. First time only, install the Chromium browser Playwright drives:
   ```bash
   pnpm --filter @kanhrd/web test:e2e:install
   ```

## Running

From the repo root:

```bash
pnpm test:e2e
```

Or from `apps/web/`:

```bash
pnpm test:e2e          # headless run
pnpm test:e2e:ui       # interactive debug UI
```

## What's covered

- **`tier1.board.spec.ts`** — kanban board rendering against real herdr
  panes: brand/title, one host chip per configured host (`local`), at least
  one real card, every card's host chip, status-filter-chip toggling
  (hide/restore a column), host-filter-chip toggling (hide/restore all
  cards).
- **`tier2.terminal.spec.ts`** — click card → `/pane/:host/:id` → xterm.js
  terminal: mount + initial content render, an adversarial fast-typing test
  that types a marker character-by-character with no delay and verifies it
  lands *in order* at the real pane via the `herdr` CLI (the exact scenario
  that broke keystroke ordering in tier-2 round 1 — see
  `tmp/foreman/VALIDATION-TIER2.md`), and a live-update test that sends text
  to the pane *externally* (bypassing the browser) and asserts it appears in
  the terminal DOM within 3s (proves the `pane.output` polling/dedup path
  is actually delivering events end-to-end).

## Fixtures

- **`fixtures/kanhrd.ts`** — Playwright `test.extend` providing:
  - `app`: navigates to `/` and waits for the board's loading state to
    resolve, so specs don't repeat that boilerplate.
  - `panePicker`: reads the first available card's `{ host, id }` from its
    `/pane/:host/:id` link, so tests never hardcode a pane id that may not
    exist on the next run.
- **`fixtures/herdr.ts`** — thin wrapper around the `herdr` CLI (assumed on
  `PATH`) for driving/verifying real herdr state independently of the
  bridge and browser: `herdrPaneList`, `herdrPaneRead`, `herdrPaneSendText`,
  `herdrPaneSendKeys`, and the `herdrAvailable()` pre-flight check.

## Known app-behavior gap this suite works around

Navigating tier-2 tests always clicks a card (SPA-internal routing) rather
than `page.goto()`-ing straight to a `/pane/:host/:id` URL. A direct
full-page load of that deep link does not trigger the pane-detail
component's `pane.read`/`pane.subscribe_output` calls — confirmed by
inspecting WS traffic, where a cold deep-link load sends zero pane-detail
requests, while an SPA-internal card click sends the expected
`pane.read` + `pane.subscribe_output` pair immediately. That's a real gap in
the app's routing (out of this lane's file scope — `apps/web/src/**` belongs
to L3B/L3C), not an E2E suite bug; this suite documents it here and tests the
flow the brief actually describes and real users actually take.

## Mobile viewport

**`mobile.spec.ts`** runs only under the `mobile` Playwright project
(`playwright.config.ts`, `devices['iPhone 13']`, ~390x844) and smoke-tests
the SPA at phone aspect ratios: board renders, card text stays inside the
viewport, the rail's below-900px hidden state, filter chip tap-target size,
click-card-to-terminal navigation, the header `+` menu staying on-screen, and
no page-level horizontal scrollbar. It reuses the same `app`/`panePicker`
fixtures and `herdrAvailable()` pre-flight skip as the desktop specs.

Run it on its own:

```bash
pnpm --filter @kanhrd/web test:e2e --project=mobile
```

`pnpm test:e2e` (no `--project` filter) runs both the `chromium` (desktop)
and `mobile` projects in one go; each project's `testMatch`/`testIgnore`
keeps `mobile.spec.ts` off the desktop project and the tier specs off the
mobile project.

Known layout quirks at this width (intentional, not bugs — see comments in
`mobile.spec.ts`):

- `.rail` (workspace/tab nav) is `display: none` below 900px, with no
  toggle affordance replacing it yet.
- `.board-grid` switches to horizontal scroll-snap columns below 1100px.

## Adding a new tier's tests

Create `tierN.<feature>.spec.ts` next to the existing specs. Import the
`app`/`panePicker` fixtures from `./fixtures/kanhrd` instead of
`@playwright/test` directly (it re-exports `expect` too), and reach for
`./fixtures/herdr` when a test needs to drive or verify pane state outside
the browser. Add new semantic selectors to `helpers/selectors.ts` rather
than inlining CSS selectors in spec files, so a markup change only needs
updating in one place.

## A note on destructive input

Tests that type into a real terminal use `echo <marker>\r` (or similar
side-effect-free shell commands), never destructive input. A pane under
test may be a plain shell (as used here) or, in principle, a real running
agent — harmless markers keep the suite safe to run against either without
special-casing which one it is.
