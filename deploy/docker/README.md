# How to run kanhrd in Docker

## Prerequisites

- Docker Desktop (macOS/Windows) or a Docker Engine (Linux) with Compose v2.
- A local `herdr` server running, with its socket at the default path `~/.config/herdr/herdr.sock`.
- A browser that can reach `localhost`.

## Steps

1. `cd` to the repository root (the directory containing `docker-compose.yaml`).
2. Build the image: `docker compose build`.
3. Start the bridge: `docker compose up -d`.
4. Open `http://127.0.0.1:5173` in your browser.

## Expected result

The browser loads the kanhrd web UI (dark theme, empty or populated pane list depending on your herdr session) and connects to your local herdr host without further setup.

Verify from the command line instead of, or in addition to, the browser:

```
docker compose logs -f bridge
```

Look for a `connected: true`-equivalent status for the `local` host — the bridge logs a `Server listening` line on boot, and `curl http://127.0.0.1:5173/api/hosts` returns `{"hosts":[{"name":"local","connected":true,...}]}` once it has attached to the socket.

## Troubleshooting

- **Socket permission denied / `ENOENT` for `herdr.sock`.** The container mounts `~/.config/herdr` read-only at `/home/kanhrd/.config/herdr`. Confirm `herdr` is actually running on the host and has created the socket at that path before starting the container; the bridge connects to hosts lazily but a missing socket file shows up as `last_error` in `/api/hosts`.
- **Works on Linux, empty/refused on macOS (or vice versa).** Docker Desktop for macOS bind-mounts a real Unix socket into the container fine for this case, but if you relocate `herdr.sock` outside your home directory, update both the herdr config and the compose volume's host-side path — Docker Desktop only shares paths under its configured file-sharing roots (by default your home directory).
- **Remote or multi-host herdr (ADR-0001).** The bridge itself doesn't dial out over SSH. Open an SSH tunnel that lands a local socket file (e.g. `/run/user/1000/herdr-cloud.sock`) and mount that into the container instead — see the commented `bridge-cloud` service in `docker-compose.yaml` for a worked example using a mounted `kanhrd.config.yaml`.
- **Port already in use / can't reach `127.0.0.1:5173`.** The compose file binds only to loopback (`127.0.0.1:5173:5173`) by design. If another process already owns 5173, change the host-side port in `docker-compose.yaml` (e.g. `127.0.0.1:5174:5173`) rather than binding to `0.0.0.0`.
