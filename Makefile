# kanhrd — self-documenting Makefile.
#
# Every target below carries a `## <description>` comment that `make help`
# scrapes into a listing. Keep targets short (mostly one-liners delegating to
# pnpm/docker/pre-commit) so the Makefile stays the entry point without
# reimplementing tooling.

SHELL       := /bin/bash
.SHELLFLAGS := -eu -o pipefail -c
.DEFAULT_GOAL := help

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
hooks: ## Install the pre-commit git hooks locally.
	pre-commit install

## Run (built once, no watch)
.PHONY: run
run: build-web build-bridge ## Build then run the bridge locally on 127.0.0.1:5173 (safe default).
	node apps/bridge/dist/main.js

.PHONY: run-exposed
run-exposed: build-web build-bridge ## Bind 0.0.0.0 for LAN / dev-through-Tailscale (exposes on EVERY interface including untrusted Wi-Fi — prefer run-tailscale on a laptop).
	node apps/bridge/dist/main.js --bind 0.0.0.0 --i-know-what-im-doing

.PHONY: run-tailscale
run-tailscale: build-web build-bridge ## Bind ONLY to the Tailscale interface IP (safer than 0.0.0.0 on a laptop; needs `tailscale` on PATH).
	node apps/bridge/dist/main.js --bind "$$(tailscale ip -4 | head -n1)" --i-know-what-im-doing

.PHONY: run-tailscale-serve
run-tailscale-serve: build-web build-bridge ## Bridge stays loopback; `tailscale serve` fronts it with HTTPS via Tailscale certs (recommended for laptop-through-Tailscale). Ctrl+C to stop; run `tailscale serve --https 5173 off` to remove afterward.
	@echo "Starting bridge on loopback (5173) + Tailscale Serve fronting on https://$$(tailscale status --self=true --json | jq -r '.Self.DNSName' | sed 's/\.$$//')" ; \
	 tailscale serve --https 5173 --set-path=/ http://127.0.0.1:5173 & \
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
