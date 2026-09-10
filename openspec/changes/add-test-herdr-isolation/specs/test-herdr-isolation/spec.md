## ADDED Requirements

### Requirement: No suite contacts the operator's default herdr session
Every automated suite that reaches herdr SHALL do so through a herdr
session created for that run, and SHALL NOT open, read from, write to,
or subscribe to the default socket at `~/.config/herdr/herdr.sock`.

This covers `pnpm test:int` and every `apps/web/e2e` spec, whether it
merely lists panes or types into them. Listing is not exempt: the
operator's session is production.

The bridge under test SHALL be started with `--config` naming a
generated config whose single host points at the run's own socket. No
change to `apps/bridge/src/**` is required or permitted by this change.

#### Scenario: The integration suite runs
- **WHEN** `pnpm test:int` runs on a machine whose default herdr session is running
- **THEN** the default session's pane, tab and workspace set is unchanged after the run, and the bridge under test never connected to its socket

#### Scenario: The live e2e suite types into panes
- **WHEN** the live `apps/web/e2e` specs run and type into panes
- **THEN** every pane they type into belongs to the run's own session

#### Scenario: A suite cannot create a session
- **WHEN** herdr is absent, or the run's session fails to start
- **THEN** the suite reports that reason and does not fall back to the default socket

### Requirement: A run's herdr session is disposed of
A run's session SHALL be stopped and deleted when the run ends,
including when it ends by crash, timeout or interrupt. A session SHALL
carry a name identifying it as a test artifact and the run that made it,
so a leaked one is recognisable.

Teardown SHALL NOT stop, delete or reload any session it did not create.

#### Scenario: A run crashes mid-suite
- **WHEN** a suite process dies before its teardown
- **THEN** the next run detects the leaked session by name and disposes of it before starting its own

#### Scenario: Teardown leaves other sessions alone
- **WHEN** a run's teardown executes while the operator's default session is running
- **THEN** the default session is still running afterwards

### Requirement: The isolation guarantee is stated where sessions read it
`CLAUDE.md` SHALL describe the enforcement that actually exists, and
SHALL NOT credit unbuilt work with enforcing it. When a guard is
absent, the file SHALL say so plainly enough that a session does not
infer protection it does not have.

#### Scenario: A session reads the rule before running a suite
- **WHEN** an agent reads CLAUDE.md's herdr-isolation rule
- **THEN** it can tell from that text alone which suites are isolated and which reach a live socket
