## Purpose

A committed, permanent test suite exercising the real bridge process's
HTTP/WS surface against a real herdr server, replacing ad-hoc throwaway
validation scripts and filling the gap between hermetic bridge unit tests
and browser-level Playwright e2e tests.

## ADDED Requirements

### Requirement: Suite drives the real bridge process over real wire traffic
The integration suite SHALL spawn the actual bridge entrypoint as a
subprocess and communicate with it exclusively over its public HTTP and
WebSocket surface — not by importing bridge internals directly — so it
proves the same boundary a real browser client would cross.

#### Scenario: A regression in wire framing is caught here, not just in unit tests
- **WHEN** a bridge change breaks WebSocket response framing while the unit tests (which fake the socket layer) still pass
- **THEN** the integration suite's `ws-methods.test.ts` fails, because it decodes real frames from a real spawned process

### Requirement: Suite skips gracefully without a live herdr server
Every integration test file SHALL detect whether a local herdr server is
reachable (socket present, at least one pane open) before running its
assertions, and SHALL skip with a clear message rather than fail on
connection-refused noise when it is not.

#### Scenario: CI runner with no herdr installed stays green
- **WHEN** `pnpm test:int` runs on a machine with no `~/.config/herdr/herdr.sock`
- **THEN** every test file reports a skip with an explanatory message, and the overall suite run exits successfully (0 failed)

### Requirement: Suite covers connectivity, protocol methods, ordering, and tier-3 lifecycle
The suite SHALL include at minimum: HTTP/lifecycle connectivity checks,
WebSocket protocol method coverage, an ordering-guarantees check for the
keystroke/output-ordering class of bug found during tier-2 validation, and
tier-3 pane/tab/workspace CRUD-plus-events coverage against a live herdr
server.

#### Scenario: Ordering regression is caught against a real socket
- **WHEN** a change reintroduces out-of-order keystroke delivery between the browser-facing WebSocket and herdr's own socket
- **THEN** `ordering.test.ts`, run against a real bridge and real herdr, fails
