# bridge-security Specification

## Purpose
TBD - created by archiving change add-bridge-origin-allowlist. Update Purpose after archive.
## Requirements
### Requirement: WebSocket handshake Origin allowlist
The bridge SHALL validate the `Origin` header of every `/ws` WebSocket
handshake against an allowlist before the connection is upgraded, and
SHALL refuse the upgrade when the origin is present and does not match.
The check SHALL run before any WebSocket is created, so that no
`ws/dispatch.ts` verb is reachable from a rejected handshake.

The effective allowlist SHALL be the union of the derived allowlist and
the configured allowlist. A handshake carrying no `Origin` header SHALL be
permitted unless `require_origin` is enabled.

#### Scenario: A cross-site page is refused
- **WHEN** a handshake for `/ws` arrives with `Origin: https://evil.example` and that origin is not in the effective allowlist
- **THEN** the bridge responds `403` with `content-type: application/json` and body `{"error":"origin not allowed"}`, no WebSocket is created, and no dispatch verb is executed

#### Scenario: The bridge's own SPA is permitted
- **WHEN** a handshake arrives with an `Origin` equal to an entry in the effective allowlist
- **THEN** the bridge completes the upgrade and the connection behaves exactly as it did before this requirement existed

#### Scenario: A non-browser client sending no Origin is permitted
- **WHEN** a handshake arrives with no `Origin` header and `require_origin` is not enabled
- **THEN** the bridge completes the upgrade

#### Scenario: `Origin: null` is refused
- **WHEN** a handshake arrives with the literal header `Origin: null`
- **THEN** the bridge refuses the upgrade with `403`, regardless of the configured allowlist, because `null` is a present-but-unmatchable origin rather than an absent one

### Requirement: Default allowlist derived from bind and port
The bridge SHALL derive an allowlist from the merged `bind` and `port`
configuration with no operator action, so that a loopback deployment
started with no arguments continues to work.

The derived set SHALL be the cross product of the schemes `http` and
`https` with a host set `HOSTS` at the configured `port`, where `HOSTS` is:

- `{"127.0.0.1", "localhost", "[::1]"}` when `bind` is one of
  `127.0.0.1`, `::1`, `localhost`;
- `{"127.0.0.1", "localhost", "[::1]"}` when `bind` is the wildcard
  `0.0.0.0` or `::` — a wildcard address SHALL NOT itself be derived from;
- `{"127.0.0.1", "localhost", "[::1]", "<bind>"}` for any other literal
  bind address, with an IPv6 literal bracketed.

#### Scenario: Default loopback deployment needs no configuration
- **WHEN** the bridge starts with the default configuration (`bind: 127.0.0.1`, `port: 5173`) and no `allowed_origins`
- **THEN** handshakes with `Origin: http://127.0.0.1:5173`, `http://localhost:5173` and `http://[::1]:5173` are permitted

#### Scenario: A literal non-loopback bind derives its own origin
- **WHEN** the bridge is started with `--bind 100.64.1.2 --i-know-what-im-doing` on port 5173
- **THEN** a handshake with `Origin: http://100.64.1.2:5173` is permitted without any `allowed_origins` entry

#### Scenario: Port changes move the derived allowlist
- **WHEN** the bridge is started with `--port 8080` on a loopback bind
- **THEN** `Origin: http://127.0.0.1:8080` is permitted and `Origin: http://127.0.0.1:5173` is refused

### Requirement: Configuring additional origins
The bridge SHALL accept additional origins from the config file key
`allowed_origins` (a list of strings, snake_case, alongside the existing
`bind`, `port`, `spa_dir` and `hosts` keys) and from a repeatable
`--allowed-origin <origin>` CLI flag.

When one or more `--allowed-origin` flags are given, the resulting list
SHALL replace the config file's `allowed_origins`, matching the existing
override precedence of every other `CliOverrides` field. The derived
allowlist SHALL always be added to whichever configured list is in effect.

#### Scenario: One YAML line admits a proxied origin
- **WHEN** `kanhrd.config.yaml` contains `allowed_origins: ["https://kanhrd.example.com"]` and the bridge is bound to loopback behind a proxy
- **THEN** a handshake with `Origin: https://kanhrd.example.com` is permitted, and loopback origins remain permitted

#### Scenario: Repeated CLI flags accumulate
- **WHEN** the bridge is started with `--allowed-origin http://a.example --allowed-origin http://b.example`
- **THEN** both origins are permitted

#### Scenario: CLI flags replace the file list
- **WHEN** the config file lists `https://old.example` and the bridge is started with `--allowed-origin https://new.example`
- **THEN** `https://new.example` is permitted and `https://old.example` is refused

### Requirement: Exact origin matching with no pattern syntax
The bridge SHALL compare origins by exact canonical triple and SHALL NOT
support wildcards, globs, or suffix matching in allowlist entries.

Each configured entry and each incoming `Origin` SHALL be normalized to
`(scheme, host, port)` where the scheme is lowercased and MUST be `http`
or `https`, the host is lowercased with IPv6 literals bracketed, and the
port is the explicit port or else `80` for `http` and `443` for `https`.
A handshake SHALL be permitted only when its triple is equal to some
allowlist triple in all three components.

A configured entry that has a path other than empty or `/`, a query, a
fragment, userinfo, a scheme other than `http`/`https`, or that fails to
parse, SHALL cause the bridge to fail at startup with an error naming the
offending entry.

#### Scenario: Suffix confusion does not match
- **WHEN** `https://example.com` is allowlisted and a handshake arrives with `Origin: https://example.com.attacker.net`
- **THEN** the handshake is refused

#### Scenario: Scheme and port are part of the identity
- **WHEN** `http://localhost:5173` is allowlisted
- **THEN** handshakes with `Origin: https://localhost:5173` and `Origin: http://localhost:5174` are both refused

#### Scenario: A hostname that resolves to loopback is still a distinct origin
- **WHEN** a handshake arrives with `Origin: http://localhost.attacker.example:5173`, whose hostname resolves to `127.0.0.1`
- **THEN** the handshake is refused, because the origin host is not `localhost`

#### Scenario: A malformed allowlist entry fails at startup
- **WHEN** the config contains `allowed_origins: ["https://kanhrd.example.com/board"]`
- **THEN** the bridge exits at startup with an error naming that entry, rather than starting with a silently ignored or over-broad rule

### Requirement: Wildcard bind requires an explicit allowlist
When the merged `bind` is the wildcard `0.0.0.0` or `::` and the
configured allowlist is empty, the bridge SHALL refuse to start, by the
same mechanism and in the same place as the existing non-loopback bind
guard, and SHALL NOT listen on any port.

The error SHALL name the wildcard bind, the `allowed_origins` config key,
the `--allowed-origin` flag, and the `--allow-any-origin` escape hatch.

The bridge SHALL accept `--allow-any-origin` as a CLI-only flag that
disables origin validation entirely. There SHALL be no config-file
equivalent of that flag, and its use SHALL be logged at `warn` on every
startup.

#### Scenario: Wildcard bind with no origins refuses to start
- **WHEN** the bridge is started with `--bind 0.0.0.0 --i-know-what-im-doing` and no configured origins
- **THEN** startup fails with an error naming `allowed_origins`, `--allowed-origin` and `--allow-any-origin`, and nothing listens

#### Scenario: Wildcard bind with a configured origin starts
- **WHEN** the bridge is started with `--bind 0.0.0.0 --i-know-what-im-doing --allowed-origin http://127.0.0.1:5173`
- **THEN** the bridge starts and permits that origin

#### Scenario: The escape hatch disables the check loudly
- **WHEN** the bridge is started with `--allow-any-origin`
- **THEN** every origin is permitted and a `warn` line stating that origin validation is disabled is emitted at startup

### Requirement: Optional strict mode for missing Origin
The bridge SHALL support `require_origin` (config file, boolean) and
`--require-origin` (CLI), which when enabled cause a handshake carrying no
`Origin` header to be refused with the same `403` response as a
non-matching origin. The default SHALL be disabled, because a browser
always sends `Origin` on a WebSocket handshake and its absence therefore
indicates a non-browser client.

#### Scenario: Strict mode refuses a headerless client
- **WHEN** `require_origin` is enabled and a handshake arrives with no `Origin` header
- **THEN** the bridge refuses the upgrade with `403`

#### Scenario: Default mode admits a headerless client
- **WHEN** `require_origin` is not set and a handshake arrives with no `Origin` header
- **THEN** the bridge completes the upgrade

### Requirement: Diagnosable rejection and startup logging
The bridge SHALL emit, at `info` on startup, one line stating the
effective allowlist, which entries were derived from `bind`/`port`, which
were configured, and whether missing-`Origin` handshakes are permitted.

For each rejected handshake the bridge SHALL emit one `warn` line
containing the rejected origin, the remote address, the effective
allowlist, and how to add an origin (`allowed_origins` /
`--allowed-origin`), so that a misconfiguration and an attack are
distinguishable from the log alone.

#### Scenario: Startup states the effective policy
- **WHEN** the bridge starts
- **THEN** the log contains one line listing the derived origins, the configured origins, and the missing-`Origin` policy

#### Scenario: A rejection is self-diagnosing
- **WHEN** a handshake is refused because its origin is not allowed
- **THEN** the log contains one `warn` line naming that origin, the remote address, the effective allowlist, and the config key to add it to

