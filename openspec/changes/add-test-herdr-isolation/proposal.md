## Why

CLAUDE.md has carried this rule since early on:

> Tests spawn a private herdr subprocess with `HERDR_SOCKET_PATH=/tmp/...`
> and a private bridge on an ephemeral port. **Never** the default socket
> at `~/.config/herdr/herdr.sock` — that's the operator's live workspace.

Nothing has ever enforced it. The line credited a lane
**L-TEST-ISOLATION** with the work "in progress"; that lane has no
proposal in `openspec/changes/`, nothing in `archive/`, no capability in
`openspec/specs/`. It was named, deferred into, and never built.

The cost is not hypothetical:

- `pnpm test:int` runs its four files against the live default socket
  today. It subscribes and lists rather than typing, but it is the
  operator's real instance, shared with whatever agent lanes are working
  in its panes.
- `apps/web/e2e`'s live specs **type into real panes**. Their only guard
  is the `KANHRD_E2E_LIVE_HERDR=1` opt-in — a good guard, and the one
  thing in this area that works, but it is a prompt for a human, not
  isolation.
- `openspec/changes/archive/2026-09-10-fix-keyboard-shortcut-suppression`
  shipped with task 3.5 unrun, deferred explicitly "to Juan or to whoever
  lands L-TEST-ISOLATION". A change archived on a static re-read because
  the safe way to run its verification did not exist.

A rule that is documented, believed, and unenforced is worse than an
absent one: it reads as a guarantee, so sessions stop checking.

## What Changes

- Every herdr-touching suite gets a **throwaway herdr session** of its
  own, and a bridge pointed at that session's socket. The operator's
  default session is never contacted.
- `apps/bridge/integration/fixtures` gains a session fixture that starts
  the session, waits for its socket, yields its path, and stops and
  deletes it on teardown — including after a crashed run.
- `startBridge()` writes a temp `kanhrd.config.yaml` naming that socket
  and passes `--config`. **No bridge source changes:** `main.ts` already
  parses `--config <path>` and `config.ts` already reads
  `hosts: [{ name, socket }]`.
- `herdr-cli.ts` targets the test session instead of the default one, so
  the suite's own `herdr pane list` cross-checks read the same isolated
  server the bridge does.
- Playwright's `webServer.command` passes the same `--config`, and the
  live e2e specs seed their fixture panes into the throwaway session.
- `KANHRD_E2E_LIVE_HERDR` stops meaning "you may type into the
  operator's panes". Once the panes are disposable, the live suite is
  just the suite; the opt-in narrows to the escape hatch for
  deliberately running against a real session.

## The primitive this rests on

herdr sessions are already isolated by socket — no herdr change is
needed and none is proposed:

```
$ herdr session list
name      status   directory                      socket
default   running  /Users/…/.config/herdr         /Users/…/.config/herdr/herdr.sock
```

`herdr --session <name>` addresses a named session, `herdr server` runs
headless, and `herdr session stop|delete <name>` disposes of one. The
first task confirms the exact non-interactive start incantation and
records it, because everything else depends on it.

## Maintainer decisions — resolved 2026-09-11

Do not re-ask these.

**Q1 — one session per suite, and keep `fileParallelism: false`.**
Running servers are not free. A session per file would buy back
parallelism at the cost of N herdr starts per suite, which is the wrong
trade for a suite this size. The existing serial execution stands.

**Q2 — it depends which suite, and the distinction matters more than the
answer.** Three tiers, three rules:

- **Mocked e2e** (`page.route`-backed, no herdr at all) MUST pass on any
  machine, with no herdr installed and no opt-in. A mock suite that
  skips is not a suite. Written well, these cover the same ground the
  live ones do.
- **Live e2e** (real bridge, real herdr) SKIPS when no herdr is
  reachable. Nothing else is honest on a machine without one.
- **Integration** (`test:int`, bridge against herdr's wire) SKIPS the
  same way, for the same reason.

This exposes a gap this change must not paper over: today almost
everything in `apps/web/e2e` is a live spec — 64 of 91 skipped on a
plain run — so "the mocked suite passes anywhere" is currently a claim
about 27 tests. Widening mock coverage to match is real work and is
scoped in section 4 rather than smuggled in.

**Q3 — bare shell panes; a test needing a real agent skips.** The
question was posed backwards. kanhrd renders what the wire reports; that
an agent's `agent_status` transitions correctly is herdr's contract with
itself, not something kanhrd's suite should be re-proving. Fixture panes
are bare shells, deterministic and cheap. Where a spec genuinely needs a
live agent's transitions, it skips cleanly with that reason stated —
never fails, and never becomes a reason to seed agents into every
fixture.

## Impact

- Affected specs: `bridge-integration-suite`,
  `mobile-e2e-playwright-project`; new capability
  `test-herdr-isolation`.
- Affected code: `apps/bridge/integration/fixtures/**`,
  `apps/web/e2e/fixtures/**`, `apps/web/playwright.config.ts`,
  `CLAUDE.md`.
- **No** changes to `apps/bridge/src/**`, `apps/web/src/**`, the wire
  contract, or herdr.
- Unblocks the archived keyboard-shortcut change's task 3.5.
