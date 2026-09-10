## Why

Juan reported the prefix chord never arms in his real browser: a
`document.body` keydown probe (`console.log('key', e.ctrlKey, e.key)`) shows
`key true Control` (the modifier keydown itself) but **never** `key true b`
— the actual `Ctrl+B` combo keydown is missing entirely. Other `Ctrl`
combos (`Ctrl+C`) and some `Meta` combos fire normally. He has Vimium C
installed.

Root cause, confirmed by DOM event-order reasoning and a deterministic
karma reproduction (no real extension needed — see Verification):

1. `App.onKeydown` is wired via `@HostListener('window:keydown', ...)`
   (`apps/web/src/app/app.ts`). Angular's `HostListener` calls
   `addEventListener` with no options, i.e. **bubble phase**
   (`capture: false`), on `window`.
2. Browser extension content scripts like Vimium/Vimium C install their own
   keydown interception at `document` (or lower) in the **capture phase**,
   which is how they intercept keys before a page's own bubble-phase
   handlers, and how they implement "don't trigger commands while a text
   field has focus" without needing page cooperation. Vimium's default
   bindings include `Ctrl+B` / `Ctrl+F` for "scroll a full page up/down" —
   the classic `less`/`vi` pager convention it deliberately mirrors. When
   Vimium's capture-phase listener matches a bound command it calls
   `stopPropagation()` (and normally `preventDefault()`), which halts the
   event's propagation entirely: it never reaches the target element, never
   bubbles, and **never reaches a bubble-phase listener on `window`**,
   because `window`'s bubble phase is the very last stop in dispatch, long
   after capture already ended.
3. `Ctrl+C` isn't a Vimium binding, so nothing capture-phase intercepts it
   and it reaches our bubble-phase handler untouched — exactly the working
   vs. broken split Juan observed.

Capture-phase dispatch on listeners attached to *different* nodes always
follows DOM ancestry (`window` capture fires before `document` capture,
unconditionally, regardless of which extension or script registered its
listener first) — so a page-side listener on `window` with
`{ capture: true }` that calls `stopPropagation()` when it recognizes a
bound key **will** run before, and therefore pre-empt, a `document`-level
(or lower) capture-phase listener, including Vimium's. This is exactly
Juan's clue: "a page-side listener with `{ capture: true }` at document
level MAY beat it" — the fix generalizes that to `window`, the highest node
in the tree we can attach to, and only stops propagation for keys we
actually act on (never a blanket steal).

## What Changes

- `App`'s keydown listener moves from `@HostListener('window:keydown', ...)`
  (implicit bubble phase) to an explicit `window.addEventListener('keydown',
  ..., { capture: true })`, registered in the constructor and torn down via
  `DestroyRef` (mirrors the existing `toast-host.ts` cleanup pattern — no
  new dependency).
- `KeyboardService.handleKeydown` calls `event.stopPropagation()` whenever
  it ends up calling `event.preventDefault()` for a key it actually
  recognized (arming the prefix, or dispatching a bound chord/non-chord
  action). Keys we don't recognize are left completely alone — no
  `preventDefault`, no `stopPropagation` — so they still reach the terminal,
  the page, or an extension normally.
- No change to suppression semantics: `isTextInputFocused` (including
  xterm.js's `.xterm-helper-textarea`) still bails out before touching the
  event at all, so a focused terminal is unaffected by the phase change —
  its own listener is on the target element itself (the "at target" phase),
  which our capture-phase check runs before but never interferes with
  unless it decides to act (and it won't, because the input-focus check
  fires first).
- No wire/schema change. Client-only, UI-presentation fix.

## Verification

Reproduced deterministically in karma **without** installing a real
extension, by simulating "a capture-phase listener on `document` that
`stopPropagation()`s a matched key" (Vimium's mechanism) against both the
old (`window`, bubble) and new (`window`, capture) attachment points:

- **Repro of the bug** (fails before the fix, i.e. proves the bug is real
  and mechanical, not speculative): a `document`-level capture listener
  that stops propagation on `Ctrl+B` prevents a `window`-level **bubble**
  listener (the old `@HostListener` shape) from ever seeing the event.
- **Proof of the fix**: the same `document`-level capture "Vimium" listener
  does **not** prevent a `window`-level **capture** listener from seeing
  the event first (capture phase runs ancestor-to-descendant by DOM
  position, not registration order, across different nodes) — and if that
  `window`-capture listener itself calls `stopPropagation()` on a match,
  the simulated Vimium listener never fires at all, matching real Vimium
  being pre-empted.

This does not prove Vimium C specifically behaves this way (its source
wasn't inspected — no network access in this environment); it proves the
general DOM-ordering mechanism our fix relies on is real and testable, and
that our current code is vulnerable to exactly the class of interception
Juan described. Juan should confirm live in his browser with Vimium C
enabled as the final check.

## Escape hatch (if a browser extension still wins)

Not expected to be needed given the capture-phase fix, but documented per
the brief: `KeyboardService.prefix` already mirrors herdr's own configured
prefix (`L-KEYBINDS-MIRROR`) and is separately user-rebindable in
Settings > Keyboard. If a future extension intercepts even a
`window`-capture listener (e.g. one also attached at `window` and
registered earlier — capture order among listeners on the *same* node is
registration order, which a page can't control against a
pre-existing content script), rebinding kanhrd's prefix to something that
extension doesn't bind (`Ctrl+Space`, `Ctrl+A`) — and, if using herdr's own
prefix mirroring, changing herdr's configured prefix to match — makes both
tools cooperate again. No code change needed for this path; it's a
Settings action already shipped.

## Impact

- Affected code: `apps/web/src/app/app.ts`,
  `apps/web/src/app/state/keyboard.service.ts`.
- Affected specs: `keyboard-shortcuts` (clarifies that the prefix/action-key
  interception SHALL win over a page-level capture-phase listener attached
  at `document` or lower, for keys kanhrd actually recognizes).
- No `packages/schema/**` change, no wire-contract change.
