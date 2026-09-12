# How to run kanhrd in Docker

## Prerequisites

- Docker Desktop (macOS/Windows) or a Docker Engine (Linux) with Compose v2.
- A local `herdr` server running, with its socket at the default path `~/.config/herdr/herdr.sock`.
- A `~/.config/herdr/config.toml` (herdr's own config). If you don't have one, create an empty file or drop that volume line from `docker-compose.yaml` — Docker creates a _directory_ at a missing bind-mount source.
- A browser that can reach `localhost`.

## Steps

1. `cd` to the repository root (the directory containing `docker-compose.yaml`).
2. Build the image: `make docker-build`.
3. Start the bridge: `make docker-up`.
4. Open `http://127.0.0.1:5173` in your browser.

## How the socket is mounted

Compose is split into a base file plus one overlay per platform, because the mount form that works is platform-dependent. `make docker-up` / `docker-down` / `docker-logs` pick the overlay from `PLATFORM` — `uname -s` by default (Darwin → `macos`, Linux → `linux`), overridable in `.env` or on the command line (`make docker-up PLATFORM=linux`). `make docker-compose-cmd` prints the command that resolves to. Spelled out, it is:

```shell
docker compose -f docker-compose.yaml -f docker-compose.macos.yaml up -d
```

**Docker Desktop (macOS, Windows) — mount the socket as a file** (`docker-compose.macos.yaml`):

```yaml
- ~/.config/herdr/herdr.sock:/home/kanhrd/.config/herdr/herdr.sock:ro
- ~/.config/herdr/config.toml:/home/kanhrd/.config/herdr/config.toml:ro
```

A directory bind-mount crosses Docker Desktop's file-sharing layer (VirtioFS/gRPC-FUSE), which passes a socket through as an inode the container can see but cannot `connect()` to — the listener lives in the host kernel, outside the VM. A socket-file mount is a path-resolving proxy across that boundary, so `connect()` reaches the host listener, and it keeps working after herdr restarts. Mounting the directory as well is not a workaround: the nested socket mount fails and the container doesn't start.

**Native Linux engine — mount the directory** (`docker-compose.linux.yaml`):

```yaml
- ~/.config/herdr:/home/kanhrd/.config/herdr:ro
```

No VM is involved, so a directory mount connects fine, and it carries herdr's `config.toml` along with the socket. Do not use the socket-file form here: a file bind-mount on Linux pins the inode, and herdr unlinks and rebinds its socket when it restarts, so the container keeps the dead inode and every later connect is refused.

## Expected result

The browser loads the kanhrd web UI (dark theme, empty or populated pane list depending on your herdr session) and connects to your local herdr host without further setup.

Verify from the command line instead of, or in addition to, the browser:

```shell
docker compose logs -f bridge
```

Look for a `connected: true`-equivalent status for the `local` host — the bridge logs a `Server listening` line on boot, and `curl http://127.0.0.1:5173/api/hosts` returns `{"hosts":[{"name":"local","connected":true,...}]}` once it has attached to the socket.

## Troubleshooting

- **Host stuck offline, `last_error: "connect ENOTSUP"` / `ECONNREFUSED` / `EACCES` / `ENOENT`.** The container starts, the healthcheck stays green (it only asserts `/api/hosts` returns 200) and the board shows a permanently offline host. Nothing crashes. Check the mount form first — see "How the socket is mounted" above. On Docker Desktop, a directory mount gives `ENOTSUP` from the first run. On Linux, a socket-file mount gives `ECONNREFUSED` from the first herdr restart onwards. Otherwise: confirm `herdr` is running on the host and owns the socket at the mounted path.
- **Offline on the wrong overlay.** `make docker-compose-cmd` prints which compose files the targets use. Docker Desktop needs `macos`, a native engine needs `linux`; the default comes from `uname -s`, so this only bites if `PLATFORM` was set by hand or inherited from `.env`.
- **`EACCES` on Linux.** The socket's uid/gid and mode must permit the image's `kanhrd` user; a herdr socket that is mode 0600 for another uid is denied. Docker Desktop hides this because it fakes ownership across the VM, so it only shows up on a native engine.
- **Denied on an SELinux distro (Fedora, RHEL, CentOS).** Append `,z` to the mount options in `docker-compose.linux.yaml` (`:ro,z`, or `:ro,Z` for a private label) so Docker relabels the path for the container.
- **Relocated socket.** If `herdr.sock` lives outside your home directory, update both the herdr config and the compose volume's host-side path — Docker Desktop only shares paths under its configured file-sharing roots (by default your home directory).
- **Host offline with a non-default `--user`.** The mount targets are under `/home/kanhrd`, the image's non-root user's home. Running with e.g. `-u 1000:1000` and no matching passwd entry makes Node's `homedir()` resolve to `/`, so the default socket path becomes `/.config/herdr/herdr.sock`, herdr's `config.toml` isn't found either, and the keybind prefix silently falls back to `Ctrl+B`.
- **Remote or multi-host herdr (ADR-0001).** The bridge itself doesn't dial out over SSH. Open an SSH tunnel that lands a local socket file (e.g. `/run/user/1000/herdr-cloud.sock`) and mount that into the container instead — see the commented `bridge-cloud` service in `docker-compose.yaml` for a worked example using a mounted `kanhrd.config.yaml`.
- **Port already in use / can't reach `127.0.0.1:5173`.** The compose file binds only to loopback (`127.0.0.1:5173:5173`) by design. If another process already owns 5173, change the host-side port in the base `docker-compose.yaml` (e.g. `127.0.0.1:5174:5173`) rather than binding to `0.0.0.0`. The published port is also the origin the browser sends, and the image's `CMD` hard-codes `--allowed-origin http://127.0.0.1:5173` and `http://localhost:5173` — change the port and every WebSocket handshake is refused with 403, visible only in `docker compose logs bridge`. Override the `CMD` origins to match the port you published.
