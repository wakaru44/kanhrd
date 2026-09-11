# kanhrd E2E suite

Playwright suite covering kanhrd's tiered contracts end-to-end against a
real, running local `herdr` — no mocks. This replaces the throwaway
Playwright driver L5B used during tier-2 validation
(`tmp/foreman/VALIDATION-TIER2.md`); future tiers extend this suite instead
of re-implementing a driver from `/tmp/`.

## Isolation — read this first

These specs drive a **real herdr**, but never the operator's. Playwright's
`webServer` is `e2e/fixtures/isolated-bridge.mjs`, which on every run:

1. sweeps any `kanhrd-test-*` herdr session a crashed run leaked;
2. starts its own headless session, `kanhrd-test-e2e`, at
   `~/.config/herdr/sessions/kanhrd-test-e2e/herdr.sock`;
3. seeds it with one workspace and two bare shell panes, cwd'd into this
   repository;
4. starts the bridge with `--config` naming that socket, on port 5273;
5. stops and deletes the session when the run ends.

So the panes these specs type into, split and close are the run's own, and
`~/.config/herdr/herdr.sock` — the operator's live session — is never opened.
`fixtures/herdr.ts` enforces it: every `herdr` call it makes is prefixed
`--session kanhrd-test-e2e`, and it throws rather than falling back if the
run has no session.

Why this exists: on 2026-09-10 a suite run typed `echo <marker>` into the
operator's real panes, one of which was running an agent, which executed it
as a prompt. Nothing was damaged — the payload is deliberately
non-destructive — but the only guard at the time was an opt-in environment
variable, which is a prompt for a human, not isolation.

`KANHRD_E2E_LIVE_HERDR` is gone. It gated nothing once the run owned its own
session, and a variable that reads like a safety switch but controls nothing
is worse than no variable at all.

### Two tiers of spec

- **Mocked** (`viewport-matrix`, `capture`, `terminal-flicker`, and the
  no-hosts half of `empty-state`) — `page.route`-backed, no herdr at all.
  These MUST pass on a machine with no herdr installed and no opt-in.
- **Live** (everything else) — needs the run's herdr session, and **skips**
  with that reason when there is none. Each such file says so in its header.

Verified 2026-09-11 with `herdr` shimmed off `PATH`:
`28 passed, 64 skipped, 0 failed`.

## Prerequisites

1. Build the SPA and bridge (the suite does not build them for you):

   ```bash
   pnpm --filter @kanhrd/web build
   pnpm --filter @kanhrd/bridge build
   ```

   The launcher serves the built SPA from `apps/web/dist/web/browser/`.

2. `herdr` on `PATH` if you want the live specs to run. Without it they
   skip; the mocked ones still pass.

3. First time only, install the Chromium browser Playwright drives:

   ```bash
   pnpm --filter @kanhrd/web test:e2e:install
   ```

Note `reuseExistingServer: false`: if anything is already listening on
`127.0.0.1:5273` the run fails outright rather than attaching to a server it
did not start. Override the port with `KANHRD_E2E_PORT` if you need to.

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
  lands _in order_ at the real pane via the `herdr` CLI (the exact scenario
  that broke keystroke ordering in tier-2 round 1 — see
  `tmp/foreman/VALIDATION-TIER2.md`), and a live-update test that sends text
  to the pane _externally_ (bypassing the browser) and asserts it appears in
  the terminal DOM within 3s (proves the `pane.output` polling/dedup path
  is actually delivering events end-to-end).

## Fixtures

- **`fixtures/kanhrd.ts`** — Playwright `test.extend` providing:
  - `app`: navigates to `/` and waits for the board's loading state to
    resolve, so specs don't repeat that boilerplate.
  - `panePicker`: reads the first terminal-capable card's `{ host, id }`
    from its `<a class="card-open">` link, so tests never hardcode a pane id
    that may not exist on the next run. The card is a `<div class="card">`
    grid whose opening link and `.card-actions` are siblings — `.card` is
    not an anchor, so never read `href` off it.
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
the app's routing (out of this suite's file scope — `apps/web/src/**` belongs
to L3B/L3C), not an E2E suite bug; this suite documents it here and tests the
flow the brief actually describes and real users actually take.

## Keyboard

**`keyboard.spec.ts`** covers the herdr/tmux-style prefix keyboard shortcuts
(L-KEYS) from `src/app/state/keyboard.service.ts`: default prefix `Ctrl+B`,
a two-stage chord (press prefix, release, then the action key within 2s).

- `?` opens the help overlay (`app-keyboard-help-overlay`), grouped into
  Navigation / Lifecycle / View / Help sections; `Escape` closes it.
- `prefix+t` toggles the theme through `KeyboardService` -> `ThemeService`.
- `prefix+n` advances the rail's "current tab" (`PanesStore.tabFilterSignal`)
  to the next tab.
- `Escape` also closes the header `+` menu.
- Focused inputs — including xterm.js's terminal, whose hidden input is a
  real `<textarea>` (`.xterm-helper-textarea`) — suppress shortcut handling
  entirely, so `Ctrl+B` reaches the terminal instead of arming the prefix
  chord. Verified indirectly (per this suite's herdr-CLI pattern): focus a
  real pane's terminal, send `prefix+c`, and confirm via `herdr pane list`
  that no new pane was created.

`prefix+x` (close current pane) is a documented no-op today — the board
renders every pane simultaneously with no single "focused pane" concept to
act on, unlike herdr's own single-pane TUI view — so it isn't covered here.
Selectors specific to this markup are kept local to `keyboard.spec.ts`
rather than added to `helpers/selectors.ts`, matching `tier3.spec.ts`'s
precedent.

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

`mobile.spec.ts` implements the numbered acceptance criteria in
`docs/UX-GUIDELINES.md` § "E2E-assertable requirements" — each test title
carries the criteria numbers it covers, so a renumbering there is traceable
here. Coverage: board populated (1-9), board paging and the status switcher
(10-22), board empty (23-24), pane detail (25-28), settings (29-31), the nav
drawer (32-36) and toasts (37-38).

Criterion 13 ("a hard fling must not skip a column") is the one
individually skipped test in the suite. `scroll-snap-stop: always` is
declared and asserted by criterion 10; headless Chromium's synthesized
gesture path does not honour it (a bare control page with only those CSS
declarations overshoots identically), while real iOS/Android do. The skip
carries that reason inline.

Layout facts at this width (intentional, not bugs):

- `.rail` (workspace/tab nav) is `display: none` below 900px; the header
  hamburger (`LucideMenu`) opens it as an overlay drawer with a backdrop.
- The board becomes a one-column-per-screen pager: `.board-strip` with
  `scroll-snap-type: x mandatory` and `flex: 0 0 100%` columns, driven by
  the `app-status-switcher` segmented control. The specs select
  `.board-strip`, never the `.board-grid` compatibility alias.

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

## Conventions this suite holds itself to

- **No hover-reveal assertions.** Card and rail-row actions are visible on
  first render (`docs/UX-GUIDELINES.md`, "Visible affordances"); rail rows
  and compact/touch cards act through a visible `LucideMoreHorizontal`
  overflow trigger. A spec that hovers before clicking is a stale spec.
- **Expected copy is imported, never retyped.** Confirmation titles, bodies
  and toast text come from `src/app/shared/copy.ts` (`COPY.confirm.*`,
  `COPY.toast.*`), so the next copy change fails in exactly one place. The
  settings screen's own `SETTINGS_COPY` block is the one exception — it
  still lives in `src/app/settings/settings.ts` pending a lift into
  `copy.ts`.
- **Keyboard bindings are narrow on purpose.** An unmodified `?` is not
  forwarded at all and an unmodified `Escape` only while app chrome is
  open; help is `prefix + ?`. Specs assert that narrowing rather than the
  old global behaviour.
- **`--danger-fill` is reserved** for irrecoverable local-data loss, so a
  confirm button is matched on `.btn.primary`, not `.btn.danger`.
