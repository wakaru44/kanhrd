# mobile-e2e-playwright-project Specification

## Purpose
A dedicated Playwright project running a real mobile viewport/UA against
the kanhrd SPA, so mobile-only layout and touch-target regressions are
caught by CI instead of only being visible on a real phone.
## Requirements
### Requirement: Mobile specs run at a real phone viewport and UA
The `mobile` Playwright project SHALL run `mobile.spec.ts` using
`iPhone 13` viewport, user-agent, and touch characteristics, and SHALL NOT
run any other e2e spec file. The desktop `chromium` project SHALL NOT run
`mobile.spec.ts`.

#### Scenario: Running the mobile project only exercises mobile specs
- **WHEN** `pnpm --filter @kanhrd/web test:e2e --project=mobile` runs
- **THEN** only `mobile.spec.ts` executes, at the iPhone 13 viewport

### Requirement: Mobile suite catches layout overflow and unreachable nav
The mobile suite SHALL assert that card text stays within the viewport,
that no page-level horizontal scrollbar appears, and that primary
navigation (opening a pane's terminal detail) is reachable at phone
viewport width.

#### Scenario: A layout regression that causes horizontal overflow fails the suite
- **WHEN** a CSS change causes the board to overflow the viewport width at 390px
- **THEN** the mobile suite's no-horizontal-scrollbar assertion fails

### Requirement: Mobile suite asserts a minimum touch target for filter chips
The mobile suite SHALL assert that filter-bar chips render at or above a
minimum tap-target height, as a hard (non-skippable) assertion.

#### Scenario: Undersized chips fail the suite
- **WHEN** a filter-bar chip renders shorter than the minimum tap-target height at mobile viewport
- **THEN** the mobile suite's touch-target assertion fails the test run

