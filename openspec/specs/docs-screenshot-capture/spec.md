# docs-screenshot-capture Specification

## Purpose
TBD - created by archiving change add-screenshot-capture. Update Purpose after archive.
## Requirements
### Requirement: Documentation captures are generated from the mocked harness, never a live herdr

Captures published in `README.md` SHALL be produced by a Playwright run
against the fully mocked bridge in `apps/web/e2e/helpers/mock-bridge.ts`
— `/api/hosts` and `/ws` both intercepted before `page.goto` — driven by
the deterministic fixture in `apps/web/e2e/fixtures/six-hundred-panes.ts`.

No capture SHALL require a running herdr, and none SHALL contact the
operator's socket at `~/.config/herdr/herdr.sock`.

The mock SHALL have exactly one implementation, shared by the capture run
and the viewport/state matrix, so the two cannot disagree about what a
populated board is.

#### Scenario: Captures run with no herdr present

- **WHEN** `make screenshots` runs on a machine with no herdr process and
  no herdr socket
- **THEN** every capture is produced and written to `docs/screenshots/`

### Requirement: Captures are reproducible on the machine that takes them

Elapsed-time text on a card is derived from `ClockTick`, a root signal
driven by a live `setInterval`, so an unfrozen capture differs between
runs. Each capture SHALL therefore install Playwright's clock at a fixed
instant **before** navigation and pause it a fixed interval after load —
the advance being required because `statusSince` is seeded at card
construction, so a bare freeze renders every card at `0s`.

Each capture SHALL be taken twice in the same page state and SHALL fail
rather than be written if the two buffers differ.

This guarantee is scoped to one machine: font rasterisation differs
across platforms, so the gate SHALL NOT be presented as a cross-machine
hash and SHALL NOT be used as a visual-regression baseline.

#### Scenario: A moving element fails the capture

- **WHEN** a capture's page still has an unfrozen timer, a running
  animation, or a live subscription repainting it
- **THEN** the two shots differ, the test fails naming the file, and no
  binary is written

#### Scenario: Elapsed text is stable

- **WHEN** the same capture is taken in two consecutive runs on one
  machine
- **THEN** the elapsed-time text on every card is identical

### Requirement: Capturing never happens as a side effect of testing or CI

The capture spec SHALL live in its own Playwright project, excluded from
the `chromium` and `mobile` projects, and the default `test:e2e` script
SHALL select projects explicitly so that a bare `playwright test` cannot
rewrite committed binaries.

Regenerating captures SHALL be an explicit act: `make screenshots`.
`make test-e2e`, `make ci` and `make ci-full` SHALL NOT run it.

#### Scenario: The test suite leaves screenshots alone

- **WHEN** `make test-e2e` runs
- **THEN** no file under `docs/screenshots/` is modified

### Requirement: The README gallery reflects what is actually captured

`README.md` SHALL show the committed captures rather than a placeholder,
and SHALL name the subjects that are still missing rather than implying
the gallery is complete.

Each capture SHALL carry alt text describing what the image shows, since
the gallery is the first thing a screen-reader user meets on the page.

#### Scenario: No stale promise

- **WHEN** a reader reaches the "More screenshots" section
- **THEN** it shows the captures that exist and names the remaining gap,
  and does not claim a capture harness is still pending

### Requirement: Committed captures are a curated set

Every committed capture is a permanent Git LFS blob. The published set
SHALL be curated to the subjects `README.md` describes, and SHALL NOT be
the full viewport/state matrix, which exists to probe contrast, keyboard
and paint timing rather than to be published.

Each entry SHALL record why it is committed, so a later reader can tell
whether it still earns its place.

#### Scenario: The matrix is not published

- **WHEN** the viewport/state matrix runs its 24 cells
- **THEN** no cell writes a file into `docs/screenshots/`

