# Design — terminal font size

The backlog item deliberately leaves five things open: the range, the
step, the control, the default and migration, and the scope. This
document settles all five, and each answer is derived from something
already true in this repository rather than picked.

## 1. The measurement everything else rests on

`apps/web/public/fonts/jetbrains-mono-variable.woff2` ships with the app
(committed `db183db`), so the terminal renders in real JetBrains Mono
rather than a platform fallback, and cell geometry is therefore stable
and predictable rather than machine-dependent.

JetBrains Mono's advance width is **0.600em**. xterm.js lays a monospace
grid out from that advance, so for a terminal of pixel width `W`:

```
cols ≈ floor(W / (0.600 × fontSize))
```

That single relation is what makes a range derivable instead of
arbitrary: every candidate size can be turned into a column count on a
real viewport, and column count is the thing that actually breaks.

The two viewports that bound the decision are the ones
`docs/UX-GUIDELINES.md` already names: **390 × 844** (the `mobile`
Playwright project's iPhone 13) and a desktop viewport, taken here at
1280px wide.

The table below is **measured, not estimated**: real
`@xterm/xterm@6.0.0` + `@xterm/addon-fit@0.11.0` in headless chromium,
with the repo's own `jetbrains-mono-variable.woff2` face loaded, one
terminal fitted into a 358px-wide box and one into a 1200px-wide box.
Measured advance was **0.6001em at every size**, confirming the 0.600em
figure the arithmetic above rests on.

| size            | advance px | cols @ 358px | cols @ 1200px |
| --------------- | ---------- | ------------ | ------------- |
| 11              | 6.601      | 52           | 179           |
| 12 `--fs-caption` | 7.201    | 47           | 164           |
| 13 `--fs-small` | 7.801      | 44           | 152           |
| 15 `--fs-body`  | 9.002      | 38           | 131           |
| 17 `--fs-lead`  | 10.202     | 33           | 116           |
| 20 `--fs-h3`    | 12.002     | 28           | 98            |
| 24              | 14.402     | 23           | 82            |
| 26 `--fs-h2`    | 15.603     | 22           | **76**        |
| 28              | 16.803     | 20           | 70            |

Two thresholds fall out of that table:

- **80 columns** is the classic terminal width, and the width most TUI
  output is authored against. On a 1200px-wide desktop terminal it
  survives up to 24px (82 cols) and is gone by 26px (76 cols).
- **No size keeps 80 columns on a phone.** Even today's 13px gives 44.
  A phone terminal is already a reflowed, wrapped surface, so the phone
  bound is not "keep 80" but "stay wide enough to read a wrapped shell
  line", which in practice is around 30 columns — reached at 17-20px.

## 2. Range and step

**Decision: the allowed sizes are `12, 13, 15, 17, 20`, in pixels.**

These are not new numbers. They are the pixel values of the brand type
ladder in `docs/DESIGN-SYSTEM.md` § Typography, at the 16px root:

| token          | rem       | px  |
| -------------- | --------- | --- |
| `--fs-caption` | 0.75      | 12  |
| `--fs-small`   | 0.8125    | 13  |
| `--fs-body`    | 0.9375    | 15  |
| `--fs-lead`    | 1.0625    | 17  |
| `--fs-h3`      | 1.25      | 20  |

Why this set and not a slider:

- **The floor is documented, not chosen.** `docs/DESIGN-SYSTEM.md` says
  in as many words: *"Nothing below `--fs-caption` may be introduced to
  make a dense layout fit."* 12px is therefore the smallest legible size
  this product is allowed to render text at, terminal included. It is
  also comfortably above the point where JetBrains Mono's stems start to
  alias on a 1× display.
- **The ceiling is where the column count stops being a terminal.** 20px
  (`--fs-h3`) still leaves 98 columns on a 1280px desktop — above the
  80-column threshold with headroom — and 28 columns on a 390px phone,
  which is at the practical wrapped-shell floor. The next ladder rung
  up, `--fs-h2` at 26px, drops desktop to 76 columns (under 80) and the
  phone to 22, so the ladder itself says where to stop.
- **The steps are already spaced for perception.** The brand ladder is
  tighter at the bottom (12 → 13 is 8%) and wider at the top (17 → 20 is
  18%), which is exactly the spacing a size ramp wants: a 1px step is a
  meaningful change at 12px and imperceptible at 20px. A uniform 1px
  step from 12 to 20 would give nine indistinguishable options; a
  uniform 2px step would skip 13, the size everyone is already using.
- **Reusing the ladder means the terminal never drifts from the shell.**
  Every size the terminal can take is a size some UI text already takes,
  so the two surfaces stay in the same typographic system.

**Rejected: a numeric `<input type="number">`.** The poll-override input
directly below is the closest precedent, and it is the wrong one — it
exists because a millisecond interval is genuinely continuous. Font size
is not: it is a small set of legible steps, and a free number invites
`11.5`, `7`, `200` and every out-of-range value the load path then has
to defend against. Constraining at the control is cheaper than
validating after it. A number input also costs a virtual numeric
keyboard on a phone for what should be one tap.

**Rejected: `+` / `−` steppers.** Two 40×40 targets plus a readout is
more chrome than five segments, hides the range (the operator cannot see
that 20 is the top until they hit it), and gives no direct way to jump
from 12 to 20.

## 3. The control

**Decision: a five-segment segmented control in the existing `terminal`
section of Settings, reusing `.segmented` / `.segment` unchanged.**

The density control two rows above is the same shape — a short,
ordered, mutually exclusive set — and it is already the screen's
established pattern for one: selection shown by `--fw-semi` plus a 2px
`--ochre-line` underline, never a colour fill; `min-height:
var(--touch-target-min)`; `flex: 1 1 0` below 900px so segments share
the row's full width.

At 390px the row is ~358px wide, so five equal segments are ~71px each
— comfortably past the 40×40 `pointer: coarse` minimum from
`docs/UX-GUIDELINES.md`, with room for a two-digit label. Above 900px
the segments size to their content — floored at `--touch-target-min`,
see below — and sit right-aligned next to the label, exactly as density
does.

Labels are the bare numbers (`12`, `13`, `15`, `17`, `20`) in
`--font-mono` with `font-variant-numeric: tabular-nums`, per
`docs/DESIGN-SYSTEM.md`'s numerals rule — the row's label supplies the
noun, so repeating "px" five times would be noise.

The one SCSS addition is a `.segment-numeric` modifier: the mono face,
tabular numerals, and `min-width: var(--touch-target-min)`. The
min-width is not decoration — measured, a two-digit mono label at
`--fs-small` plus `--sp-3` of padding lands at ~39.6px on a wide
viewport, just under the coarse-pointer floor, so the floor is stated
rather than left to the text metrics. Every value is a token; no raw
hex, px or rem is introduced, so the design-token lint gate has nothing
to catch.

Each segment carries `aria-pressed`, so selection is exposed to assistive
technology and not conveyed by weight and underline alone. (The density
segments predate this and do not; they are outside this change's
allowed paths, and the omission is flagged in the report rather than
fixed here.)

## 4. Default and migration

**Decision: the default is `13`. There is nothing to migrate *from*, so
the migration policy is a load policy.**

13 is the value every terminal renders at today and is `--fs-small` on
the ladder, so an existing user who never opens Settings sees no change
at all. The preference is invisible until chosen.

`loadTerminalFontSize(storage)` resolves a stored string in this order:

1. **Absent or unparseable** (`null`, `""`, `"large"`, `"NaN"`,
   `"Infinity"`, a JSON blob) → default `13`.
2. **A finite number outside `[12, 20]`** (`0`, `-13`, `999`) → default
   `13`. Clamping to the nearest bound was considered and rejected: a
   value that far out is corruption or a hand-edit, not an intent worth
   honouring, and the acceptance criteria for this change call for a
   fallback to the default.
3. **A finite in-range number that is not on the ladder** (`14`, `16`,
   `18.5`) → the **nearest ladder step**, ties resolving downward
   (`14 → 13`, `16 → 15`, `18.5 → 17`).

Rule 3 is the direct analogue of `LEGACY_NAMES` in
`terminal-theme.service.ts`: it exists so a deliberate choice survives a
change to the option set. If a future lane re-spaces the ladder, every
stored size still lands on the closest thing the new ladder offers
instead of everyone silently snapping back to 13. It costs two lines.

The read never throws: it is a `Number()` parse guarded by
`Number.isFinite`, with no `JSON.parse` to fail on, so a corrupt value
is a fallback rather than an exception in a service constructed at app
bootstrap.

The key is `kanhrd.terminal-font-size`. The `kanhrd.` prefix is not
cosmetic: `SettingsService.clearLocalData()` sweeps every
`kanhrd.`-prefixed key, so "clear local data" covers the new preference
with no change to that method. The Data section's confirm-preview list
gains one row naming the terminal size, so the "cannot be undone"
warning stays backed by a complete list rather than an incomplete one.

## 5. Scope: app-wide, not per-pane

**Decision: one size for every terminal in the app.**

`docs/DESIGN-SYSTEM.md` § Terminal states the position for the palette:
*"Terminal palettes are app-wide, not per-pane… That model is
preserved; no per-pane theming is introduced."* The reasoning it rests
on — cards are told apart by title, pen seal and status, never by
terminal appearance — transfers to size unchanged, and size has two
further arguments against per-pane that colour does not:

- **Size is an accessibility preference, not a per-object property.** An
  operator who needs 17px needs it in every pane. Per-pane sizing would
  mean setting it again for every card they open.
- **Per-pane state needs a durable key and there isn't one.** Pane ids
  are herdr's and are not stable across a herdr restart, so a per-pane
  map in `localStorage` would accumulate orphaned entries keyed by ids
  that no longer exist, and "clear local data" would be the only way to
  prune them.

A single signal read by every `Terminal` instance needs no keying, no
pruning and no per-pane UI.

## 6. How open terminals receive the change

Newly created terminals are trivial: `ngAfterViewInit` reads
`fontSize.size()` when it constructs the `Terminal`, exactly as it
already reads `terminalTheme.theme()`.

Open terminals go through an `effect` that is the deliberate sibling of
the existing theme-swap effect, with one addition:

```ts
effect(() => {
  const fontSize = this.fontSize.size();
  untracked(() => {
    if (this.term) {
      this.term.options.fontSize = fontSize;
      this.fitToContainer();
    }
  });
});
```

The `untracked` wrapper matches the theme effect's shape: the effect
depends on the preference signal and on nothing it touches inside.

**Why the refit is not optional, and why the `ResizeObserver` does not
cover it.** A colour change leaves cell geometry untouched — same
`cols`, same `rows`, the same grid repainted. A size change changes the
cell, so the same pixel box now holds a different number of cells, and
without a refit `cols`/`rows` keep their old values: the terminal either
renders into a fraction of its box (size down) or overflows a container
that is `overflow: hidden` and clips the prompt out of reach (size up).

The existing `ResizeObserver` cannot rescue this. It observes the
*container*, and the container's box does not change when the font
does — only the cell inside it does. No observer callback fires. The
refit has to be explicit, and it goes through `fitToContainer()` rather
than `fitAddon.fit()` so it inherits the zero-box guard that already
protects against a detached or zero-height container producing `NaN`
rows.

Ordering matters: the option is assigned first so that xterm has
re-measured its character cell before `fit()` divides the container box
by it. xterm re-measures synchronously on a `fontSize` option change, so
one statement after the other is sufficient; no `requestAnimationFrame`
or microtask hop is needed, and the tests assert the recomputed
`cols`/`rows` immediately after the change rather than after a tick,
which would pass either way.

No `pane.resize` is sent. Per CONTRACT-TIER2.md § 6 the bridge never
accepts one, so — as with window resize today — this is a purely
client-side cosmetic refit with no wire traffic.

## 7. How the refit is proven

The acceptance bar for this change is explicitly *"assert the
recomputation, not just that a function was called"*. Unit tests run
under Karma in real headless Chrome, so xterm measures real glyphs and
`Terminal.cols` / `Terminal.rows` are real numbers rather than jsdom
stubs.

The pane-detail test therefore gives the terminal container a fixed
pixel box, records `term.cols` / `term.rows` at the smallest ladder
step, sets the preference to the largest, and asserts that both counts
**decreased** — a bigger cell in a fixed box is strictly fewer cells,
which is an independent prediction about geometry rather than a
restatement of what `fit()` computes. Setting the size back asserts the
counts return. A `fit` spy would pass with a broken implementation; a
column count cannot.
