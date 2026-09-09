## Why

kanhrd's e2e suite only ever ran at desktop viewport sizes, so mobile
layout regressions (overflow, unreachable nav, too-small tap targets) had
no automated coverage. This is a retroactive OpenSpec record of the
L-MOBILE-E2E lane, written after the fact because the work landed without
a proposal. Commit: `7b26e0a` (`web`), predating the L-UX polish pass that
later fixed the touch-target/nav gaps this lane flagged.

## What Changes

- Add a second Playwright project, `mobile`, to `apps/web/playwright.config.ts`:
  `devices['iPhone 13']` viewport/UA/touch characteristics, forced to the
  Chromium engine (the device preset defaults to WebKit, but only Chromium
  is installed via `test:e2e:install`, and Chromium is what the brief
  asked for). `testMatch: /mobile\.spec\.ts$/` keeps it scoped to the one
  spec file; the existing `chromium` (desktop) project gets a matching
  `testIgnore` so the two projects never double-run each other's specs.
- Add `apps/web/e2e/mobile.spec.ts`: smoke tests at phone aspect ratio
  (~390x844) — board renders, card text stays inside the viewport, the
  rail's below-900px hidden state, filter-chip tap-target size, click-card
  navigation to the terminal view, the header `+` menu staying on-screen,
  and no page-level horizontal scrollbar.
- At the time this landed, the spec documents two layout states as
  "intentional, not bugs" rather than failures: the rail being fully
  hidden below 900px with no toggle affordance yet, and the board
  switching to horizontal scroll-snap columns below 1100px. (The rail gap
  was closed by the later `add-l-ux-theme-and-polish` lane's hamburger
  drawer; the touch-target chip assertion became a hard assertion in that
  same later lane rather than an annotate-only check.)
- Reuse the same `app`/`panePicker` fixtures and `herdrAvailable()`
  pre-flight skip as the desktop specs, so the mobile project degrades
  gracefully with no live herdr server, same as the rest of the suite.

## Capabilities

### New Capabilities
- `mobile-e2e-playwright-project`: a dedicated Playwright project running a
  subset of e2e specs at a real mobile viewport/UA, catching mobile-only
  layout and touch-target regressions that a desktop-only suite can't see.

### Modified Capabilities
(none)

## Impact

- Affected code: `apps/web/playwright.config.ts`, `apps/web/e2e/mobile.spec.ts`.
- Affected systems: none — extends the existing Playwright e2e suite;
  requires the same live herdr server as the rest of that suite to run for
  real, and skips gracefully otherwise.
