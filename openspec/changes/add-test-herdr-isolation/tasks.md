## 0. Gate — maintainer decisions

Blocked on Q1-Q3 in `proposal.md`. Do not start section 2 before they
are answered; section 1 is safe to do regardless.

- [ ] 0.1 Q1: one throwaway session per suite, or one per test file?
- [ ] 0.2 Q2: skip or fail when a session cannot be started?
- [ ] 0.3 Q3: do seeded fixture panes run a real agent, or a bare shell?

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

## 4. Docs

- [ ] 4.1 `CLAUDE.md`: state what is enforced once this ships.
- [ ] 4.2 `apps/bridge/integration/README.md` and `apps/web/e2e/README.md`:
      drop the "requires a reachable local herdr with panes open"
      precondition.
- [ ] 4.3 Note in the archived keyboard-shortcut change that its task
      3.5 is now runnable.

## 5. Verification

- [ ] 5.1 `pnpm test:int` green with the operator's default session
      running, and its pane/tab/workspace set unchanged afterwards.
- [ ] 5.2 Live e2e green against the throwaway session.
- [ ] 5.3 Kill a run mid-suite; confirm the next run sweeps the leak.
- [ ] 5.4 Confirm no suite opens `~/.config/herdr/herdr.sock` — by
      inspection of the generated configs and the herdr CLI invocations.
