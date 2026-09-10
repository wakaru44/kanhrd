## Why

`README.md` promises a gallery and then withdraws it:

> A fuller gallery — desktop board, terminal detail, settings, and a
> composite of the six terminal palettes — is pending a mock-bridge
> harness that can produce reproducible captures. Until then this
> section is deliberately empty rather than staged.

**That harness now exists.** Commit `19df88e` landed
`apps/web/e2e/viewport-matrix.spec.ts`: fully mocked, intercepting
`/api/hosts` and the `/ws` transport before `page.goto('/')`, driven by
a deterministic 600-pane fixture whose doc comment records that it is
"intentionally deterministic (no `Math.random`)". It already walks four
viewports × six board states. It simply never calls `page.screenshot()`.

So the README's stated precondition is met and its gallery paragraph is
stale. What is *not* met is the harder half of "reproducible", and this
change exists to close that gap before a single binary is committed.

**The unsolved half is time, not data.** Every card renders
`formatElapsed(clock.now() - statusSince)` (`board/card.ts`, `util/clock.ts`).
`ClockTick` is a root signal driven by a live `setInterval`, so two
capture runs of the same fixture differ in the "since" text on every
card. Screenshots live in Git LFS (`.gitattributes` routes `*.png`), and
an LFS blob is kept forever — committing captures that churn on every
regeneration is a cost that compounds and never comes back.

## What Changes

### Phase A — deterministic board captures

- **A capture spec** (`apps/web/e2e/capture.spec.ts`) reusing the
  existing mock installer and fixtures from `viewport-matrix.spec.ts`
  and `fixtures/six-hundred-panes.ts`. No second mock implementation,
  and no second answer to "what does a populated board look like".
- **Time is frozen before navigation.** `page.clock.install({ time })`
  at a fixed epoch, then `page.clock.pauseAt()` advanced a fixed
  interval past load, so elapsed text renders a stable *and* plausible
  value rather than the `0s` a bare freeze would produce (`statusSince`
  is seeded at card construction, so a frozen clock with no advance
  shows every card at zero). Playwright `^1.63.0` is already the pinned
  version and `page.clock` has been available since 1.45.
- **Capture never runs by accident.** It is its own Playwright project,
  excluded from the `chromium` and `mobile` projects, and gated behind
  an explicit `make screenshots`. `make test-e2e` and CI SHALL NOT
  rewrite committed binaries.
- **A determinism gate.** The capture run takes each shot twice and
  fails if the two buffers differ, so a churning capture is caught
  before it reaches LFS rather than after.
- **A curated set, not the matrix.** The 4 × 6 matrix is 24 cells and
  exists to probe contrast, keyboard and paint timing — not to be
  published. This change commits a small named set (see `design.md`),
  because every committed capture is a permanent LFS blob.
- **`README.md`'s gallery paragraph is replaced** with the captures
  this change produces, and the stale "pending a mock-bridge harness"
  sentence goes.

### Phase B — terminal, settings, palettes (not in phase A)

The README promises three subjects the current mock does not cover:
terminal detail needs mocked pane output over `/ws`; the settings
capture needs a seeded settings state; the six-palette composite needs
six permutations plus a compositing step. Each is a separate lane, and
phase A does not block on them — it replaces the empty section with a
real board gallery and leaves the remaining three named as pending.

## Impact

- `apps/web/e2e/capture.spec.ts` — **new**.
- `apps/web/e2e/fixtures/six-hundred-panes.ts` — unchanged; imported.
- `apps/web/e2e/viewport-matrix.spec.ts` — its mock installer is
  exported for reuse. Behaviour unchanged; this change adds no
  assertion to it and removes none.
- `apps/web/playwright.config.ts` — a third project, `capture`, with
  `testMatch: /capture\.spec\.ts$/`, and `testIgnore` added to the two
  existing projects so the spec runs in exactly one place.
- `Makefile` — a `screenshots` target with a `## description` comment,
  per the self-documenting convention.
- `docs/screenshots/*.png` — the committed captures (LFS).
- `README.md` — the gallery section.
- **No change to** `apps/web/src/**`, `apps/bridge/**`,
  `packages/schema/**`, or any wire method. The clock is frozen from
  the test side; `util/clock.ts` is not touched.

## Non-goals

- **No app-code seam for testing.** `ClockTick` gains no injectable
  override and no `TESTING` branch; `page.clock` does the job from
  outside.
- **No capture in CI.** Regenerating committed binaries is a deliberate,
  human-run act. CI SHALL NOT run the capture project.
- **No cross-machine byte guarantee.** Font rasterisation differs
  between machines, so the determinism gate is *two consecutive runs on
  one machine*, not a hash checked into the repo. See `design.md`.
- **No screenshot-diff regression testing.** This change publishes
  documentation images. It does not introduce visual regression
  assertions, which would need the cross-machine guarantee above.
- **No live herdr.** The capture path is fully mocked, per the
  repo rule that tests never touch the operator's socket.

## Open questions

- **S1. Which captures get committed?** `design.md` proposes a set of
  four. Every one is a permanent LFS blob, so the list is a maintainer
  call, not this lane's.
- **S2. Should the 600-pane state be published at all?** It proves
  kanhrd survives density, but it is not what an operator's board looks
  like, and a reader may take it as representative.
