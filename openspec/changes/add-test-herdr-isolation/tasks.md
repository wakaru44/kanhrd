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

- [ ] 1.1 Establish the non-interactive incantation that starts a named
      herdr session headlessly, and record it in the change. Everything
      below depends on it; `herdr --session <name>` + `herdr server` is
      the candidate, unverified.
- [ ] 1.2 Confirm the socket path a named session gets, and how to wait
      for it to accept connections.
- [ ] 1.3 Confirm `herdr session stop` + `delete` fully dispose of it,
      leaving no socket or state behind.
- [ ] 1.4 Confirm a named session can create panes/tabs/workspaces with
      no TTY attached — the CI case.

## 2. Integration suite

- [ ] 2.1 Session fixture: start, wait, yield socket path, stop+delete
      on teardown including after a crash.
- [ ] 2.2 Leaked-session sweep by name prefix before a run starts.
- [ ] 2.3 `startBridge()` writes a temp config naming that socket and
      passes `--config`; ephemeral port, no fixed 5173.
- [ ] 2.4 `herdr-cli.ts` targets the run's session, so its cross-checks
      read the same server the bridge does.
- [ ] 2.5 Seed the panes/tabs/workspaces the suite's assertions need.
- [ ] 2.6 Delete `requireHerdrOrSkipReason`'s dependence on the
      operator having panes open — the run makes its own.

## 3. Playwright

- [ ] 3.1 `webServer.command` passes `--config` for the run's session.
- [ ] 3.2 Live specs seed their fixture panes into that session.
- [ ] 3.3 Re-scope `KANHRD_E2E_LIVE_HERDR` to mean "run against a real
      session on purpose", not "you may type into the operator's panes".

## 4. Mock coverage (Q2's consequence)

The mocked suite must be worth trusting on a machine with no herdr, and
today it is 27 of 91 specs. This section closes the distance; it is
sized deliberately and may be split into its own change if it grows.

- [ ] 4.1 Inventory `apps/web/e2e`: for each spec, does it assert on SPA
      behaviour (mockable) or on herdr's own wire behaviour (not)?
- [ ] 4.2 Move every SPA-behaviour spec onto the `page.route` fixture so
      it runs with no herdr and no opt-in.
- [ ] 4.3 Leave genuinely wire-level specs live-only, and say so in each
      file's header rather than leaving a reader to infer it.
- [ ] 4.4 Confirm the mocked suite passes with herdr uninstalled and
      `KANHRD_E2E_LIVE_HERDR` unset.

## 5. Docs

- [ ] 5.1 `CLAUDE.md`: state what is enforced once this ships.
- [ ] 5.2 `apps/bridge/integration/README.md` and `apps/web/e2e/README.md`:
      drop the "requires a reachable local herdr with panes open"
      precondition.
- [ ] 5.3 Note in the archived keyboard-shortcut change that its task
      3.5 is now runnable.

## 6. Verification

- [ ] 6.1 `pnpm test:int` green with the operator's default session
      running, and its pane/tab/workspace set unchanged afterwards.
- [ ] 6.2 Live e2e green against the throwaway session.
- [ ] 6.3 Kill a run mid-suite; confirm the next run sweeps the leak.
- [ ] 6.4 Confirm no suite opens `~/.config/herdr/herdr.sock` — by
      inspection of the generated configs and the herdr CLI invocations.
