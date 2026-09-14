# Tasks — add-repo-file-reads

## 1. Wire

- [ ] 1.1 `wire.ts`: `repo.status`, `repo.tree`, `file.read`, `repo.diff`
      params and results; `BridgeCapabilities.repoFiles`.
- [ ] 1.2 `herdr.ts`: `Pane.project.files_local`.

## 2. Bridge

- [ ] 2.1 `files/confine.ts`: relative-only, no `..`, no `.git`, real-path
      containment including the nearest existing ancestor.
- [ ] 2.2 `files/git.ts`: argv-only `git` runner with locks off, output cap,
      `git_unavailable` / `not_a_repository`.
- [ ] 2.3 `files/gate.ts`: the local-only gate (cheap half for projection,
      full half per call).
- [ ] 2.4 `files/methods.ts`: status, tree, read, diff with the caps.
- [ ] 2.5 Config: per-host `files: false`.
- [ ] 2.6 Wire into `HostRuntime`, `projectPane` and `dispatch`.

## 3. Tests

- [ ] 3.1 Unit, temp git repo, no herdr: confinement (`..`, absolute,
      escaping symlink, inside symlink, `.git`), caps, binary, status,
      tree, diff (modified, untracked, deleted, unborn), not-a-repo,
      git-missing, read-only index.
- [ ] 3.2 Unit: wrong-machine gate — nonexistent remote paths, remote cwd
      under a local repo, `files: false`.
- [ ] 3.3 Dispatch unit tests for routing and error codes.
- [ ] 3.4 Integration against the run's own `kanhrd-test-*` session.

## 4. Docs

- [ ] 4.1 `docs/OPERATING.md`: `files: false` and the local-only rule.
