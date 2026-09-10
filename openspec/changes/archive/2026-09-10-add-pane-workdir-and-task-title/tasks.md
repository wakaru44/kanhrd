## 1. Layer 1 — project herdr's pane label

- [x] 1.1 `packages/schema/src/herdr.ts` — add `label?: string` to the
      bridge-projected `Pane`, documented as herdr's user-authored pane
      name set by `pane.rename`
- [x] 1.2 `apps/bridge/src/herdr/project.ts` — forward
      `HerdrPaneInfo.label` in `projectPane`, only when non-empty
- [x] 1.3 `apps/bridge/src/herdr/project.test.ts` — label present, null,
      absent, empty string

## 2. Layer 1 — project git provenance

- [x] 2.1 `packages/schema/src/herdr.ts` — add
      `project?: { repo_name, checkout_path, is_linked_worktree }` to
      `Pane`; fix `HerdrWorkspaceDetail.tokens` to optional to match
      herdr's `required` list
- [x] 2.2 `apps/bridge/src/herdr/names.ts` — type `refresh()`'s
      `workspace.list` response as `HerdrWorkspaceDetail[]`; widen the
      cache value to `{ label, worktree? }`; keep `workspaceName()`
      behaviour identical
- [x] 2.3 `apps/bridge/src/herdr/names.ts` — add `workspaceWorktree(id)`;
      make `setWorkspace` preserve a stored `worktree` on a label-only
      update
- [x] 2.4 `apps/bridge/src/herdr/project.ts` — join `project` from the
      cache; absent when the workspace has no `worktree`
- [x] 2.5 `apps/bridge/src/herdr/names.test.ts` — worktree cached,
      absent, preserved across `workspace.renamed`, unknown id

## 3. Layer 1 — card and pane-detail rendering

- [x] 3.1 `apps/web/src/app/util/` — pure `pathTail(path)` helper (last
      two segments, `…/` prefix when truncated) plus its unit test
- [x] 3.2 `apps/web/src/app/board/card.ts` — title precedence
      `label ?? display_agent ?? agent ?? title ?? id prefix`; expose the
      secondary agent identity only when `label` won
- [x] 3.3 `apps/web/src/app/board/card.ts` — expose a `project` computed
      (repo name + path tail + full path), absent without `project`
- [x] 3.4 `apps/web/src/app/board/card.html` — render the project line
      only when present, full path in `title`; secondary identity row in
      the meta row
- [x] 3.5 `apps/web/src/app/board/card.scss` — `--font-mono`,
      `--fs-caption`, `--ink-mute`; single line, ellipsis, no page-level
      horizontal overflow; title stays `--font-ui` `--fw-medium`
- [x] 3.6 `apps/web/src/app/pane-detail/` — repo name and full checkout
      path in the metadata strip; omit both rows when absent
- [x] 3.7 `apps/web/src/app/board/card.spec.ts` — each title-precedence
      branch, project line present/absent, path-tail form

## 4. Layer 2 — the `pane.rename` round trip

- [x] 4.1 `packages/schema/src/herdr.ts` — add `HerdrPaneRenameParams`
      (`{ pane_id, label?: string | null }`, only `pane_id` required),
      citing herdr's `PaneRenameParams`
- [x] 4.2 `packages/schema/src/wire.ts` — `pane.rename` method, params
      `{ pane_id, label?: string | null }`, result `{ pane: Pane }`
- [x] 4.3 `packages/schema/src/wire.ts` — add `paneRename` to
      `BridgeCapabilities`, separate from `paneCreate` / `paneClose` /
      `paneMove`
- [x] 4.4 `apps/bridge/src/herdr/hosts.ts` — `paneRename()` via the
      existing per-pane write queue
- [x] 4.5 `apps/bridge/src/ws/dispatch.ts` — `pane.rename` case and the
      capability advertisement
- [x] 4.6 `apps/bridge/src/ws/dispatch.test.ts` — success, `label: null`
      clear, herdr error passthrough, capability gate

## 5. Layer 2 — push updates

- [x] 5.1 `packages/schema/src/herdr.ts` — model the `pane.updated`
      event (`EventData::PaneUpdated`, full `PaneInfo`) and add it to the
      subscribable event kinds
- [x] 5.2 `packages/schema/src/wire.ts` — `pane.updated` browser event
      payload carrying the projected `Pane`
- [x] 5.3 `apps/bridge/src/herdr/hosts.ts` — add `pane.updated` to
      `buildSubscriptionSpecs()` and handle it; confirm the spec set
      stays fixed (the subscription is global, no `pane_id`)
- [x] 5.4 `apps/web/src/app/state/panes.store.ts` — apply `pane.updated`
      to the card in place
- [x] 5.5 `apps/bridge/src/herdr/hosts.test.ts` — `pane.updated`
      subscribed and relayed; agent-status poll unchanged

## 6. Layer 2 — rename UI

- [x] 6.1 `apps/web/src/app/shared/copy.ts` — add the five
      `card.rename*` keys with the strings fixed in the spec
- [x] 6.2 Rename modal — single input seeded with the current `label`,
      save / clear / cancel, `--font-display` modal title, `Escape`
      cancels, `Enter` submits, empty-after-trim sends `label: null`
- [x] 6.3 `apps/web/src/app/board/card.html` — overflow-menu rename item,
      kept outside the card's `<a>`, gated on `paneRename`
- [x] 6.4 Pane detail — visible rename control in the header
- [x] 6.5 Return focus to the originating overflow trigger on close
- [x] 6.6 Failure path — reuse the existing `renameFailed` toast copy

## 7. Verification

- [x] 7.1 Touch targets: overflow trigger and every menu item ≥ 40x40
      under `pointer: coarse` at 390px
- [x] 7.2 Mobile check at 390px: project line truncates and the page's
      horizontal scroll width does not exceed the viewport
- [x] 7.3 Confirm no `pane.report_metadata` / `tokens` write exists on
      any rename path, and no `kanhrd.*` storage key was added
- [x] 7.4 `pnpm -r test` and the lint/format gate pass
