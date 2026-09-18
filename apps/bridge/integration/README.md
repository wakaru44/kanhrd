# @kanhrd/bridge integration tests

Permanent bridge-integration suite closing the "throwaway `/tmp/` smoke
script" gap called out after tier-2/tier-3 validation: every recurring
`curl`/`wscat`/Node-WS-script check a validator hand-wrote is now a committed
vitest test here instead.

## What this covers vs. the rest of the test pyramid

- `apps/bridge/src/**/*.test.ts` (unit, `pnpm --filter @kanhrd/bridge test`) —
  bridge logic against **fake** herdr sockets. Fast, hermetic, no live herdr
  needed. This suite does not duplicate that coverage.
- `apps/bridge/integration/**` (this directory, `pnpm test:int`) — the real
  bridge process, real herdr socket, real HTTP + WS wire traffic. Proves the
  boundary the unit tests fake out.
- `apps/web/e2e/**` (Playwright, `pnpm test:e2e`) — browser-level flows
  (DOM, xterm.js, click-through UX). This suite does not duplicate that
  either; it stays below the browser, at the bridge's own HTTP/WS surface.

## Running

```bash
pnpm install
pnpm test:int                          # from repo root
# or
pnpm --filter @kanhrd/bridge test:int  # scoped
```

### Isolation

This suite never touches the operator's herdr. `vitest.integration.config.ts`
runs `fixtures/global-setup.ts` once per run, which:

1. sweeps any `kanhrd-test-*` herdr session a crashed run leaked;
2. starts its own headless session, `kanhrd-test-int`, at
   `~/.config/herdr/sessions/kanhrd-test-int/herdr.sock`;
3. seeds it with one workspace and two bare shell panes, cwd'd into this
   repository (the bridge derives `Pane.project` from a pane's own cwd);
4. stops and deletes the session on teardown.

`fixtures/bridge.ts` generates a config naming that socket and starts the
bridge with `--config`; it never uses the bridge's built-in default, whose
one host is `~/.config/herdr/herdr.sock`. `fixtures/herdr-cli.ts` prefixes
every CLI call with `--session kanhrd-test-int` and throws if the run has no
session, so there is no fallback path to the default socket — a suite that
cannot isolate itself fails or skips rather than borrowing the operator's
workspace.

`herdr` on `PATH` is the only precondition. Having panes open is no longer
one: the run seeds its own. Without herdr, every test file skips with a
clear reason rather than failing on connection-refused noise.

Test files run sequentially (`fileParallelism: false` in
`vitest.integration.config.ts`), not in parallel — several files churn or
type into the same live workspace/panes, and Playwright's own suite makes
the identical call for the identical reason.

## Layout

```text
fixtures/
  herdr-session.ts    throwaway herdr sessions: sweep, start, seed, dispose, handoff
  global-setup.ts     vitest globalSetup — one session per run, disposed on teardown
  bridge.ts           spawns the real bridge (tsx src/main.ts --port 0 --config <generated>),
                      waits for "Server listening at http://127.0.0.1:<port>", tears down after
  ws-client.ts        IntegrationClient — ws-backed request/response + event waiter
  herdr-cli.ts        Node-friendly herdr CLI driver (mirrors apps/web/e2e/fixtures/herdr.ts)
  require-herdr.ts    shared skip-gracefully guard (asks "does this run have a session?")
connectivity.test.ts  A. lifecycle + connectivity (HTTP)
ws-methods.test.ts    B. WebSocket protocol methods
ordering.test.ts      C. ordering guarantees (the two round-1 blocker bugs)
lifecycle.test.ts     D. tier-3 pane/tab/workspace lifecycle CRUD + events
pane-destinations.test.ts
                      F. creation destinations and pane.move's cascade
```

`fixtures/herdr-cli.ts` is a deliberate re-implementation, not an import, of
`apps/web/e2e/fixtures/herdr.ts` — Playwright fixtures are TS-project-scoped
to `apps/web` and this package has its own tsconfig/runner. The function
names/shapes are kept identical where the two overlap (`herdr()`,
`herdrPaneList()`, `herdrPaneRead()`, `herdrPaneSendText()`,
`herdrPaneSendKeys()`, `herdrAvailable()`) so a future extraction to a shared
`@kanhrd/*` package, if both suites keep growing, is a mechanical move.

## Bridge-as-subprocess vs. library import

Chose subprocess (`node --import tsx src/main.ts --port 0`) over importing
`main()` as a library function. `apps/bridge/src/main.ts` isn't structured
as an importable entry point today (top-level `main().catch(...)` with
`process.exit`), and a subprocess is also the more honest test of what this
suite is meant to prove — that the _actual_ CLI-launched bridge process
starts, binds, and serves correctly, not just that its internals compose
when driven in-process. `tsx` (already a bridge devDependency, used by its
own `dev` script) avoids a `dist/` build step, so `pnpm install` →
`pnpm test:int` works with no intermediate `pnpm build`.

## Cleanup

Every test that creates herdr state (throwaway tabs) tears it down itself —
via the operation under test where that already removes it (e.g. D1's
`tab.close`), or a `finally`/`afterAll` fallback otherwise. `afterAll` blocks
log a `[integration] leftover ...` warning and best-effort clean up if a test
crashed mid-way, so a crashed run doesn't strand state silently.

The session itself is the outer backstop: whatever a crashed run leaves
behind dies with `kanhrd-test-int`, and if the run dies before its teardown
the next run's sweep disposes of the leaked session by name prefix before
starting its own.

## Coverage → historical ad-hoc validation

See the top-level lane report for the full table; the essentials:

| Suite check                                           | Historical ad-hoc equivalent                                                                                                    |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| A1-A3 (start, `/api/hosts`, `/api/hosts/:host/panes`) | VALIDATION.md checks 1-3 (manual `tsx watch` + `curl`)                                                                          |
| A4 (churn survives)                                   | VALIDATION-TIER3.md's flapping-host root-cause investigation — regression test for the stale-`pane_id`-kills-the-connection bug |
| B1-B7 (WS methods)                                    | VALIDATION-TIER2.md checklist items 3-10 (raw-WS Node script, `/tmp/kanhrd-ws-test.mjs`)                                        |
| C1 (burst-send ordering)                              | VALIDATION-TIER2.md round-1 Finding B / round-2 re-verification (`ndl-2r-5akbmkaherr` scramble)                                 |
| C2 (live-update polling)                              | VALIDATION-TIER2.md round-1 Finding A / round-2 re-verification (stuck-at-zero `revision`, content-hash fallback)               |
| D1-D2 (tab CRUD + events)                             | VALIDATION-TIER3.md's manual tab-CRUD smoke (only static-reviewed there, blocked by the connectivity bug)                       |
| F1-F3 (destinations + move cascade)                   | openspec `add-pane-destinations` task 5.2 — herdr semantics the SPA rests on and no unit test can prove                         |
