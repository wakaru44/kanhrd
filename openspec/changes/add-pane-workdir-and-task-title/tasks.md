## 1. Subfeature 1 — schema and bridge (workdir)

- [ ] 1.1 `packages/schema/src/herdr.ts` — add `cwd?: string | null` and
      `foreground_cwd?: string | null` to `HerdrPaneInfo`, with a comment
      citing herdr's `PaneInfo` and the difference between the two
- [ ] 1.2 `packages/schema/src/herdr.ts` — add `cwd?: string` to the
      bridge-projected `Pane`, documented as the resolved workdir
- [ ] 1.3 `apps/bridge/src/herdr/project.ts` — resolve
      `pane.cwd ?? pane.foreground_cwd` in `projectPane` and set `cwd`
      only when it is a non-empty string
- [ ] 1.4 `apps/bridge/src/herdr/project.test.ts` — cases: both present,
      `cwd: null` with `foreground_cwd` set, both null/absent, empty
      string

## 2. Subfeature 1 — web rendering (workdir)

- [ ] 2.1 `apps/web/src/app/util/` — add a pure `workdirLabel(path)`
      helper returning the last two segments with a `…/` prefix when
      segments were dropped, plus its unit test
- [ ] 2.2 `apps/web/src/app/board/card.ts` — expose a `workdir` computed
      (label + full path), absent when the pane has no `cwd`
- [ ] 2.3 `apps/web/src/app/board/card.html` — render the location line
      only when `workdir` exists, with the full path in `title`
- [ ] 2.4 `apps/web/src/app/board/card.scss` — mono/caption/`--ink-mute`
      tokens, single line, ellipsis, no page-level horizontal overflow
- [ ] 2.5 `apps/web/src/app/pane-detail/` — render the full absolute path
      in the metadata strip; omit the row when absent
- [ ] 2.6 `apps/web/src/app/board/card.spec.ts` — location line present
      with `cwd`, absent without it, truncated form correct

## 3. Subfeature 2 — task-title store

- [ ] 3.1 `apps/web/src/app/state/task-title.service.ts` — signals-based
      service over `localStorage['kanhrd.task-titles']`, shape
      `{ host: { pane_id: title } }`, modelled on `theme.service.ts`
- [ ] 3.2 Trim, cap at 80 chars, delete on empty, drop pens whose map
      empties
- [ ] 3.3 Guard every read and write; treat throw or corrupt JSON as
      "no titles"
- [ ] 3.4 Prune titles for a pen only when that pen is connected and its
      pane list has been received
- [ ] 3.5 `task-title.service.spec.ts` — set, clear, cap, corrupt JSON,
      throwing storage, prune-on-connected, no-prune-on-disconnected

## 4. Subfeature 2 — rename UI

- [ ] 4.1 `apps/web/src/app/shared/copy.ts` — add the six
      `card.taskTitle*` keys with the strings fixed in the spec
- [ ] 4.2 Rename modal component — single text input seeded with the
      current title, save / clear / cancel, `--font-display` modal title,
      `Escape` cancels, `Enter` submits
- [ ] 4.3 `apps/web/src/app/board/card.html` — add the rename item to the
      overflow menu; keep it outside the card's `<a>`
- [ ] 4.4 Pane detail — visible rename control in the header
- [ ] 4.5 Return focus to the originating overflow trigger on modal close
- [ ] 4.6 `--fw-medium` `--font-ui` title slot: render the task title
      when set, move herdr's name to the meta row in `--ink-mute`
- [ ] 4.7 Close-confirmation copy names the task title when one is set

## 5. Verification

- [ ] 5.1 Touch targets: overflow trigger and every menu item ≥ 40x40
      under `pointer: coarse` at 390px
- [ ] 5.2 Mobile check at 390px: card location line truncates, page
      horizontal scroll width does not exceed viewport width
- [ ] 5.3 `pnpm -r test` and the lint/format gate pass
- [ ] 5.4 Confirm no herdr write is issued by any rename path (no
      `pane.rename` / `pane.report_metadata` call added anywhere)
