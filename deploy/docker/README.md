# How to run kanhrd in Docker

## Prerequisites

- Docker Desktop (macOS/Windows) or a Docker Engine (Linux) with Compose v2.
- A local `herdr` server running, with its socket at the default path `~/.config/herdr/herdr.sock`.
- A `~/.config/herdr/config.toml` (herdr's own config). If you don't have one, create an empty file or drop that volume line from `docker-compose.yaml` — Docker creates a _directory_ at a missing bind-mount source.
- A browser that can reach `localhost`.

## Steps

1. `cd` to the repository root (the directory containing `docker-compose.yaml`).
2. Build the image: `docker compose build`.
3. Start the bridge: `docker compose up -d`.
4. Open `http://127.0.0.1:5173` in your browser.

## How the socket is mounted

The compose file mounts the socket **as a file**, not by mounting the directory that holds it:

```yaml
- ~/.config/herdr/herdr.sock:/home/kanhrd/.config/herdr/herdr.sock:ro
- ~/.config/herdr/config.toml:/home/kanhrd/.config/herdr/config.toml:ro
```

A directory bind-mount crosses Docker Desktop's file-sharing layer (VirtioFS/gRPC-FUSE), which passes a socket through as an inode the container can see but cannot `connect()` to — the listener lives in the host kernel, outside the VM. A socket-file mount is handed to the VM as a real socket endpoint, so `connect()` reaches the host listener. On native Linux both forms work; on Docker Desktop (macOS, Windows) only the file form does. Mounting both the directory and the socket file is not a workaround: the nested socket mount fails and the container doesn't start.

Deleting and recreating the socket on the host (restarting herdr) under a running container is fine — the mount keeps working.

## Expected result

The browser loads the kanhrd web UI (dark theme, empty or populated pane list depending on your herdr session) and connects to your local herdr host without further setup.

Verify from the command line instead of, or in addition to, the browser:

```shell
docker compose logs -f bridge
```

Look for a `connected: true`-equivalent status for the `local` host — the bridge logs a `Server listening` line on boot, and `curl http://127.0.0.1:5173/api/hosts` returns `{"hosts":[{"name":"local","connected":true,...}]}` once it has attached to the socket.

## Troubleshooting

- **Host stuck offline, `last_error: "connect ENOTSUP"` / `ECONNREFUSED` / `ENOENT`.** The container starts, the healthcheck stays green (it only asserts `/api/hosts` returns 200) and the board shows a permanently offline host. Nothing crashes. Almost always the socket is being exposed through a directory mount instead of a socket-file mount — see "How the socket is mounted" above. Otherwise: confirm `herdr` is running on the host and owns the socket at the mounted path.
- **Works on Linux, offline on macOS (or vice versa).** Only the socket-file mount works on Docker Desktop; a directory mount works on native Linux and silently doesn't on macOS/Windows. If you relocate `herdr.sock` outside your home directory, update both the herdr config and the compose volume's host-side path — Docker Desktop only shares paths under its configured file-sharing roots (by default your home directory).
- **Host offline with a non-default `--user`.** The mount targets are under `/home/kanhrd`, the image's non-root user's home. Running with e.g. `-u 1000:1000` and no matching passwd entry makes Node's `homedir()` resolve to `/`, so the default socket path becomes `/.config/herdr/herdr.sock`, herdr's `config.toml` isn't found either, and the keybind prefix silently falls back to `Ctrl+B`.
- **Remote or multi-host herdr (ADR-0001).** The bridge itself doesn't dial out over SSH. Open an SSH tunnel that lands a local socket file (e.g. `/run/user/1000/herdr-cloud.sock`) and mount that into the container instead — see the commented `bridge-cloud` service in `docker-compose.yaml` for a worked example using a mounted `kanhrd.config.yaml`.
- **Port already in use / can't reach `127.0.0.1:5173`.** The compose file binds only to loopback (`127.0.0.1:5173:5173`) by design. If another process already owns 5173, change the host-side port in `docker-compose.yaml` (e.g. `127.0.0.1:5174:5173`) rather than binding to `0.0.0.0`. The published port is also the origin the browser sends, and the image's `CMD` hard-codes `--allowed-origin http://127.0.0.1:5173` and `http://localhost:5173` — change the port and every WebSocket handshake is refused with 403, visible only in `docker compose logs bridge`. Override the `CMD` origins to match the port you published.
