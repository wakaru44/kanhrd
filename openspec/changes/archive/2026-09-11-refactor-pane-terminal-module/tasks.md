## 1. Extract the module

- [x] 1.1 Add `apps/web/src/app/pane-detail/pane-terminal.ts` with
      `PaneTerminal` as a plain class taking `{ ws, terminalTheme,
      terminalFontSize, toast }` — no `@Injectable`, no component, no DI.
- [x] 1.2 Move the xterm construction, the `FitAddon`, `term.open`, the
      `ResizeObserver` convergence loop, the four touch listeners with the
      sub-row carry and the `ws.events$` `pane.output` subscription into
      `attach(el)`; release all of it in `dispose()`.
- [x] 1.3 Move `loadForPane`, `teardownSubscription`, `handleOutputEvent`,
      `paint`, `handleInput`, `enqueueSend`, `fitToContainer` and
      `rowHeightPx` across unchanged in behaviour; guard in-flight
      responses against the pane `load()` recorded rather than the route.
- [x] 1.4 Expose `state()`, `revision()`, `lastPollAt()` and
      `failureReason()`; keep `hasContent`, `frameReceived`, `loading`,
      `failure` and `subscribed` private.
- [x] 1.5 Add the public `send(data)` on the same classified, ordered path
      as `onData`. Leave `key-mapping.ts` exactly as it is.
- [x] 1.6 React to the terminal theme and font-size signals without an
      injection context (`createWatch`, microtask-scheduled, destroyed in
      `dispose()`), keeping the assign-then-fit order. **Superseded by
      section 5** — the reaction moved to `PaneDetail`; `PaneTerminal`
      keeps only the assign-then-fit order, in `applyFontSize`.

## 2. Thin the component

- [x] 2.1 `PaneDetail` constructs one `PaneTerminal`, calls `attach()` from
      `ngAfterViewInit` and `dispose()` from `ngOnDestroy`.
- [x] 2.2 The load effect calls `terminal.load(host, id)`; `retry()`
      delegates; `revisionLabel`/`lastPollLabel`/`failureReason` read the
      terminal's signals.
- [x] 2.3 `viewState` becomes `hostInSight() ? terminal.state() :
      "unavailable"`. No terminal-shaped field is left on the component.
- [x] 2.4 Template, stylesheet and copy untouched.

## 3. Tests

- [x] 3.1 Add `pane-terminal.spec.ts`: plain unit tests, no TestBed, no
      fixture — fake `WsClient`, plain settings objects, a real `<div>`.
- [x] 3.2 Move the painter cases from `29acdc1` (append vs redraw, viewport
      anchoring, at-bottom-follows-tail, scrollback preservation), the
      stale-route guards on both legs including the late subscription that
      must be released, the `source: "recent"` match, the send ordering and
      classification cases, the fit convergence, the theme and font-size
      reapplication, and the whole state ladder including the
      loading-across-subscribe flash suppression.
- [x] 3.3 Delete the fixture-driven counterparts from
      `pane-detail.spec.ts`, leaving route-driven pane switching, the
      header and meta strip, the back paths, the template's rendering of
      each state and the `unavailable` overlay.

## 4. Verify

- [x] 4.1 `pnpm --filter @kanhrd/web test`
- [x] 4.2 `pnpm --filter @kanhrd/web typecheck`
- [x] 4.3 `pnpm --filter @kanhrd/web build`
- [x] 4.4 `pre-commit run --files <touched>`
- [x] 4.5 `openspec validate refactor-pane-terminal-module --strict`

## 5. Take the fallback: no framework-internal primitive

- [x] 5.1 Replace the two watches with plain `applyTheme(theme)` /
      `applyFontSize(px)` methods on `PaneTerminal`, both no-ops before
      `attach()` and after `dispose()`, `applyFontSize` keeping the
      assign-then-fit order and the `ResizeObserver`-cannot-cover-this
      reasoning.
- [x] 5.2 Delete the `watch()` helper, the `createWatch`/`Watch` imports
      and the two watch fields with their `dispose()` teardown. Nothing
      under `apps/web/src` imports `@angular/core/primitives/*`.
- [x] 5.3 Drive both from ordinary `effect()`s in `PaneDetail`, which has
      the injection context. `terminalTheme`/`terminalFontSize` stay in
      `PaneTerminalDeps`: `attach()` reads them for the `Terminal`
      constructor's initial values.
- [x] 5.4 Rewrite the class doc block so it documents the shape that
      exists — DI-free lifecycle owner, settings reaction owned by the
      component.
- [x] 5.5 Tests: theme/font-size cases call the methods directly (order
      and inverse cols/rows scaling assertions kept, plus a no-op case
      either side of the terminal's lifetime); `pane-detail.spec.ts`
      covers that a settings change still reaches the terminal through
      the component's effects.
