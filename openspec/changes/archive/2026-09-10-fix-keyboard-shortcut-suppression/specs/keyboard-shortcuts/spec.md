## ADDED Requirements

### Requirement: Prefix and bound action keys win over page-level capture-phase interception
The SPA SHALL attach its global keydown handling in the **capture phase**
at `window` (the highest node in the document tree), not the bubble phase,
so that the prefix keystroke and any bound action key it recognizes are
seen before a page-level script or browser extension's own capture-phase
listener attached at `document` or a descendant node can consume it. When
the handler recognizes and acts on a key (arms the prefix, or dispatches a
bound chord/non-chord action) it SHALL call both `preventDefault()` and
`stopPropagation()` on that event. When it does not recognize a key, it
SHALL call neither, leaving the event completely untouched for the page,
the focused element, or an extension to handle normally.

#### Scenario: The prefix wins over a capture-phase extension listener that binds the same key
- **WHEN** a browser extension (e.g. one binding `Ctrl+B` to a scroll
  command) has installed a `document`-level (or lower) capture-phase
  keydown listener that calls `stopPropagation()` on a matching key
- **AND** the user presses the configured prefix (default `Ctrl+B`) with no
  input focused
- **THEN** the SPA's `window`-level capture-phase listener still arms the
  prefix chord, because capture-phase dispatch runs `window` before
  `document` regardless of which listener was registered first

#### Scenario: Unrecognized keys are left completely alone
- **WHEN** the user presses a key that is neither the prefix, an armed
  chord's bound action key, nor a bare `?`/`Escape`
- **THEN** the SPA calls neither `preventDefault()` nor `stopPropagation()`
  on that keydown, so it still reaches the focused element, the page, and
  any browser extension unmodified

#### Scenario: A focused terminal is unaffected by the capture-phase change
- **WHEN** a pane-detail terminal (xterm.js) has focus and the user presses
  the prefix
- **THEN** the SPA's capture-phase handler recognizes the focused input via
  `isTextInputFocused` and returns without calling `preventDefault()` or
  `stopPropagation()`, so xterm.js's own listener on the terminal element
  still receives the raw keystroke exactly as before this change
