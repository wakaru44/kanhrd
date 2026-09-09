## Why

kanhrd had no commit-time formatting/lint gate — YAML/JSON/Markdown
mistakes and inconsistent formatting could land freely. This is a
retroactive OpenSpec record of the L-PRECOMMIT lane, written after the fact
because the work landed without a proposal. Commit: `daac86c`
(`docs and tooling`), tightened by `76d79a5`
(`chore(lint): tighten pre-commit gate for compose files + fence languages`).

## What Changes

- Add `.pre-commit-config.yaml` with: `pre-commit-hooks`
  (trailing-whitespace, end-of-file-fixer, mixed-line-ending --fix=lf,
  check-yaml, check-json, check-added-large-files), `yamllint` (120-char
  lines, `document-start`/`comments-indentation` disabled), `prettier`
  (js/ts/jsx/tsx/css/scss/markdown/yaml/json), `markdownlint-cli`
  (config in `.markdownlint.yaml`), and `markdown-link-check` (quiet,
  `pre-push` stage only, since link checks hit the network).
- Scope the config narrowly: `apps/**`, `packages/**`, `openspec/**`,
  `docs/adr/**`, `docs/CONTEXT.md`, `docs/OPERATING.md`, root `README.md`,
  `tmp/foreman/**`, `pnpm-lock.yaml`, `.claude/**`, and `docs/history/**`
  are excluded from every hook, because those paths were owned by other
  in-flight lanes at the time this landed and an auto-fixing hook touching
  them would have produced file conflicts. `docs/CONTRIBUTING.md` records
  how to widen the scope later.
- Add a placeholder `web-lint` local hook
  (`pnpm --filter @kanhrd/web run --if-present lint`) that is a no-op
  until `apps/web` gets a real `lint` script (Angular's `angular.json` only
  defines build/serve/extract-i18n/test targets today), so the hook
  becomes a real check automatically the day that script exists instead of
  failing every commit until then.
- `check-yaml` runs with `--unsafe` (to parse Compose Spec YAML tags like
  `!reset` in `docker-compose.yaml`) and both `check-yaml` and `yamllint`
  exclude `.forgejo/workflows/**`, which intentionally uses YAML truthy
  `on:` keys and long single-line `run:` commands that aren't worth
  re-flowing.
- Add `.markdownlint.yaml`, `.prettierrc`, `.prettierignore`,
  `docs/CONTRIBUTING.md` (documents hook setup and how to widen scope).

## Capabilities

### New Capabilities
- `precommit-lint-gate`: a pre-commit hook suite enforcing formatting,
  YAML/JSON validity, Markdown lint, and pre-push link-checking, scoped
  away from paths owned by concurrent in-flight lanes, with a forward-
  compatible placeholder for an Angular lint script that didn't exist yet.

### Modified Capabilities
(none)

## Impact

- Affected code: `.pre-commit-config.yaml`, `.markdownlint.yaml`,
  `.prettierrc`, `.prettierignore`, `docs/CONTRIBUTING.md`.
- Affected systems: requires `pre-commit` installed locally (`make hooks`
  wires it up, see the `add-tooling-makefile` lane); enforced at commit
  time, not in CI as a separate gate.
