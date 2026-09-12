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


### Requirement: The herdr socket is reachable from inside the container
The shipped compose files SHALL mount the herdr socket in the form that can
actually be connected to on the host's platform, and SHALL make that form
selectable without editing a file. On Docker Desktop (macOS, Windows) that
is a bind-mount of the socket file itself: a bind-mount of its parent
directory crosses the VM's file-sharing layer, which passes the socket
through as an inode the container can see but cannot `connect()` to. On a
native Linux engine that is a bind-mount of the parent directory: a file
bind-mount pins the inode, and herdr unlinks and rebinds its socket on
restart. Any other host-side file the bridge reads (herdr's `config.toml`)
SHALL be reachable under the same mount, or mounted as a file alongside the
socket where the parent directory is not mounted.

#### Scenario: Socket mounted in the platform's working form
- **WHEN** the compose overlay for the host's platform is used and a herdr server owns the socket on the host
- **THEN** `GET /api/hosts` reports the local host as `connected: true`

#### Scenario: Directory-only mount on Docker Desktop
- **WHEN** only the socket's parent directory is bind-mounted on macOS or Windows
- **THEN** the container starts, the healthcheck reports healthy, and `GET /api/hosts` reports the local host as `connected: false` with a `last_error` naming a failed `connect`

#### Scenario: Socket-file mount on Linux after herdr restarts
- **WHEN** the socket file itself is bind-mounted on a native Linux engine and herdr restarts, unlinking and rebinding its socket
- **THEN** the running container's connections fail with `ECONNREFUSED` and the host stays `connected: false` while the healthcheck still reports healthy
