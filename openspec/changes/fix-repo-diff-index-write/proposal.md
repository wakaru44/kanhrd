## Why

`add-repo-file-reads` promises that no file method writes anything, "including
git's own index and lock files". `repo.diff` breaks that promise on the
operator's own checkout, while their agents are working in it.

Porcelain `git diff` ends by refreshing the index's stat cache and writing
`.git/index` whenever a path's stat no longer matches but its content still
does — a tracked file saved without an edit is exactly that case. The
behaviour is `diff.autoRefreshIndex`, on by default, and it is **not** covered
by `--no-optional-locks` or `GIT_OPTIONAL_LOCKS=0`: git never consults them
there. The bridge applies both on every invocation and still writes.

Measured through `RepoFileReader`: `repo.status` 0/40, `repo.diff` 4/40,
`repo.tree` 0/40, `file.read` 0/40. `repo.diff` is the only writer, and
`reader.test.ts > repo.status > does not rewrite the index` fails with it
(9 of 20 runs locally).

## What Changes

- **`repo.diff` runs the `diff-index` plumbing** for the two tracked-path
  calls (`--name-status` and the patch). `git diff <tree>` is documented as a
  wrapper over `diff-index`; the output is byte-identical, and the plumbing
  has no refresh step, so the write is removed rather than redirected.
- **A stat-only difference resolves from the patch, not from a write.**
  Dropping the porcelain means `diff-index` reports a tracked file saved
  without an edit as `modified`; the patch for it is empty, which is the
  honest answer that the porcelain bought by writing. `repo.diff` reports
  `unchanged` with an empty `diff`, as it did before. Wire shapes are
  unchanged.
- **The untracked path is untouched.** It uses `git diff --no-index`, which
  compares two paths with no repository index in play at all.
- **The de-flaked test names the culprit.** One assertion across three methods
  becomes one named case per method, on a fixture that springs the trap every
  run: the tracked file's mtime is set forward rather than rewritten, which
  puts it outside git's racy-timestamp window. Against the old code the suite
  fails 12 of 12 runs, naming `repo.diff`; it passed roughly one run in two
  before.

## Impact

- `apps/bridge/src/files/reader.ts`, `apps/bridge/src/files/git.ts`,
  `apps/bridge/src/files/reader.test.ts`.
- No wire, schema or SPA change. `packages/schema` untouched.
- `openspec/specs/repo-file-reads/spec.md`: the read-only requirement now
  states that disabling optional locks is not sufficient on its own, and the
  diff requirement states the stat-only case.

## Alternatives considered

- **`GIT_INDEX_FILE=<copy of .git/index>`** on the diff calls, so the refresh
  lands on a throwaway copy. It works (0/30 measured), but it keeps the write
  and buys a per-request index copy, a temp file to place, clean up and race
  on, and a fail-closed path for when the copy cannot be made. The plumbing
  removes the write instead of catching it, at no runtime cost.
- **`-c diff.autorefreshindex=false`** on the porcelain. It stops the write,
  but gives the same `modified`-with-empty-patch answer as the plumbing while
  keeping a porcelain command in a read path — the plumbing says what it is.
