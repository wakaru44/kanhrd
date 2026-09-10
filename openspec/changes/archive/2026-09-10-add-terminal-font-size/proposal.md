## Why

Terminal type is a hard-coded `13` in `pane-detail.ts`:

```ts
const term = new Terminal({
  theme: this.terminalTheme.theme(),
  fontFamily: XTERM_FONT_FAMILY,
  fontSize: 13,
  ...
});
```

Settings already lets the operator choose the terminal *palette* but not
the terminal *size*. That is the wrong half of the pair to expose. A
palette is taste; size is legibility, and legibility is not uniform
across the people and screens this app runs on. 13px is comfortable on a
27" display at arm's length and small on a phone held at reading
distance; it is also small for anyone who needs larger type at all.

Nothing in the app can change it today — not a zoom control, not a
setting, not a URL. Browser page zoom is the only lever, and it scales
the whole shell (rail, header, cards) rather than the one surface the
operator is actually reading.

The gap is narrow and the shape of the fix is already established in
this codebase: `TerminalThemeService` is an app-wide, signal-backed,
`kanhrd.`-prefixed preference that a `pane-detail` effect pushes into
the live `Terminal`. Terminal size is the same preference with one extra
obligation — a size change alters cell geometry, so the terminal must be
**refitted**, which a colour change never needs.

## What Changes

- **A new app-wide preference.** `state/terminal-font-size.service.ts`,
  modelled on `terminal-theme.service.ts`: a `signal<number>`, persisted
  to `localStorage['kanhrd.terminal-font-size']` by an `effect`, with a
  pure `loadTerminalFontSize(storage)` read that is unit-testable
  without DI.
- **A fixed ladder of sizes, not a free number.** The allowed values are
  the brand type ladder's pixel values from `--fs-caption` (the
  documented floor) to `--fs-h3`: **12, 13, 15, 17, 20**. Default `13`,
  which is both today's hard-coded value and `--fs-small`.
- **A Settings control.** A five-segment segmented control in the
  existing `terminal` section, using the same `.segmented` / `.segment`
  markup and selection treatment (weight + 2px `--ochre-line` underline)
  as the density control directly above it.
- **Live application plus refit.** `pane-detail` reads the size when it
  constructs its `Terminal`, and an `effect` — the sibling of the
  existing theme-swap effect — writes `term.options.fontSize` and then
  refits, so an already-open terminal changes size and recomputes its
  `cols`/`rows` without a reload.
- **Tolerant load.** Absent, non-numeric, corrupt or out-of-range stored
  values fall back to the default; an in-range value that is not on the
  ladder snaps to the nearest ladder step, so a stored value survives a
  future change to the ladder the way `LEGACY_NAMES` lets a stored
  palette name survive a rename.

Explicitly **not** in scope:

- Per-pane sizing. See `design.md`; the palette precedent and
  `docs/DESIGN-SYSTEM.md` § Terminal both say app-wide, and the same
  reasoning holds.
- A `pane.resize` wire call. Per CONTRACT-TIER2.md § 6 the bridge never
  accepts one; refitting stays a purely client-side cosmetic concern, as
  it already is for window resize.
- Changing the terminal palette, the `--fs-*` tokens, or any UI type
  outside the terminal surface.

## Impact

- **Affected specs:** new capability `terminal-font-size`.
- **Affected code:**
  - `apps/web/src/app/state/terminal-font-size.service.ts` (new)
  - `apps/web/src/app/state/terminal-font-size.service.spec.ts` (new)
  - `apps/web/src/app/settings/settings.{ts,html,scss}`
  - `apps/web/src/app/settings/settings.spec.ts`
  - `apps/web/src/app/pane-detail/pane-detail.ts`
  - `apps/web/src/app/pane-detail/pane-detail.spec.ts`
- **Risk:** low, and contained to the client. The preference is
  client-local; no bridge, pen or wire surface changes. The one real
  failure mode is a refit that computes bad geometry — guarded by the
  existing zero-box check in `fitToContainer()` and asserted directly in
  the tests, which measure `cols`/`rows` rather than spying on `fit`.
- **Migration:** none required. Users with no stored key get `13`, which
  is exactly what they render at today, so the change is invisible until
  they choose otherwise. The key is `kanhrd.`-prefixed, so the existing
  Settings → Data → "clear local data" sweep covers it with no change to
  `SettingsService.clearLocalData`.
