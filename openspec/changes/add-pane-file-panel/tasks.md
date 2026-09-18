# Tasks — add-pane-file-panel

## 1. Wire access

- [x] 1.1 `WsClient` rejects with a `BridgeError` carrying the bridge's
      `code`; the message string is unchanged.
- [x] 1.2 `state/repo-files.service.ts`: the only caller of `repo.status`,
      `repo.tree`, `file.read` and `repo.diff`. Each call returns a
      discriminated `ok` / `code` + `message` result — no throw reaches a
      component.
- [x] 1.3 The service exposes the host's `repoFiles` capability, and a
      `supported(host)` the toggle gates on.
- [x] 1.4 Status polling at `statusPollIntervalMs`, started and stopped by
      the panel, never running while collapsed.

## 2. The panel

- [x] 2.1 `pane-detail/file-panel.{ts,html,scss}` — goto bar, body, status
      line, and every reliability state.
- [x] 2.2 `pane-detail/file-tree.{ts,html,scss}` — one level per
      `repo.tree`, expansion kept, truncation stated, git letter + colour.
- [x] 2.3 `pane-detail/file-view.{ts,html,scss}` — `source` / `diff` /
      `rendered`; binary, too-large, not-found and truncated-diff states.
- [x] 2.4 `pane-detail/markdown-blocks.ts` — ported from the mock, rendered
      to data, never `innerHTML`.
- [x] 2.5 `pane-detail/file-panel-split.ts` — clamp, defaults, per-axis
      load/save, `SIDE_BY_SIDE_MIN_PX`; pure and unit-tested.

## 3. Pane detail

- [x] 3.1 One visible toggle in the meta strip, at the repo name's trailing
      edge; at the strip's end when the pane has no `project`; absent when
      the host advertises no `repoFiles`.
- [x] 3.2 Splitter between terminal and panel: pointer, keyboard, touch
      target, `separator` semantics, axis from orientation.
- [x] 3.3 The key bar keeps its state and its reserve while the panel has
      focus; no second reserve mechanism.
- [x] 3.4 Panel stops polling on collapse, destroy, `unavailable` and `gone`.

## 4. The tree bar

- [x] 4.1 A collapse control for the tree, at any width, persisting while
      collapsed; the viewer takes the whole body.
- [x] 4.2 A changed-only filter marked `LucideFileDiff`, with a count,
      rendered only while the tree is and never reset by collapsing.
- [x] 4.3 Filtered, a flat list from `repo.status` with whole paths and no
      `repo.tree` call; a directory row returns to the tree there.
- [x] 4.4 A clean repo with the filter on states it and offers the way out.
- [x] 4.5 `LucideFileDiff` added to `icons.ts`, its spec counts and the
      `docs/DESIGN-SYSTEM.md` icon table, with the rationale.

## 5. Copy

- [x] 5.1 Every new string in `shared/copy.ts` under a `files` group.
- [x] 5.2 The same strings, byte-for-byte, in the approved-copy table in
      `docs/BRAND.md`.

## 6. Gates

- [x] 6.1 Unit specs: split maths, markdown blocks, the service's error
      mapping, the tree's lazy expansion, each panel state, the toggle's
      three conditions.
- [x] 6.2 Style lint: the new components join the population; no raw hex,
      px or rem.
- [x] 6.3 Labs boundary still clean — nothing product imports `labs/`.
- [x] 6.4 e2e against an isolated `kanhrd-test-*` session on port 5273.
- [x] 6.5 `make build`, typecheck, web + bridge unit tests,
      `pre-commit run --all-files`, `openspec validate --strict`.
