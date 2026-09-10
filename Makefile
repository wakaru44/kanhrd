# kanhrd — self-documenting Makefile.
#
# Every target below carries a `## <description>` comment that `make help`
# scrapes into a listing. Keep targets short (mostly one-liners delegating to
# pnpm/docker/pre-commit) so the Makefile stays the entry point without
# reimplementing tooling.

SHELL       := /bin/bash
.SHELLFLAGS := -eu -o pipefail -c
.DEFAULT_GOAL := help

# ---- tailscale binary auto-detection --------------------------------------
# Prefer `tailscale` on PATH (Linux and macOS CLI-install). Fall back to the
# macOS .app bundle location. Empty if neither exists — the
# `_require-tailscale` guard target fails with a helpful message when a
# target actually needs it.
TAILSCALE_APP_MACOS := /Applications/Tailscale.app/Contents/MacOS/Tailscale
TAILSCALE_ON_PATH   := $(shell command -v tailscale 2>/dev/null)
TAILSCALE ?= $(or $(TAILSCALE_ON_PATH),$(wildcard $(TAILSCALE_APP_MACOS)))

# ---- meta -----------------------------------------------------------------

.PHONY: help
help: ## Show this help.
	@awk 'BEGIN { \
	    FS = ":.*?## "; \
	    printf "\n\033[1mkanhrd\033[0m — a kanban web UI for herdr.\n\n"; \
	    printf "\033[1mUsage:\033[0m make \033[36m<target>\033[0m\n\n"; \
	    printf "\033[1mTargets:\033[0m\n"; \
	  } \
	  /^[a-zA-Z0-9_.-]+:.*?## / { printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2 } \
	  /^## / { printf "\n\033[1m%s\033[0m\n", substr($$0, 4) }' $(MAKEFILE_LIST)
	@echo

## Setup
.PHONY: install
install: ## Install workspace dependencies (pnpm --frozen-lockfile).
	pnpm install --frozen-lockfile

.PHONY: hooks
hooks: ## Install git-lfs filters and the pre-commit git hooks locally.
	git lfs install --local --force
	pre-commit install --hook-type pre-commit --hook-type pre-push

## Run (built once, no watch)
.PHONY: run
run: build-web build-bridge ## Build then run the bridge locally on 127.0.0.1:5173 (safe default).
	node apps/bridge/dist/main.js

.PHONY: run-exposed
run-exposed: build-web build-bridge ## Bind 0.0.0.0 for LAN / dev-through-Tailscale (exposes on EVERY interface including untrusted Wi-Fi — prefer run-tailscale on a laptop).
	node apps/bridge/dist/main.js --bind 0.0.0.0 --i-know-what-im-doing

.PHONY: _require-tailscale
_require-tailscale: ## (internal) fail with a clear message if tailscale isn't installed.
	@test -n "$(TAILSCALE)" || { \
	  echo "error: tailscale binary not found." >&2; \
	  echo "  Checked: PATH (\`tailscale\`) and $(TAILSCALE_APP_MACOS)." >&2; \
	  echo "  Install from https://tailscale.com/download or ensure the CLI is on PATH." >&2; \
	  exit 1; \
	}

.PHONY: run-tailscale
run-tailscale: _require-tailscale build-web build-bridge ## Bind ONLY to the Tailscale interface IP (safer than 0.0.0.0 on a laptop).
	node apps/bridge/dist/main.js --bind "$$($(TAILSCALE) ip -4 | head -n1)" --i-know-what-im-doing

.PHONY: run-tailscale-serve
run-tailscale-serve: _require-tailscale build-web build-bridge ## Bridge stays loopback; `tailscale serve` fronts it with HTTPS via Tailscale certs. Ctrl+C to stop; `make tailoff` to remove.
	@echo "Starting bridge on loopback (5173) + Tailscale Serve fronting on https://$$($(TAILSCALE) status --self=true --json | jq -r '.Self.DNSName' | sed 's/\.$$//')" ; \
	 $(TAILSCALE) serve --https 5173 --set-path=/ http://127.0.0.1:5173 & \
	 node apps/bridge/dist/main.js

## Dev (watch mode, hot reload)
.PHONY: dev-web
dev-web: ## Angular dev server for the SPA with HMR (proxies /api and /ws to :5173 — pair with `dev-bridge`).
	pnpm --filter @kanhrd/web start

.PHONY: dev-bridge
dev-bridge: ## Bridge in watch mode (tsx watch — restarts on source change).
	pnpm --filter @kanhrd/bridge dev

## Build
.PHONY: build
build: build-schema build-bridge build-web ## Build every workspace package.

.PHONY: build-schema
build-schema: ## Build @kanhrd/schema (TS types).
	pnpm --filter @kanhrd/schema build

.PHONY: build-bridge
build-bridge: ## Build @kanhrd/bridge (Node/TS).
	pnpm --filter @kanhrd/bridge build

.PHONY: build-web
build-web: ## Build @kanhrd/web (Angular SPA).
	pnpm --filter @kanhrd/web build

## Quality
.PHONY: typecheck
typecheck: ## Typecheck every package.
	pnpm -r typecheck

.PHONY: test
test: test-unit test-int test-e2e ## Run every test suite (unit + integration + e2e).

.PHONY: test-unit
test-unit: ## Unit tests for bridge and web.
	pnpm --filter @kanhrd/bridge test
	pnpm --filter @kanhrd/web test

.PHONY: test-int
test-int: ## Bridge integration tests (spawns real bridge; skips if herdr absent).
	pnpm test:int

.PHONY: test-e2e
test-e2e: build-web build-bridge ## Playwright E2E suite (desktop + mobile; needs herdr).
	pnpm test:e2e

.PHONY: screenshots
screenshots: build-web build-bridge ## Regenerate docs/screenshots/*.png (LFS binaries; not run by tests or CI).
	pnpm --filter @kanhrd/web screenshots

.PHONY: test-e2e-install
test-e2e-install: ## One-time Playwright browser install.
	pnpm --filter @kanhrd/web test:e2e:install

.PHONY: lint
lint: ## Run pre-commit over the whole tree.
	pnpm lint

.PHONY: format
format: ## Auto-format everything Prettier owns.
	pnpm format

## Docker
.PHONY: docker-build
docker-build: ## Build the kanhrd:latest container image.
	docker build -t kanhrd:latest .

.PHONY: docker-up
docker-up: ## Start the bridge container (docker compose up -d).
	docker compose up -d

.PHONY: docker-down
docker-down: ## Stop the bridge container.
	docker compose down

.PHONY: docker-logs
docker-logs: ## Tail bridge container logs.
	docker compose logs -f bridge

## CI
.PHONY: ci
ci: install typecheck test-unit lint build ## Same suite CI would run on a fresh checkout (fast bits).

.PHONY: ci-full
ci-full: ci test-int test-e2e ## Full CI including herdr-dependent suites.

## Housekeeping
.PHONY: clean
clean: ## Remove build outputs (keeps node_modules).
	rm -rf apps/*/dist packages/*/dist

.PHONY: nuke
nuke: clean ## Also remove node_modules and Playwright browser cache.
	rm -rf node_modules apps/*/node_modules packages/*/node_modules

## Tailscale
.PHONY: tailconnect
tailconnect: _require-tailscale ## Just front the bridge with `tailscale serve` (assumes bridge already running on :5173).
	$(TAILSCALE) serve --https 5173 http://127.0.0.1:5173

.PHONY: tailoff
tailoff: _require-tailscale ## Remove the Tailscale Serve mapping on :5173.
	$(TAILSCALE) serve --https 5173 off

.PHONY: tailwhich
tailwhich: ## Print which tailscale binary the Makefile resolved (empty = not found).
	@echo "TAILSCALE=$(TAILSCALE)"
