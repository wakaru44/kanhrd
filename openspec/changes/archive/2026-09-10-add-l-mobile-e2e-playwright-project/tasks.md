## 1. Playwright project

- [x] 1.1 Add `mobile` project: `devices['iPhone 13']`, `browserName: "chromium"` (forced, since only Chromium is installed and the device preset defaults to WebKit) — `apps/web/playwright.config.ts`
- [x] 1.2 `testMatch: /mobile\.spec\.ts$/` on `mobile`, matching `testIgnore` on `chromium` so the projects don't double-run each other's specs — `apps/web/playwright.config.ts`

## 2. Spec coverage

- [x] 2.1 Board renders and card text stays inside the phone-sized viewport — `apps/web/e2e/mobile.spec.ts`
- [x] 2.2 Rail's below-900px hidden state — `apps/web/e2e/mobile.spec.ts`
- [x] 2.3 Filter-chip tap-target size — `apps/web/e2e/mobile.spec.ts`
- [x] 2.4 Click-card navigation to the terminal view at mobile viewport — `apps/web/e2e/mobile.spec.ts`
- [x] 2.5 Header `+` menu stays on-screen; no page-level horizontal scrollbar — `apps/web/e2e/mobile.spec.ts`

## 3. Fixture reuse

- [x] 3.1 Reuse the shared `app`/`panePicker` fixtures and `herdrAvailable()` pre-flight skip from the desktop specs — `apps/web/e2e/mobile.spec.ts`, `apps/web/e2e/fixtures/kanhrd.ts`

## 4. Validator

- [x] 4.1 `openspec validate add-l-mobile-e2e-playwright-project --strict` passes with zero errors
