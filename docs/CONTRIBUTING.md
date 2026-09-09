# How to work on kanhrd

This is a how-to guide. It assumes you already have the repo cloned and
`pnpm install` run. For background on the tooling choices, see
[Docs](./OPERATING.md); this page only covers the day-to-day commit workflow.

## Prerequisites

- Python 3.10+
- [pre-commit](https://pre-commit.com/): `pipx install pre-commit` (preferred
  over `pip install`, since it keeps pre-commit out of your system Python)

Verify the install:

```bash
pre-commit --version
```

## Install the hooks

Run once per clone:

```bash
cd kanhrd
pre-commit install --hook-type pre-commit --hook-type pre-push
```

This wires both hook stages so commit-time and push-time checks actually run
(pre-commit only installs the `pre-commit` stage by default).

## What runs when

| Stage    | Checks                                                                                                                                                      | Fixes automatically?                                                              |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `commit` | Trailing whitespace, end-of-file newline, LF line endings, YAML/JSON structure, large-file guard, yamllint, Prettier (JS/TS/CSS/SCSS/MD/YAML), markdownlint | Whitespace/EOF/line-ending/Prettier: yes. yamllint/markdownlint: no, report only. |
| `push`   | Markdown dead-link check                                                                                                                                    | No, report only.                                                                  |

Everything under `apps/**`, `packages/**`, `openspec/**`, `docs/adr/**`,
`docs/CONTEXT.md`, `docs/OPERATING.md`, root `README.md`, and
`tmp/foreman/**` is currently excluded from these hooks — that code has its
own ownership and tooling in flight, so this config deliberately doesn't
touch it yet. Notably, `apps/web` (Angular) has no `lint` script wired up
today; the `web-lint` hook is a no-op placeholder until `apps/web/package.json`
gets one (see `.pre-commit-config.yaml` for the exact scope).

## Run checks manually

Run everything, on every file (what CI does):

```bash
pnpm lint
# same as: pre-commit run --all-files
```

Run a single hook:

```bash
pre-commit run markdownlint --all-files
pre-commit run prettier --files docs/CONTRIBUTING.md
```

Format only, without linting:

```bash
pnpm format
# same as: prettier --write .
```

## Fixing common failures

- **Trailing whitespace / missing final newline / CRLF line endings**: these
  hooks fix the file in place. Re-stage (`git add`) and commit again.
- **Prettier**: also auto-fixes in place. Re-stage and commit again.
- **markdownlint / yamllint**: report-only. Read the error, fix the file by
  hand, and commit again.
- **Dead links** (push-time): fix the link or, if it's intentionally
  external and flaky, note it in the PR description — this check does not
  auto-fix.

## Bypassing hooks in an emergency

```bash
git commit --no-verify
```

Use this only when you must land a commit immediately and will fix the
underlying issue right after. `--no-verify` skips your local hooks, but CI
runs the same checks (`pnpm lint`) and will still fail the build if the
underlying issue isn't fixed.
