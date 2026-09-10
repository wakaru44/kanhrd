## 1. The preference service

- [x] 1.1 `apps/web/src/app/state/terminal-font-size.service.ts` — new
      file, modelled on `terminal-theme.service.ts`: export
      `TERMINAL_FONT_SIZES` (the ordered ladder `12, 13, 15, 17, 20`),
      `DEFAULT_TERMINAL_FONT_SIZE` (`13`) and the storage key
      `kanhrd.terminal-font-size`
- [x] 1.2 Same file — export a pure
      `loadTerminalFontSize(storage: Pick<Storage, "getItem">)` that
      never throws: absent / non-finite / out-of-range → default,
      in-range off-ladder → nearest step, ties downward
- [x] 1.3 Same file — `TerminalFontSizeService`: a `signal<number>`
      seeded from the pure read, a `set()` that only accepts ladder
      values, and an `effect` persisting to `localStorage`
- [x] 1.4 `apps/web/src/app/state/terminal-font-size.service.spec.ts` —
      cover the load path directly against a fake storage: absent,
      empty, `"large"`, `"NaN"`, `"Infinity"`, `"999"`, `"-13"`, `"16"`,
      `"14"`, and each exact ladder value round-tripping

## 2. The Settings control

- [x] 2.1 `settings.ts` — inject `TerminalFontSizeService`, expose the
      ladder and a `setTerminalFontSize()` handler
- [x] 2.2 `settings.ts` — add the row's strings to `SETTINGS_COPY`
      (label, and the clear-data preview row naming the terminal size);
      no literal reaches the template
- [x] 2.3 `settings.ts` — add the terminal font size to `clearPreview`
      so the confirm list stays a complete account
- [x] 2.4 `settings.html` — a `.setting-row` in the `terminal` section
      with one `.segment` per ladder value, `.active` on the current
      one, `aria-pressed` reflecting selection
- [x] 2.5 `settings.scss` — a `.segment-numeric` modifier applying
      `--font-mono`, `tabular-nums` and `min-width:
      var(--touch-target-min)` to these segments; every value a token,
      so the token lint gate stays clean
- [x] 2.6 `settings.spec.ts` — the row renders five segments; clicking
      one updates the service and marks it selected; `aria-pressed`
      tracks selection; the terminal palette `<select>` is unaffected

## 3. Applying it to terminals

- [x] 3.1 `pane-detail.ts` — inject `TerminalFontSizeService` and
      construct the `Terminal` with `fontSize: this.fontSize.size()`
      in place of the hard-coded `13`
- [x] 3.2 `pane-detail.ts` — add an effect beside the existing
      theme-swap effect that assigns `term.options.fontSize` and then
      calls `fitToContainer()`, documenting why the `ResizeObserver`
      cannot cover this case
- [x] 3.3 `pane-detail.spec.ts` — with the container pinned to a fixed
      pixel box, assert `term.cols` / `term.rows` strictly decrease when
      the size goes up the ladder and return when it goes back down
- [x] 3.4 `pane-detail.spec.ts` — a new terminal is constructed at the
      stored size; a size change sends no `pane.resize`; a palette
      change still swaps colours and does not disturb the size

## 4. Verification

- [x] 4.1 `openspec validate add-terminal-font-size --strict`
- [x] 4.2 `pnpm --filter @kanhrd/web test`
- [x] 4.3 `pnpm --filter @kanhrd/web build`
- [x] 4.4 `bash tools/lint-scss-tokens.sh`
- [x] 4.5 Drive the built bundle in headless chromium and record the
      real `cols`/`rows` at each ladder step, confirming the design.md
      column table against measured values
