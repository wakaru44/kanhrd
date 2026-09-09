## 1. Config

- [x] 1.1 `.pre-commit-config.yaml`: pre-commit-hooks (trailing-whitespace, end-of-file-fixer, mixed-line-ending, check-yaml --unsafe, check-json, check-added-large-files) — `.pre-commit-config.yaml`
- [x] 1.2 `yamllint` hook with a repo-tuned rule set (120-char lines, `document-start`/`comments-indentation` disabled) — `.pre-commit-config.yaml`
- [x] 1.3 `prettier` hook across js/ts/jsx/tsx/css/scss/markdown/yaml/json — `.pre-commit-config.yaml`, `.prettierrc`, `.prettierignore`
- [x] 1.4 `markdownlint-cli` hook with `.markdownlint.yaml` config — `.pre-commit-config.yaml`, `.markdownlint.yaml`
- [x] 1.5 `markdown-link-check` hook, quiet, `pre-push` stage only — `.pre-commit-config.yaml`

## 2. Scope discipline

- [x] 2.1 Exclude `apps/**`, `packages/**`, `openspec/**`, `docs/adr/**`, `docs/CONTEXT.md`, `docs/OPERATING.md`, root `README.md`, `tmp/foreman/**`, `pnpm-lock.yaml`, `.claude/**`, `docs/history/**` from every hook to avoid conflicting with concurrent in-flight lanes — `.pre-commit-config.yaml`
- [x] 2.2 `docs/CONTRIBUTING.md` documents how to widen scope later — `docs/CONTRIBUTING.md`

## 3. Compose/Actions compatibility follow-up

- [x] 3.1 `check-yaml --unsafe` to parse Compose Spec YAML tags (`!reset`) — `.pre-commit-config.yaml` (`76d79a5`)
- [x] 3.2 `check-yaml` and `yamllint` exclude `.forgejo/workflows/**` — `.pre-commit-config.yaml` (`76d79a5`)
- [x] 3.3 Fenced code blocks in `deploy/docker/README.md`/`deploy/oauth/README.md` get explicit `shell`/`text` languages for markdownlint MD040 — `deploy/docker/README.md`, `deploy/oauth/README.md` (`76d79a5`)

## 4. Angular lint placeholder

- [x] 4.1 Local `web-lint` hook: `pnpm --filter @kanhrd/web run --if-present lint`, no-op until `apps/web` gets a real `lint` script — `.pre-commit-config.yaml`

## 5. Validator

- [x] 5.1 `openspec validate add-l-precommit-lint-gate --strict` passes with zero errors
