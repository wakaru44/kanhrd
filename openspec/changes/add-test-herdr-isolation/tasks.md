## 0. Gate — maintainer decisions

Answered 2026-09-11. See `proposal.md` § "Maintainer decisions"; do not
re-ask.

- [x] 0.1 Q1: **one session per suite**, `fileParallelism: false` stays.
      Running servers are not free.
- [x] 0.2 Q2: **mocked e2e passes anywhere with no herdr and no opt-in;
      live e2e and integration skip when no herdr is reachable.** The
      mock suite is currently 27 of 91 specs — widening it is section 4,
      not an aside.
- [x] 0.3 Q3: **bare shell panes.** A spec needing a real agent's
      transitions skips with that reason; it never fails, and never
      justifies seeding agents everywhere. kanhrd renders what the wire
      says; herdr's agent detection is herdr's to prove.

## 1. Confirm the primitive

Established experimentally against herdr 0.8.2 on 2026-09-11. Observed
output, not assertion; encoded in
`apps/bridge/integration/fixtures/herdr-session.ts`.

- [x] 1.1 `herdr --session <name> server` starts it headlessly, no TTY,
      no interaction. There is no `herdr session create` — the server
      subcommand creates the session as a side effect.

      ```text
      $ herdr --session kanhrd-test-probe1 server
      herdr server running; you can use any herdr CLI command in another terminal.
      api socket: ~/.config/herdr/sessions/kanhrd-test-probe1/herdr.sock
      client socket: ~/.config/herdr/sessions/kanhrd-test-probe1/herdr-client.sock
      logs: ~/.config/herdr/sessions/kanhrd-test-probe1/herdr-server.log
      ```

- [x] 1.2 Socket path is `~/.config/herdr/sessions/<name>/herdr.sock`, and
      `herdr session list` reports it in its fourth column:

      ```text
      name                 status   directory                                  socket
      default              running  ~/.config/herdr                            ~/.config/herdr/herdr.sock
      kanhrd-test-probe1   running  ~/.config/herdr/sessions/kanhrd-test-probe1  ~/.config/herdr/sessions/kanhrd-test-probe1/herdr.sock
      ```

      Readiness = `session list` says `running` **and** the socket file
      exists **and** `herdr --session <name> pane list` exits 0. The
      socket file appears before the server answers, so file existence
      alone is not enough; `startTestSession()` polls all three.

- [x] 1.3 `stop` then `delete` disposes of it completely:

      ```text
      $ herdr session stop kanhrd-test-probe1
      stopped session kanhrd-test-probe1
      # dir still holds session.json + herdr-server.log at this point
      $ herdr session delete kanhrd-test-probe1
      deleted session kanhrd-test-probe1
      $ ls ~/.config/herdr/sessions/     # empty
      $ herdr session list               # only `default`
      ```

      `delete` requires the session to be stopped first, so both calls are
      needed and in that order.

- [x] 1.4 A headless named session creates workspaces, tabs and panes with
      no TTY, and its panes are real shells that accept input:

      ```text
      $ herdr --session kanhrd-test-probe1 workspace create --label kanhrd-test-ws --cwd <repo>
      {"result":{"root_pane":{"pane_id":"w1:p1","tab_id":"w1:t1","cwd":"<repo>",...},
                 "workspace":{"workspace_id":"w1","label":"kanhrd-test-ws",...}}}
      $ herdr --session kanhrd-test-probe1 pane send-text w1:p1 "echo kanhrd-isolation-probe"
      $ herdr --session kanhrd-test-probe1 pane send-keys  w1:p1 Enter
      $ herdr --session kanhrd-test-probe1 pane read w1:p1 --format text --source recent
      kanhrd ➤ echo kanhrd-isolation-probe
      kanhrd-isolation-probe
      ```

      **Divergence from the proposal's assumption:** a fresh named session
      starts with **zero** workspaces, tabs and panes — not a default one.
      Every suite must therefore seed its own world, which is why
      `seedSession()` exists and why task 2.6 could be satisfied by
      deletion rather than relaxation.

## 2. Integration suite

- [x] 2.1 `fixtures/herdr-session.ts` + `fixtures/global-setup.ts`
      (registered as vitest `globalSetup`): starts `kanhrd-test-int`,
      waits for it to answer, seeds it, hands the socket to the fixtures,
      and stops+deletes it in `teardown()` — which vitest runs on failure
      as well as success. A hard crash is covered by 2.2's sweep.
- [x] 2.2 `sweepLeakedSessions()` runs before every session start. It
      only ever acts on names carrying the `kanhrd-test-` prefix, and
      `disposeTestSession()` throws on anything else, so `default` can
      never be swept. Proven in 6.3.
- [x] 2.3 `writeIsolatedConfig()` in `fixtures/bridge.ts` writes
      `hosts: [{ name: local, socket: <run's socket> }]` to a temp file
      and `startBridge()` passes `--config` alongside the existing
      `--port 0`. `assertIsolatedSocket()` refuses to write a config
      naming anything outside a `kanhrd-test-*` session directory.
- [x] 2.4 `herdr-cli.ts`'s `herdr()` prefixes `--session <run's session>`
      on every call and throws when the run has no session handoff.
      `herdr-session.ts` is the only module that calls `herdr`
      un-targeted, and only for session management.
- [x] 2.5 `seedSession()` creates one workspace (cwd = repo root, so the
      bridge's `.git` walk resolves `Pane.project`) plus a second pane via
      `pane split`. The four test files now take their pane/workspace ids
      from `seededWorld()` instead of `herdrPaneList()[0]`, so they assert
      on panes the run made.
- [x] 2.6 Deleted. `herdrAvailable()` no longer counts panes; the
      question it asks is "does this run have a session?".

## 3. Playwright

- [x] 3.1 `webServer.command` is `node e2e/fixtures/isolated-bridge.mjs`,
      which starts the run's session and then spawns the bridge with
      `--config` naming its socket.

      **Design call the change was silent on:** Playwright starts
      `webServer` *before* `globalSetup` (`createGlobalSetupTasks()` puts
      plugin setup tasks first), so the session cannot be started from a
      global hook and handed to an already-running bridge. The launcher
      owns the whole lifecycle instead. It is plain `.mjs` because
      `webServer.command` is a shell command and `tsx` is not resolvable
      from `apps/web`.

      Two further isolation fixes landed here, neither named by the
      original tasks:
      - `reuseExistingServer: false` (was `true`) — a run could silently
        attach to whatever was already on the port, i.e. the operator's
        own bridge against their live herdr. It now fails outright.
      - port 5273 (was 5173, the bridge's own default), so a normal run
        does not even contend for the operator's port.
      - `gracefulShutdown: { signal: 'SIGTERM', timeout: 10_000 }`, so the
        launcher can dispose of its session; without it Playwright
        SIGKILLs the process group and every run leaks a session for the
        next sweep to find.

- [x] 3.2 The launcher seeds the session (one workspace, two bare shell
      panes, cwd = repo root) before the bridge starts, and records the
      ids in the handoff `fixtures/herdr.ts` exposes as `seededWorld()`.
      The live specs pick their pane off the board via the existing
      `panePicker` fixture, which now resolves to a seeded pane.
- [x] 3.3 Re-scoped. `LIVE_HERDR_OPT_IN` is still exported and documented,
      but gates nothing: `herdrAvailable()` asks whether the run has its
      own session, not whether a human consented to collateral damage.
      The README says so.

## 4. Mock coverage (Q2's consequence)

The mocked suite must be worth trusting on a machine with no herdr, and
today it is 27 of 91 specs. This section closes the distance; it is
sized deliberately and may be split into its own change if it grows.

- [x] 4.1 Inventory, measured 2026-09-11 by running the full suite with
      `herdr` shimmed off `PATH` (`--project=chromium --project=mobile`):

      | file | passed | skipped | assertion is about |
      | --- | ---: | ---: | --- |
      | `viewport-matrix.spec.ts` | 25 | 0 | SPA — already mocked |
      | `terminal-flicker.spec.ts` | 1 | 0 | SPA — already mocked |
      | `empty-state.spec.ts` | 2 | 1 | SPA; the scoped-URL half needs a real workspace |
      | `capture.spec.ts` | — | — | SPA — already mocked (`--project=capture` only) |
      | `mobile.spec.ts` | 0 | 30 | SPA — mockable |
      | `keyboard.spec.ts` | 0 | 7 | SPA — mockable |
      | `tier1.board.spec.ts` | 0 | 6 | SPA — mockable |
      | `settings.spec.ts` | 0 | 4 | SPA — mockable |
      | `rail-nav.spec.ts` | 0 | 3 | SPA — mockable |
      | `theme.spec.ts` | 0 | 2 | SPA — mockable |
      | `toasts.spec.ts` | 0 | 1 | SPA — mockable |
      | `terminal-theme.spec.ts` | 0 | 1 | SPA — mockable (needs the mock's tier-3 `pane.read`) |
      | `tier2.terminal.spec.ts` | 0 | 3 | **wire** — types into a pane and reads the bytes back via the CLI |
      | `tier3.spec.ts` | 0 | 6 | **wire** — tab/workspace CRUD cross-checked against herdr |
      | **total** | **28** | **64** | |

      Only 9 of the 64 live specs are genuinely wire-level. The other 55
      are SPA behaviour that happens to be driven through a real bridge.

- [ ] 4.2 **DEFERRED — belongs in its own change.** Moving 55 specs
      across 10 files onto `helpers/mock-bridge.ts` is not a fixture
      change; each file asserts against real pane/tab/workspace shapes and
      needs its own mock payloads, and `mock-bridge.ts` currently answers
      only `pane.list`, `events.subscribe`, `bridge.capabilities`,
      `pane.read` and `pane.subscribe_output` — every tier-3 lifecycle
      method it is handed returns `unsupported_operation`. The section
      itself anticipated this ("may be split into its own change if it
      grows"). What this change delivers instead is the condition that
      makes 4.2 safe and measurable: the live specs now run, on isolated
      hardware, so the coverage being migrated is known rather than
      assumed. Evidence of that: with an isolated session the suite goes
      from 64 skipped to 4 skipped, and three specs that had never
      executed now fail against real SPA divergences (see 6.2).

- [x] 4.3 Every live-only file carries a header saying so and why, split
      into two forms: `tier2.terminal.spec.ts` and `tier3.spec.ts` say
      they are live-only by nature; the other nine say they are live-only
      *for now* and point at task 4.2.
- [x] 4.4 Confirmed. With a `herdr` shim on `PATH` that exits 127 and
      `KANHRD_E2E_LIVE_HERDR` unset: `28 passed, 64 skipped, 0 failed`.
      The launcher falls back to serving the SPA against
      `$TMPDIR/kanhrd-e2e-nonexistent.sock` and records the reason in the
      handoff, so the mocked specs run normally and the live ones skip
      with it.

## 5. Docs

- [ ] 5.1 **DEFERRED — maintainer's file, outside the implementing lane's
      write scope.** The text needs to change from "tests spawn a private
      herdr subprocess with `HERDR_SOCKET_PATH=/tmp/...`" (which was never
      how it worked, and is not how it works now) to: suites start a
      headless `kanhrd-test-*` herdr session, seed it, point the bridge at
      it with `--config`, and stop+delete it on teardown; a leaked session
      is swept by the next run; a suite with no session skips rather than
      falling back. The L-TEST-ISOLATION "in progress" credit should be
      replaced by a pointer to `integration/README.md` and `e2e/README.md`.
- [x] 5.2 Both READMEs rewritten. The "reachable local herdr with panes
      open" precondition is gone from each; the precondition is now the
      `herdr` CLI alone, and each README describes the session lifecycle
      and which specs skip without it. `.forgejo/workflows/ci.yml`'s
      availability probe was checking for the **default socket** — the
      one thing the suites must never use — and now checks for the CLI.
- [ ] 5.3 **DEFERRED — `openspec/changes/archive/**` is outside the
      implementing lane's write scope.** The note to add to
      `2026-09-10-fix-keyboard-shortcut-suppression`: its task 3.5 is
      runnable now, via `pnpm --filter @kanhrd/web test:e2e`, against the
      run's own throwaway session rather than the operator's panes.

## 6. Verification

- [x] 6.1 `pnpm test:int` → `4 passed | 16 passed | 1 skipped`, with the
      operator's `default` session running throughout. Before: 10 panes on
      `default`. After: 10 panes on `default`, `herdr session list` shows
      only `default`, and `~/.config/herdr/sessions/` is empty. The run's
      banner names the session it used:
      `[test:int] isolated herdr session "kanhrd-test-int" at
      ~/.config/herdr/sessions/kanhrd-test-int/herdr.sock (workspace w1,
      panes w1:p1, w1:p2)`.

- [x] 6.2 Live e2e ran against the throwaway session: **85 passed, 4
      skipped, 3 failed** of 92 (`--project=chromium --project=mobile`).
      Before this change the same command skipped 64 of them.

      The three failures are **pre-existing SPA divergences this change
      exposed**, not isolation faults — each is in `apps/web/src/**`,
      outside the implementing lane's write scope, and each is in a spec
      that had never once executed:

      1. `tier3.spec.ts:190` — the spec asserts `.card-action.overflow-trigger`
         is hidden at comfortable density on a fine pointer; it is
         visible. There is no `display: none` rule for `.overflow-trigger`
         anywhere under `apps/web/src/**`, so the spec's premise is stale
         or the rule was lost.
      2. `mobile.spec.ts:516` — "the board exposes no drag affordance on a
         status column"; the parked-columns work added one.
      3. `mobile.spec.ts:647` — expects 2 `.segmented .segment` controls in
         settings; there are now 7.

      The remaining 4 skips are the specs that gate themselves on a
      capability the seeded bare-shell world does not advertise.

- [x] 6.3 Verified twice. A `SIGKILL`ed run leaves `kanhrd-test-e2e`
      running; the next run's sweep disposes of it before starting its
      own. Repeated with a deliberately orphaned session:

      ```text
      $ herdr session list | grep kanhrd-test
      kanhrd-test-leaked   running  ~/.config/herdr/sessions/kanhrd-test-leaked  …
      $ pnpm exec playwright test --project=chromium -g "theme toggle"
        2 passed (3.0s)
      $ herdr session list
      default              running  ~/.config/herdr  ~/.config/herdr/herdr.sock
      ```

      `default` untouched; the leak gone.

- [x] 6.4 Confirmed three ways rather than by inspection alone:
      - **Generated configs.** Both are written by code that runs
        `assertIsolatedSocket()` first, which throws on the default socket
        and on any path outside a `.../sessions/kanhrd-test-*/` directory.
        The only other socket either can name is
        `$TMPDIR/kanhrd-e2e-nonexistent.sock`, which by construction does
        not exist.
      - **CLI invocations.** Every `herdr` call in
        `apps/bridge/integration/fixtures/herdr-cli.ts` and
        `apps/web/e2e/fixtures/herdr.ts` is prefixed
        `--session <run's session>`, and both modules throw rather than
        run when the handoff is missing. The only un-targeted calls are
        session management (`session list|stop|delete`, `--version`) in
        `herdr-session.ts` and `isolated-bridge.mjs`.
      - **Observed state.** `default`'s pane count was 10 before and 10
        after a full `test:int` + e2e cycle, and no `kanhrd-test-*`
        session survives a run.
