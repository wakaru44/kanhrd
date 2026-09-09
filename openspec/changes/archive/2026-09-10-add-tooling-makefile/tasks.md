## 1. Self-documenting help

- [x] 1.1 `help` target (also `.DEFAULT_GOAL`) scrapes `## <description>` comments per target and `## <Category>` section headers via `awk` into a categorized listing — `Makefile`

## 2. Setup and run targets

- [x] 2.1 `install`, `hooks` — `Makefile`
- [x] 2.2 `run` (safe loopback default), `run-exposed` (LAN/0.0.0.0, explicit warning in its description), `run-tailscale` (binds only the Tailscale interface), `run-tailscale-serve` (loopback + `tailscale serve` HTTPS fronting) — `Makefile`
- [x] 2.3 `dev-web`, `dev-bridge` (watch mode) — `Makefile`

## 3. Build and quality targets

- [x] 3.1 `build`, `build-schema`, `build-bridge`, `build-web` — `Makefile`
- [x] 3.2 `typecheck`, `test`, `test-unit`, `test-int`, `test-e2e`, `test-e2e-install`, `lint`, `format` — `Makefile`

## 4. Docker and CI targets

- [x] 4.1 `docker-build`, `docker-up`, `docker-down`, `docker-logs` — `Makefile`
- [x] 4.2 `ci` (fast local-parity suite: install, typecheck, unit tests, lint, build), `ci-full` (adds herdr-dependent `test-int`/`test-e2e`) — `Makefile`

## 5. Housekeeping

- [x] 5.1 `clean` (remove build outputs), `nuke` (also remove node_modules), `tailconnect` — `Makefile`
- [x] 5.2 Gitignore `.codegraph/` (local code-intelligence index) — `.gitignore`

## 6. Validator

- [x] 6.1 `openspec validate add-tooling-makefile --strict` passes with zero errors
