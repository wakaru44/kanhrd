# tooling-makefile Specification

## Purpose
A self-documenting root `Makefile` acting as the project's single command
entry point, delegating to pnpm/docker/pre-commit rather than
reimplementing them.
## Requirements
### Requirement: Running make with no target lists every command
Running `make` (or `make help`) with no other arguments SHALL print a
categorized listing of every target and its one-line description, derived
from `## <description>` comments on each target and `## <Category>`
section headers, without requiring a contributor to open the Makefile
itself.

#### Scenario: A new contributor discovers commands without reading the Makefile
- **WHEN** a contributor runs `make` in a fresh checkout
- **THEN** they see every available target grouped by category, each with a description, sourced entirely from the Makefile's own comments

### Requirement: Run targets state their network exposure honestly
Each `run*` target's description SHALL state what network interface it
binds to, so a contributor cannot accidentally expose the bridge beyond
loopback without the target's own help text saying so.

#### Scenario: The exposed-run target's description warns about exposure
- **WHEN** a contributor runs `make help` and reads the `run-exposed` target's description
- **THEN** the description states that it binds every interface including untrusted Wi-Fi, not just "runs the app"

### Requirement: Targets delegate to the underlying tool instead of reimplementing it
Every target SHALL be a thin delegation to the corresponding pnpm script,
Docker command, or pre-commit invocation, so the Makefile does not drift
from the tool's own behavior over time.

#### Scenario: A target's behavior matches running the underlying command directly
- **WHEN** `make test-unit` and `pnpm --filter @kanhrd/bridge test && pnpm --filter @kanhrd/web test` are compared
- **THEN** they run the identical underlying commands

