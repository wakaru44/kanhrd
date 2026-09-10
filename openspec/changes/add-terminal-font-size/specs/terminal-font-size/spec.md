## Purpose

Terminal font size is a user preference, not a constant. It is app-wide,
persisted in this browser, chosen from a fixed ladder derived from the
brand type scale, and applied to terminals that are already open as well
as to ones opened later — with the terminal's grid geometry refitted
whenever it changes.

## Vocabulary

User-facing copy says **card** and **pen**; code, wire and schema say
`pane` and `host`. A **terminal** is the xterm.js surface inside a card's
detail view. The **ladder** is the ordered set of allowed font sizes.

## ADDED Requirements

### Requirement: Terminal font size is an app-wide preference

The app SHALL hold exactly one terminal font size, applied to every
xterm.js terminal it renders. Per-pane, per-pen, per-field and per-lane
font sizes SHALL NOT be introduced.

This mirrors the terminal palette model recorded in
`docs/DESIGN-SYSTEM.md` § Terminal: cards are told apart by title, pen
seal and status, never by terminal appearance.

The preference SHALL live in a dedicated service alongside
`TerminalThemeService`, exposing a readable signal of the current size
and a setter, so that any terminal-rendering component can depend on the
signal without owning the storage.

Changing the font size SHALL NOT change the terminal palette, and
changing the terminal palette SHALL NOT change the font size. The two
preferences SHALL be independently stored and independently readable.

#### Scenario: One size across two terminals

- **WHEN** the operator sets the terminal font size and opens two
  different cards' terminals
- **THEN** both terminals render at that size

#### Scenario: The palette is untouched by a size change

- **WHEN** the operator has selected a non-default terminal palette and
  then changes the terminal font size
- **THEN** the selected palette is still in effect and its stored value
  is unchanged

#### Scenario: The size is untouched by a palette change

- **WHEN** the operator has selected a non-default font size and then
  changes the terminal palette
- **THEN** the selected font size is still in effect and its stored
  value is unchanged

### Requirement: The allowed sizes are a fixed ladder with 13 as the default

The allowed terminal font sizes SHALL be exactly **12, 13, 15, 17 and
20** pixels — the pixel values of `--fs-caption`, `--fs-small`,
`--fs-body`, `--fs-lead` and `--fs-h3` from `docs/DESIGN-SYSTEM.md`
§ Typography at the 16px root.

The default SHALL be **13**, which is both `--fs-small` and the size
every terminal rendered at before this change, so an operator who never
opens Settings SHALL see no change in terminal appearance.

No size below `--fs-caption` SHALL be offered, per
`docs/DESIGN-SYSTEM.md`'s rule that nothing below `--fs-caption` may be
introduced. No size above `--fs-h3` SHALL be offered, because the next
ladder rung drops a 1280px-wide desktop terminal below 80 columns.

The ladder SHALL be exported as an ordered constant so the Settings
control, the load path and the tests all read the same source.

#### Scenario: A fresh browser

- **WHEN** the app loads with no stored terminal font size
- **THEN** terminals render at 13px

### Requirement: The preference persists across reloads and sessions

The chosen size SHALL be written to
`localStorage['kanhrd.terminal-font-size']` whenever it changes, and
read back on app start.

The storage key SHALL carry the `kanhrd.` prefix
(`KANHRD_STORAGE_PREFIX`) so that Settings → Data → "clear local data",
which removes every `kanhrd.`-prefixed key, removes this preference too
without any change to `SettingsService.clearLocalData`.

The "clear local data" confirmation's preview list SHALL name the
terminal font size among the things that will be cleared, so the list
stays a complete account of what is lost.

#### Scenario: Reload

- **WHEN** the operator selects 17px and reloads the page
- **THEN** terminals render at 17px

#### Scenario: Clearing local data

- **WHEN** the operator has selected a non-default size and confirms
  "clear local data"
- **THEN** the stored `kanhrd.terminal-font-size` key is removed and the
  next load renders terminals at 13px

### Requirement: A stored value that is absent, corrupt or out of range resolves to a usable size

Reading the stored preference SHALL NOT throw for any stored string, and
SHALL resolve as follows:

- An absent, empty or non-finite value (including `"NaN"`,
  `"Infinity"`, arbitrary text and JSON) SHALL resolve to the default.
- A finite number outside the ladder's bounds SHALL resolve to the
  default.
- A finite number within the ladder's bounds that is not itself a ladder
  step SHALL resolve to the nearest ladder step, with a tie resolving to
  the smaller step.

The nearest-step rule exists so a deliberate choice survives a future
change to the ladder, in the same way `LEGACY_NAMES` in
`terminal-theme.service.ts` lets a stored palette name survive a rename.

The read SHALL be a pure function taking a storage-like object, so it is
testable without Angular dependency injection.

#### Scenario: Corrupt value

- **WHEN** `kanhrd.terminal-font-size` holds `"large"`
- **THEN** the resolved size is 13 and no error is thrown

#### Scenario: Out-of-range value

- **WHEN** `kanhrd.terminal-font-size` holds `"999"` or `"-13"`
- **THEN** the resolved size is 13

#### Scenario: Off-ladder value

- **WHEN** `kanhrd.terminal-font-size` holds `"16"`
- **THEN** the resolved size is 15

#### Scenario: Off-ladder value equidistant between two steps

- **WHEN** `kanhrd.terminal-font-size` holds `"14"`
- **THEN** the resolved size is 13

### Requirement: Settings exposes the size as a segmented control

The Settings screen's `terminal` section SHALL contain a labelled row
offering one segment per ladder step, using the same `.segmented` /
`.segment` markup and selection treatment as the density control:
selection marked by `--fw-semi` weight plus a 2px `--ochre-line`
underline, never by a colour fill alone.

Each segment SHALL meet the 40 × 40 CSS-pixel minimum under
`pointer: coarse` required by `docs/UX-GUIDELINES.md`, and below 900px
the row SHALL stack label-over-control with the segments sharing the
full row width, as every other `.setting-row` on the screen does.

Segment labels SHALL be the bare pixel numbers set in `--font-mono`
with `font-variant-numeric: tabular-nums`, per
`docs/DESIGN-SYSTEM.md`'s numerals rule.

Each segment SHALL expose its selected state programmatically via
`aria-pressed`, so selection is not conveyed by weight and underline
alone.

Every visible string on the row SHALL come from `shared/copy.ts` or from
the screen's existing typed `SETTINGS_COPY` constant. No string literal
SHALL appear in the template.

The terminal palette control SHALL remain in the same section with its
behaviour unchanged.

#### Scenario: Choosing a size

- **WHEN** the operator taps the `20` segment
- **THEN** that segment is marked selected, reports `aria-pressed="true"`,
  and the preference becomes 20

#### Scenario: At 390px

- **WHEN** the Settings screen is rendered at a 390px-wide viewport
- **THEN** every segment's bounding box is at least 40 × 40 CSS pixels
  and the page does not scroll horizontally

### Requirement: A size change applies to open terminals and refits their geometry

A terminal created after the preference is set SHALL be constructed with
the current size.

A terminal that is already open SHALL take the new size without a
reload: the pane detail view SHALL run an effect that assigns the new
size to the live `Terminal` and then refits it.

The refit SHALL go through the component's existing container-guarded
refit path, so that a detached or zero-sized container is skipped rather
than producing `NaN` rows.

After a size change the terminal's `cols` and `rows` SHALL be
recomputed for the new cell geometry: within a container of fixed pixel
size, a larger font SHALL yield strictly fewer columns and rows, and a
smaller font strictly more. Output, input and the prompt SHALL remain
visible and reachable — nothing SHALL be clipped by the
`overflow: hidden` container.

The existing `ResizeObserver` SHALL NOT be relied on for this: it
observes the container, whose box does not change when only the cell
inside it does.

No `pane.resize` or other wire request SHALL be sent as a result of a
font-size change; refitting is a client-side concern, as it already is
for window resize (CONTRACT-TIER2.md § 6).

#### Scenario: Resizing an open terminal

- **WHEN** a terminal is open at 12px in a fixed-size container and the
  operator selects 20px
- **THEN** the terminal renders at 20px and its `cols` and `rows` are
  both strictly smaller than they were at 12px

#### Scenario: Returning to the previous size

- **WHEN** the operator selects 12px again
- **THEN** the terminal's `cols` and `rows` return to their 12px values

#### Scenario: A newly opened terminal

- **WHEN** the operator has selected 17px and then opens a card's
  terminal
- **THEN** that terminal is constructed at 17px

#### Scenario: No wire traffic

- **WHEN** the operator changes the terminal font size while a pane is
  open and subscribed
- **THEN** no `pane.resize` request is sent to the bridge
