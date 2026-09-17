## Why

The operator wants to see what an agent DID — which files changed, what the
diff says, what a file now reads — without typing into the agent's terminal
and polluting its context. The board already resolves each pane's checkout
(`Pane.project.checkout_path`); nothing lets a browser look inside it.

This change builds the wire and bridge half of that read-only file panel.
The panel itself is another change.

## What Changes

- **Four new bridge methods**, all keyed by `pane_id` — the browser never
  names a checkout, only a pane, and the bridge resolves the checkout from
  the pane herdr reports right now:
  - `repo.status` — branch, HEAD, upstream ahead/behind and porcelain-v2
    entries for the pane's checkout. Polled by the client, like `pane.list`;
    no push channel.
  - `repo.tree` — one directory level, never a recursive walk.
  - `file.read` — one file, UTF-8 text or an explicit `binary: true`.
  - `repo.diff` — one path, working tree vs `HEAD`, with untracked files
    diffed against the empty file.
- **Read-only.** No method writes, creates, moves or deletes, and git is run
  with optional locks off, so `repo.status` does not even refresh the index.
- **Confinement.** Every `path` is checkout-relative and resolves inside the
  checkout's real path. Absolute paths, `..` segments and symlinks whose
  real target leaves the checkout are refused. `.git` is neither listed nor
  readable.
- **Caps.** Files over 1 MiB are refused with `file_too_large`; diffs are cut
  at 1 MiB with `truncated: true`; a directory listing stops at 2000 entries
  and status at 5000.
- **Local only.** The bridge reads with `fs`, so it can only serve a checkout
  on its own filesystem. A host reached over an SSH socket tunnel names
  paths on another machine, and a naive read would either fail confusingly
  or — worse — serve the laptop's file at the same path. The bridge grants
  files for a pane only when (a) the host is not configured `files: false`,
  (b) the pane's `cwd` exists locally and sits inside the checkout, and
  (c) `git rev-parse --show-toplevel` run locally in that `cwd` names the
  checkout. `Pane.project.files_local` reports the cheap half of that gate on
  every `pane.list`; the methods re-check the full gate on every call.
- **Capability probe.** `bridge.capabilities.repoFiles` is present (with the
  poll interval and caps) when the bridge implements the methods, and absent
  otherwise — the same omit-when-unsupported rule `hostKeybinds` follows.
- **No git library.** `git` is spawned with an argv array, never a shell,
  with `--literal-pathspecs`, `--no-ext-diff`, `--no-textconv` and
  `core.fsmonitor=false`. A missing `git` is `git_unavailable`; a checkout
  git does not recognise is `not_a_repository`.

## Not done

- The file panel UI, and any SPA change at all.
- Writes of any kind. There is no `file.write`, and none is reserved.
- Remote hosts. A tunnelled host gets `files_not_local`, not a proxy to the
  remote machine's filesystem.
- Proving machine identity. Where a tunnelled host's paths happen to exist
  locally too and git agrees they are a checkout, the gate cannot tell the
  machines apart; the operator sets `files: false` on that host.

## Impact

- `packages/schema/src/wire.ts` — four methods, their params/results, the
  `repoFiles` capability.
- `packages/schema/src/herdr.ts` — `Pane.project.files_local`.
- `apps/bridge/src/files/**` — new: gate, confinement, git runner, methods.
- `apps/bridge/src/config.ts` — per-host `files: false`.
- `apps/bridge/src/herdr/hosts.ts`, `project.ts`, `ws/dispatch.ts` — wiring.
- `docs/OPERATING.md` — the `files: false` host key and the local-only rule.
- `docs/THREAT-MODEL.md` — checkout contents as an asset.
