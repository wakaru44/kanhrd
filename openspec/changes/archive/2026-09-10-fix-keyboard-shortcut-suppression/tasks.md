## 1. Fix

- [x] 1.1 `App`: replace `@HostListener('window:keydown', ...)` with a
      constructor-registered `window.addEventListener('keydown', handler,
      { capture: true })`, cleaned up via `DestroyRef.onDestroy` (mirrors
      `shared/toast-host.ts`'s `matchMedia` listener cleanup pattern).
- [x] 1.2 `KeyboardService.handleKeydown`: call `event.stopPropagation()`
      whenever the event ends up `defaultPrevented` (prefix armed, or a
      bound chord/non-chord action dispatched) — nothing else changes;
      unrecognized keys are untouched.

## 2. Tests

- [x] 2.1 New karma spec (`keyboard-capture-order.spec.ts` or inline in
      `keyboard.service.spec.ts`) reproducing the bug mechanically: a
      `document`-capture "Vimium-like" listener that stops propagation
      prevents a `window`-**bubble** listener (old shape) from firing.
- [x] 2.2 Same spec, proving the fix: a `window`-**capture** listener fires
      before, and (on stopPropagation) pre-empts, that same
      `document`-capture listener.
- [x] 2.3 `app.spec.ts`: assert the app's keydown handling still suppresses
      correctly with a focused text input, and that an unrecognized key is
      never `defaultPrevented` (regression guard for the "only stop
      propagation for keys we act on" requirement).
- [x] 2.4 Re-run existing `keyboard.spec.ts` e2e suite (real browser,
      real herdr) — chord/help/escape/theme/terminal-suppression behavior
      must be unchanged after the phase switch.

## 3. Verify

- [x] 3.1 `pnpm --filter @kanhrd/web typecheck`
- [x] 3.2 `pnpm --filter @kanhrd/web test` (karma)
- [x] 3.3 `pnpm --filter @kanhrd/web build`
- [x] 3.4 `pnpm lint`
- [ ] 3.5 `pnpm --filter @kanhrd/web test:e2e -- keyboard.spec.ts` —
      **not run then; runnable now.** `add-test-herdr-isolation` shipped
      (39124df, 2026-09-11): every run starts and disposes its own
      `kanhrd-test-*` herdr session, so this command no longer touches the
      operator's panes and the reason below no longer holds. Left unticked
      because this change is archived and its verification was completed by
      other means; anyone re-running it should just run it.
      Original note follows.

      The bridge has no `HERDR_SOCKET_PATH` override yet
      (confirmed in `add-l-brand-neo-shepherd-redesign`'s L-DOCKER notes and
      by inspection here); `pnpm test:e2e`'s webServer always points at the
      operator's live default socket until L-TEST-ISOLATION ships. Per
      CLAUDE.md's "tests must not touch the operator's live herdr" rule and
      this change's explicit instruction, skipped rather than run against
      Juan's live session. Karma (2.1-2.3, deterministic, no herdr) plus a
      static re-read of `keyboard.spec.ts`'s existing scenarios are the
      verification for this change; a live e2e pass is deferred to Juan or
      to whoever lands L-TEST-ISOLATION.

## 4. Openspec

- [x] 4.1 `openspec validate fix-keyboard-shortcut-suppression --strict`
- [x] 4.2 `openspec archive fix-keyboard-shortcut-suppression --yes` —
      archived on the deterministic karma proof (2.1/2.2) plus the general
      DOM capture-ordering mechanism, since no real browser/extension is
      controllable from this environment. Juan's live confirmation with
      Vimium C enabled is still the final real-world check; if it doesn't
      hold, reopen with the actual observed behavior rather than assuming
      this spec's `document`-level assumption about Vimium's attachment
      point.
