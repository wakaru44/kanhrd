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


### Requirement: The herdr socket is reachable only as a bind-mounted file
The shipped `docker-compose.yaml` SHALL bind-mount the herdr socket path
itself into the container. Exposing the socket only through a bind-mount of
its parent directory SHALL NOT be relied upon: on Docker Desktop (macOS and
Windows) the file-sharing layer passes the socket through as an inode the
container can see but cannot `connect()` to, because the listener lives in
the host kernel outside the VM. Any other host-side file the bridge reads
(herdr's `config.toml`) SHALL likewise be mounted as a file, since a socket
file mount nested inside a directory mount of the same path fails at
container start.

#### Scenario: Socket mounted as a file connects to the host's herdr
- **WHEN** the compose file mounts `~/.config/herdr/herdr.sock` at the bridge's default socket path inside the container and a herdr server owns that socket on the host
- **THEN** `GET /api/hosts` reports the local host as `connected: true`

#### Scenario: Directory-only mount leaves a permanently offline host
- **WHEN** only the socket's parent directory is bind-mounted into the container
- **THEN** the container starts, the healthcheck reports healthy, and `GET /api/hosts` reports the local host as `connected: false` with a `last_error` naming a failed `connect` (`ENOTSUP`, `ECONNREFUSED` or `ENOENT`)
