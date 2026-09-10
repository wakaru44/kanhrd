# @kanhrd/bridge

Node/TypeScript bridge between one or more herdr JSON sockets and kanhrd's
browser client. Speaks the tier-1 WebSocket + REST contract frozen in
`packages/schema/src/wire.ts` and serves the built SPA from `apps/web/dist/`.

## Dev quickstart

```bash
pnpm install
pnpm --filter @kanhrd/bridge dev
```

This starts the bridge on `127.0.0.1:5173` using the built-in default config
(one host named `local`, socket `~/.config/herdr/herdr.sock`) unless a
`kanhrd.config.yaml` exists in the current directory.

```bash
curl -s http://127.0.0.1:5173/api/hosts
curl -s http://127.0.0.1:5173/api/hosts/local/panes
```

Before `apps/web` has a build, `GET /` serves a small placeholder page
instead of failing.

## CLI flags

| Flag                     | Default                     | Notes                                                                          |
| ------------------------ | --------------------------- | ------------------------------------------------------------------------------ |
| `--config <path>`        | `kanhrd.config.yaml` in cwd | falls back to built-in defaults if the file is absent                          |
| `--port <n>`             | `5173`                      | overrides config file                                                          |
| `--bind <addr>`          | `127.0.0.1`                 | non-loopback addresses are refused unless paired with `--i-know-what-im-doing` |
| `--i-know-what-im-doing` | off                         | required to bind a non-loopback address                                        |
| `--spa-dir <path>`       | `../web/dist`               | resolved relative to the process cwd                                           |

## Config file

```yaml
bind: '127.0.0.1'
port: 5173
spa_dir: '../web/dist'
hosts:
  - name: 'local'
    socket: '~/.config/herdr/herdr.sock'
  - name: 'cloud'
    socket: '/run/user/1000/herdr-cloud.sock'
```

`socket` paths support `~` expansion. Each host gets its own herdr socket
connection, workspace/tab name cache, and reconnect loop (1s..30s
exponential backoff) — a host being down never blocks another host's
traffic; requests to a disconnected host respond with
`{ "ok": false, "error": { "code": "host_unavailable", ... } }`.

## Scripts

- `pnpm --filter @kanhrd/bridge dev` — `tsx watch src/main.ts`
- `pnpm --filter @kanhrd/bridge build` — compiles to `dist/`
- `pnpm --filter @kanhrd/bridge typecheck` — `tsc --noEmit`
- `pnpm --filter @kanhrd/bridge test` — `vitest run` (unit tests, `src/**/*.test.ts`, fake sockets, no real herdr needed)
- `pnpm --filter @kanhrd/bridge test:int` — `vitest run --config vitest.integration.config.ts` (integration tests, see below)

## Integration tests

`apps/bridge/integration/` is a permanent test suite that spawns the real
bridge as a subprocess and exercises its HTTP + WebSocket surface end to end
against a live local herdr server — the bridge/herdr/browser boundary that
unit tests (fake sockets) and the Playwright suite (browser-level flows)
both leave uncovered. It replaces the one-off `curl`/`wscat`/Node-script
smoke tests that used to get reinvented for every validation round.

```bash
pnpm test:int                                    # from repo root
pnpm --filter @kanhrd/bridge test:int             # equivalent, scoped
```

Requires a running local herdr server (`~/.config/herdr/herdr.sock`) with at
least one open pane — the suite skips with a clear message if herdr isn't
reachable, the same pattern `apps/web/e2e` uses. See
`apps/bridge/integration/README.md` for what each file covers and how it
maps to the historical validation rounds.
