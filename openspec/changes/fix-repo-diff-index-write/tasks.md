## 1. Make the diff path a read

- [x] 1.1 Run the tracked `--name-status` call through `git diff-index`
      instead of `git diff`, with the tree-ish before `--`.
- [x] 1.2 Run the tracked patch call through `git diff-index --patch`.
- [x] 1.3 Resolve a stat-only difference from the patch: a `modified` change
      whose untruncated patch is empty is reported `unchanged`.
- [x] 1.4 Say in `RepoFileReader.diff` and in `git.ts`'s `GLOBAL_ARGS` doc
      why the porcelain is not used and what the lock flags do not cover.

## 2. De-flake the test without weakening it

- [x] 2.1 Replace the single three-method assertion with one named case per
      method under `a read never writes the repository`.
- [x] 2.2 Spring the trap deterministically: set the tracked file's mtime
      forward rather than rewriting it, so it sits outside git's racy window.
- [x] 2.3 Add the behaviour case: a tracked file saved without an edit is
      `unchanged` with an empty diff.
- [x] 2.4 Verify the suite fails on the old code and names `repo.diff`.

## 3. Correct the promise where it lives

- [x] 3.1 `openspec/specs/repo-file-reads/spec.md`: state that disabling
      optional locks does not cover every command, and add the per-method
      scenarios and the stat-only scenario.

## 4. Gates

- [x] 4.1 `openspec validate --strict` before and after.
- [x] 4.2 `reader.test.ts` 20 runs, pass count reported.
- [x] 4.3 bridge typecheck, `make build`, bridge unit + integration suites.
- [x] 4.4 `pre-commit run --all-files`.
