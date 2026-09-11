# Contributing to kanhrd

Contributions are welcome. This page covers two things: how to propose a
change, and how to work on one once it is agreed.

For the docs index, see [README.md](./README.md).

## How to propose a change

Two tiers, and the only thing that decides which one you are in is how much
work would be wasted if the answer were no.

**Small and self-evident — open a pull request.** Bug fixes, documentation
corrections, typos, a missing null check, a broken link. If a maintainer would
obviously say yes, do not wait to ask. Describe the symptom and the root cause
in the PR body.

**Anything substantial — open an issue or an OpenSpec proposal first.** New
features, changed behaviour, anything touching the design system, anything that
adds a dependency, anything that spans more than a couple of files. The reason
is not ceremony: this repo keeps a spec record, and a weekend of work that
conflicts with an existing spec has to be thrown away. Agreeing the shape first
costs you an hour and saves the weekend.

### The OpenSpec flow

[`openspec/`](../openspec/) is kanhrd's change record. `openspec/specs/` holds
the persistent, per-capability source of truth for what has shipped;
`openspec/changes/` holds proposals in flight. The repo's go-forward rule is
proposal-first — see [openspec/README.md](../openspec/README.md).

For a substantial change:

```bash
openspec new change <name> --description "..."
# then hand-author, in openspec/changes/<name>/:
#   proposal.md  — the problem, the approach, what you rejected
#   tasks.md     — the work, in verifiable units
#   specs/<capability>/spec.md — the spec delta this change introduces
openspec validate <name> --strict
```

Only then write the code. When it lands and the tests pass, the change is
archived (`openspec archive <name> --yes`), which merges your spec delta into
`openspec/specs/`.

Exempt from the proposal step: typo and comment fixes, lint-config tweaks,
single-file edits under ten lines, and documentation-only edits under
[`docs/adr/`](./adr/).

If you would rather not learn OpenSpec to file an idea, open an issue instead
and say what you want to change and why. A maintainer will turn it into a
proposal or tell you it is small enough to just send.

### Conduct

There is no separate code-of-conduct document, and adding one is a maintainer's
call rather than something this page should invent. The expectation is
ordinary: be civil, assume good faith, keep review about the code. Behaviour
that makes people not want to participate gets the contribution closed.

## Setting up

This assumes the repo is cloned and `pnpm install` has run.

### Prerequisites

- Python 3.10+
- [pre-commit](https://pre-commit.com/): `pipx install pre-commit` (preferred
  over `pip install`, since it keeps pre-commit out of your system Python)
- [Git LFS](https://git-lfs.com/): `brew install git-lfs` (or your distro's
  package). Screenshots and other images live in LFS — see below.

Verify the install:

```bash
pre-commit --version
git lfs version
```

### Install the hooks

Run once per clone:

```bash
cd kanhrd
make hooks
# same as:
#   git lfs install --local --force
#   pre-commit install --hook-type pre-commit --hook-type pre-push
```

This wires both hook stages so commit-time and push-time checks actually run
(pre-commit only installs the `pre-commit` stage by default).

Order matters: Git LFS and pre-commit both want the `pre-push` hook. Install
LFS first and pre-commit chains it as `pre-push.legacy` instead of replacing
it. If you run them the other way round, `git lfs install --local` refuses
with "Hook already exists: pre-push".

### Git LFS

`.gitattributes` routes `*.png`, `*.jpg`, `*.jpeg`, `*.gif`, `*.webp`,
`*.mp4` and `*.mov` through Git LFS — [`docs/screenshots/`](./screenshots/) is
expected to keep growing. The self-hosted fonts under `apps/web/public/fonts/`
are deliberately _not_ in LFS: they are already committed as ordinary blobs and
converting them would rewrite history for no gain.

Install LFS before cloning (`git lfs install`, once per machine) and the
images come down with the clone. If you cloned first and got pointer files
instead of pictures:

```bash
git lfs pull
```

CI does not need the images — no job reads `docs/`, and the Docker build
ignores it — so `.forgejo/workflows/ci.yml` checks out without `lfs: true`
on purpose. Add it to a job the day one actually consumes a tracked asset.

## What the hooks check

| Stage    | Checks                                                                                                                                                                               | Fixes automatically?                                                        |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------- |
| `commit` | Trailing whitespace, end-of-file newline, LF line endings, YAML/JSON structure, large-file guard, yamllint, Prettier (JS/TS/CSS/SCSS/MD/YAML/JSON), markdownlint, SCSS design tokens | Whitespace/EOF/line-ending/Prettier: yes. Everything else: no, report only. |
| `push`   | Markdown dead-link check                                                                                                                                                             | No, report only.                                                            |

### Hook scope

`.pre-commit-config.yaml` carries a top-level `exclude:` that hides
`apps/`, `packages/`, `openspec/`, `docs/adr/`, `docs/CONTEXT.md`,
`docs/OPERATING.md`, `docs/history/`, root `README.md`, `tmp/foreman/`,
`.claude/` and `pnpm-lock.yaml` from every hook that takes a file list. That is
a formatting-ownership boundary, not an exemption from review.

Two hooks are worth knowing about specifically.

- **`scss-design-tokens`** is a real gate and the `exclude:` above does not
  apply to it. It runs `tools/lint-scss-tokens.sh` with `always_run: true` and
  `pass_filenames: false`, so it walks `apps/web/src` itself on every commit.
  It fails on a raw hex literal in any `*.scss` outside
  `apps/web/src/app/shared/tokens.scss`, and on a raw numeric `rem` outside
  `apps/web/src/app/shared/typography.scss`. Structural values (`0`, `100%`,
  `1fr`, `1px` hairlines, documented breakpoint widths) are layout, not design
  decisions, and are never matched. The script carries a `LEGACY` ratchet array
  for not-yet-migrated stylesheets; **that array is currently empty** — every
  app stylesheet is guarded, and nothing may be added to it. Fix the value, do
  not widen the ratchet. The rules it enforces are documented in
  [DESIGN-SYSTEM.md](./DESIGN-SYSTEM.md) under "Lint gate".
- **`web-lint`** is still a no-op placeholder. `apps/web` has no ESLint config
  and no `lint` script (`angular.json` defines only `build`, `serve`,
  `extract-i18n` and `test`), so the hook runs
  `pnpm --filter @kanhrd/web run --if-present lint`, which exits cleanly. It
  becomes a real check the day that script exists.

### Run checks manually

Run everything, on every file (what CI does):

```bash
pnpm lint
# same as: pre-commit run --all-files
```

Run a single hook:

```bash
pre-commit run markdownlint --all-files
pre-commit run scss-design-tokens --all-files
pre-commit run prettier --files docs/CONTRIBUTING.md
```

Format only, without linting:

```bash
pnpm format
# same as: prettier --write .
```

### Fixing common failures

- **Trailing whitespace / missing final newline / CRLF line endings**: these
  hooks fix the file in place. Re-stage (`git add`) and commit again.
- **Prettier**: also auto-fixes in place. Re-stage and commit again.
- **markdownlint / yamllint**: report-only. Read the error, fix the file by
  hand, and commit again.
- **SCSS design tokens**: report-only, and the message names the offending
  file and line. Replace the raw value with a token from `tokens.scss` or
  `typography.scss`; if the token you need does not exist, add it there.
- **Dead links** (push-time): fix the link or, if it's intentionally
  external and flaky, note it in the PR description — this check does not
  auto-fix.

### Bypassing hooks in an emergency

```bash
git commit --no-verify
```

Use this only when you must land a commit immediately and will fix the
underlying issue right after. `--no-verify` skips your local hooks, but CI
runs the same checks (`pnpm lint`) and will still fail the build if the
underlying issue isn't fixed.

## Tests

The safe default, and the one to run while developing:

```bash
pnpm --filter @kanhrd/web test    # karma/jasmine unit tests, headless Chrome
pnpm typecheck                    # across the workspace
```

These are hermetic. Nothing below is.

### The e2e suite drives a real herdr — in a session of its own

`pnpm test:e2e` runs Playwright specs against a real `herdr`, not a mock. The
specs act on panes: the tier-2 specs type `echo <marker>` into one, and the
tier-3 specs exercise lifecycle, which closes real tabs and real workspaces.
Those panes belong to the run, never to you.

It was not always so. On 2026-09-10 a suite run typed its marker into the
operator's own panes, and one of those panes was running an agent, which
executed the text as a prompt. Nothing was damaged — the payload is
deliberately harmless — but it happened without anyone opting in.

An opt-in variable was the guard at the time, which is a prompt for a human,
not isolation. Both suites now own their panes instead:

```bash
pnpm test:e2e    # starts kanhrd-test-e2e, seeds it, disposes it
pnpm test:int    # starts kanhrd-test-int, seeds it, disposes it
```

Each run starts its own headless `kanhrd-test-*` herdr session, seeds the
workspace and panes it needs, points the bridge at that session's socket, and
stops and deletes it on teardown. A session a crashed run left behind is swept
by name prefix before the next one starts. The default socket is refused, not
merely avoided: `assertIsolatedSocket()` throws on it and on any path outside a
test session directory, and the herdr CLI wrappers throw rather than fall back
when a run has no session of its own.

So there is nothing to opt into. `herdr` on PATH is the only prerequisite, and
without it the mocked specs still pass while the rest skip with a reason.

Full prerequisites, coverage and conventions are in
[`apps/web/e2e/README.md`](../apps/web/e2e/README.md).
