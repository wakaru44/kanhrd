## Why

The bridge already reads a pane's checkout (`add-repo-file-reads`), and the
layout is already settled on the device (`/labs/file-explorer/mock1`). What
is missing is the product surface: the operator still has to type into the
agent's terminal to find out what the agent did, which costs the agent
context and risks disturbing a running TUI.

A read-only panel beside the terminal answers "what did it touch" without
touching the session. Reading is not an action on the flock, so it needs no
confirmation and no lifecycle vocabulary — it is watching, which
`docs/UX-GUIDELINES.md` treats as first-class.

The mock answered its two device questions. This change carries those
answers over as behaviour and drops the controls that posed them.

## What Changes

- **A file panel in pane detail**, collapsed by default, opened from one
  visible toggle in the meta strip. Real components under
  `apps/web/src/app/pane-detail/`; the mock is ported, never imported.
- **The mock's rulings become behaviour, with no toggle left behind**:
  - the key bar **stays** while the panel has focus (`keep`);
  - a dragged split is **remembered** per axis, per this browser;
  - the default split is terminal `0.6` on `hbox`, `0.5` on `vbox`;
  - below **560px of panel width**, browser and viewer stop sitting side by
    side and a segmented control picks one;
  - the panel is **collapsed by default**.
- **Real data forces reliability states the fixture never had.** Every one
  of these is a stated fact in the panel, never a blank box or a swallowed
  error: no repository, files not local to the bridge (every remote host), a
  bridge with no file methods at all, a binary file, a file over the
  bridge's cap, a truncated tree / status / diff, and a path that stopped
  existing while the panel was open.
- **Status is polled, not pushed**, at the cadence the bridge advertises,
  and only while the panel is open.
- **`WsClient` rejects with a typed error** carrying the bridge's `code`, so
  a caller can tell `files_not_local` from `not_found` without parsing a
  message. The message string is unchanged.

## Not done

- Any write path. No create, rename, stage, discard or edit, in this change
  or a later one until a separate proposal argues for it. The bridge has no
  write method and this change adds none.
- Any bridge or schema change. The four methods and the `repoFiles`
  capability are used exactly as archived.
- Search across the checkout, blame, history, or more than one file at once.
- Deleting `labs/file-explorer/mock1`. A later change removes it.
- Syntax highlighting. `source` is plain monospace with line numbers.

## Impact

- `apps/web/src/app/pane-detail/**` — the panel, the tree, the viewer, the
  split maths, the markdown blocks; `pane-detail.{ts,html,scss}` gains the
  toggle and the split.
- `apps/web/src/app/state/repo-files.service.ts` — new; the only caller of
  the four methods.
- `apps/web/src/app/state/ws-client.ts` — `BridgeError` with `code`.
- `apps/web/src/app/shared/copy.ts` + `docs/BRAND.md` — the panel's copy.
- `apps/web/e2e/**` — the panel's states against an isolated bridge.
- No change to `apps/bridge/**`, `packages/schema/**`, or `labs/**`.
