# docker-image Specification

## Purpose
A reproducible container image bundling the bridge and built SPA, runnable
without a Node toolchain on the host, defaulting to the same loopback-only
exposure as a non-Docker install.
## Requirements
### Requirement: Image runs as non-root and needs no host Node toolchain
The image SHALL run the bridge process as a non-root user and SHALL
contain the bridge's production dependencies and the SPA's built static
assets without requiring a pnpm workspace or lockfile at runtime.

#### Scenario: Container starts on a host with no Node or pnpm installed
- **WHEN** `docker compose up -d` runs on a host with neither Node.js nor pnpm on `PATH`
- **THEN** the bridge starts successfully and serves the SPA

### Requirement: Host-side exposure defaults to loopback-only
The shipped `docker-compose.yaml` SHALL publish the bridge port bound to
`127.0.0.1` by default, matching the non-Docker bridge's own loopback
default (ADR-0003). Exposing the container beyond loopback SHALL require
an explicit compose-file edit, not a default-on flag.

#### Scenario: Default compose file is not reachable from another host
- **WHEN** `docker compose up -d` runs with the shipped `docker-compose.yaml` unmodified
- **THEN** the bridge port is not reachable from any host other than the machine running Docker

### Requirement: Container health is checkable via the standard Docker healthcheck
The image SHALL declare a `HEALTHCHECK` that succeeds only once the bridge
is actually serving `GET /api/hosts` successfully, so orchestration tools
can distinguish "container running" from "bridge ready."

#### Scenario: Healthcheck fails before the bridge has attached to herdr
- **WHEN** the bridge process is still starting and not yet accepting HTTP requests
- **THEN** `docker inspect`'s health status is not `healthy`

