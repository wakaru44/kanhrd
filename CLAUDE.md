# CLAUDE.md — kanhrd

Canonical guidance for any Claude Code (or Claude API) session working in
this repo. Checked in on purpose so peer sessions, CI, and fresh clones
inherit it without relying on any single agent's private memory.

## Product

kanhrd is a web UI for [herdr](https://github.com/herdrdev/herdr).
Codename **neo-shepherd**: a shepherd's console over the flock of coding
agents herdr runs. Kanban board of pane cards across every configured
herdr host.

Read `openspec/specs/` for the authoritative capability specs; the tier
1/2/3 spec files there are the source of truth for what's shipped.

## Brand + design + UX authority

Before touching `apps/web/src/**` or writing user-facing copy, read
these three docs in order:

1. `docs/BRAND.md` — voice (terse, lowercase, verbs of tending; no
   exclamation marks; care verbs only on lifecycle/empty/error),
   wordmark, and the domain vocabulary table (**host**, **workspace**,
   **tab**, **card** for a pane, **status column**, **swimlane**).
   **UI copy and wire / API / code use the same words for herdr's
   objects.**
2. `docs/DESIGN-SYSTEM.md` — colour, type, spacing, radius, elevation,
   motion tokens. Paper cream (`#f4ede0`) primary, ochre (`#c8842a`)
   accent, torii-red vermilion for blocked. Hairlines over shadows.
   lucide icons only. **No raw hex, px, or rem in components.**
3. `docs/UX-GUIDELINES.md` — visible affordances (not hover-only),
   keyboard-first, URL-is-state (rail is navigator, not filter), empty
   states are next steps (not messages), drag-drop must work or not
   appear (`pane.move` from Tier 3 is available).

If these docs don't cover your case, **flag it in your report — do not
invent copy, colours, or interaction patterns.** A maintainer extends
the docs; you don't.

## Workflow standards

### OpenSpec (proposal-first)

Every substantial lane goes through openspec before code:

```shell
openspec new change <name> --description "..."
# then hand-author openspec/changes/<name>/{proposal.md, tasks.md,
# specs/<capability>/spec.md}
openspec validate <name> --strict
# ...implement...
openspec archive <name> --yes
```

Fast exemptions (proposal not required): trivial typo/comment fixes,
lint-gate config, foreman-inline single-file edits < 10 lines, ADR-only
edits under `docs/adr/**`.

Existing capability specs live in `openspec/specs/`. Live proposals live
in `openspec/changes/`; archived under `openspec/changes/archive/`.

The `SubagentStart` hook at `.claude/hooks/openspec_context.py` injects
this reminder plus the design-authority pointer above into every
subagent spawned from this repo.

### Docs (Divio)

Distinguish tutorial / how-to / reference / explanation. Current split:

- `docs/how-to/*.md` — task-oriented recipes (e.g. `oauth-proxy.md`).
- `docs/adr/*.md` — decision records (numbered, hard-to-reverse).
- `docs/OPERATING.md` — deployment recipes (laptop, cloud+oauth, mixed).
- `docs/CONTEXT.md` — living glossary.
- `docs/history/*.md` — frozen historical artifacts (don't edit).
- `docs/BRAND.md`, `docs/DESIGN-SYSTEM.md`, `docs/UX-GUIDELINES.md` —
  authority for UI/UX/copy.

### Lint gate (pre-commit)

Every commit runs `pre-commit` (config in `.pre-commit-config.yaml`):
trailing whitespace, EOF newline, LF line endings, YAML/JSON structure,
yamllint, prettier, markdownlint, markdown-link-check (push stage).

Install with `pre-commit install` after cloning (or `make hooks`). The
`pnpm lint` script (and `make lint`) runs `pre-commit run --all-files`.

### Makefile is the entry point

`make` alone prints a categorised help of every target. Prefer `make
<target>` over calling pnpm/docker/pre-commit directly — the Makefile
is self-documenting via `## <description>` comments and the targets
delegate to the underlying tool. Common flow: `make install` → `make
hooks` → `make run`.

### Forgejo CI (self-hosted)

Pipeline lives in `.forgejo/workflows/ci.yml`. Herdr-dependent suites
skip gracefully via `require-herdr.ts` when no herdr is reachable.

## Foreman + subagent hard rules

These come from mistakes we've paid for. Do NOT redo them.

### No ad-hoc validation scripts

If a check needs to run repeatedly to validate development (regressions,
CI, "did we break tier-1?"), it belongs in the committed test suites,
not `/tmp/`. One-shot sanity checks are fine; recurring checks are not.
See [feedback: no-adhoc-validation] in the maintainer's private memory.

### Tests must not touch the operator's live herdr

**Never** the default socket at `~/.config/herdr/herdr.sock` — that's the
operator's live workspace, with other lanes working in its panes.

**Nothing enforces this today. Read the next paragraph before running any
suite.** An earlier version of this file claimed lane L-TEST-ISOLATION
enforced it "in progress"; that lane was never proposed, scheduled or
built, and at least one archived change deferred its own live
verification into it. Believing that claim is how a session ends up
pointed at the live socket.

What is actually true right now:

- `pnpm test:int` (`apps/bridge/integration/**`) runs against the live
  default socket. It subscribes and lists; it does not type into panes,
  but it is the operator's real instance.
- `apps/web/e2e`'s live specs **type into real panes** and are gated
  behind `KANHRD_E2E_LIVE_HERDR=1`, which is the only real guard in the
  repo. Do not set it without the operator's explicit say-so for that
  run. Playwright's `webServer` starts the bridge with no `--config`, so
  it too resolves to the default socket.
- The bridge needs no new code to be isolated: `main.ts` takes
  `--config <path>` and `config.ts` reads `hosts: [{ name, socket }]`
  from it. `herdr --session <name>` gives a server its own socket
  (`herdr session list` shows the path per session). The missing pieces
  are the test fixtures and the Playwright `webServer` command.

`add-test-herdr-isolation` is the change that closes this. Until it
ships, treat any suite that reaches herdr as touching production and ask
first.

### Dispatched agents do the work, they do NOT re-dispatch

If a subagent's brief tells it to do X, it does X. It does NOT spawn its
own subagent to do X. Re-dispatch chains hide progress from the
coordinator and violate the playbook. If the brief is genuinely too big,
report back and let the coordinator split it.

### Git is read-only for agents (with narrow exceptions)

Agents propose commits (in their report) and the human commits. Two
scoped exceptions:

- **Factory gate B**: repos enrolled with `.claude/factory` marker
  allow foreman commits on `agent/*` branches. Never on user branches.
- **Explicit day exceptions** the operator grants (recorded in
  `tmp/foreman/kanhrd.md` under Standing exceptions).

Never push, force-push, rebase, or merge to a user branch.

### Foreman does not do lane-sized work inline

The main thread plans, dispatches, and decides. If work needs > 10-line
touches across > 1 file, it's a lane, not a foreman-inline edit.

## Runtime facts

- Bridge default: `127.0.0.1:5173` (loopback, safe).
- Tailscale: bridge stays on loopback; `tailscale serve` fronts it with
  HTTPS via Tailscale certs. `make run-tailscale-serve` sets this up.
  `--bind 0.0.0.0` exposes on every interface (including untrusted
  Wi-Fi) and is not the safe Tailscale path.
- Bridge polls `pane.list` per host to derive `agent_status` changes;
  it does NOT resubscribe on every pane change (fixed in commit `58c7624`
  after that behavior caused an event storm — see the archived change
  `fix-bridge-subscription-backlog-storm`).
- Bridge broadcasts of rename events for own-session resources may lag;
  SPA applies rename responses optimistically to compensate.
- macOS Docker Desktop cannot bind-mount Unix sockets — the container
  can't reach the host's herdr socket. Docker path works on Linux;
  macOS needs a socat sidecar (deferred to L-DOCKER round 2).

## Domain vocabulary reminder

One rule: **herdr's objects use herdr's words; the board's own furniture
uses kanban's words.**

In wire, API, code, tests, commits and user-facing copy alike:
**host / workspace / tab / pane** (herdr's terms).

The board adds three of its own: a **card** is the board's
representation of a pane, a **status column** is a grouping derived from
`agent_status`, and a **swimlane** (short form **lane**) is a horizontal
band grouping cards. `lane` never means tab.

`pen`, `field` and `lane`-as-tab were a copy-only rename that has been
withdrawn; see `openspec/changes/archive/` for the history.

The foreman workflow's "lane" — a dispatched unit of work — is process
vocabulary, not product vocabulary. It never appears in user-facing copy.
