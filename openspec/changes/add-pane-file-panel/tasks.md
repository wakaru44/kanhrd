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

## 4. Copy

- [x] 4.1 Every new string in `shared/copy.ts` under a `files` group.
- [x] 4.2 The same strings, byte-for-byte, in the approved-copy table in
      `docs/BRAND.md`.

## 5. Gates

- [x] 5.1 Unit specs: split maths, markdown blocks, the service's error
      mapping, the tree's lazy expansion, each panel state, the toggle's
      three conditions.
- [x] 5.2 Style lint: the new components join the population; no raw hex,
      px or rem.
- [x] 5.3 Labs boundary still clean — nothing product imports `labs/`.
- [x] 5.4 e2e against an isolated `kanhrd-test-*` session on port 5273.
- [x] 5.5 `make build`, typecheck, web + bridge unit tests,
      `pre-commit run --all-files`, `openspec validate --strict`.
