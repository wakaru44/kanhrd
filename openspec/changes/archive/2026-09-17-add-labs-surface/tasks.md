# Tasks — add-labs-surface

## 1. The labs surface

- [x] 1.1 One lazy `loadComponent` route per lab in `app.routes.ts`, before
      `**`; no `labs` index route.
- [x] 1.2 A shared lab frame that marks the page as a lab and names it.
- [x] 1.3 `labs/labs-boundary.spec.ts`: product code never imports `labs/`
      (route table's `loadComponent` excepted), with a planted-violation
      guard so the scan is not vacuous.
- [x] 1.4 Router spec: the mock path resolves, bare `/labs` and an unknown
      `/labs/*` land on `NotFound`.
- [x] 1.5 Lab components join the style-lint population.

## 2. The file-explorer mock

- [x] 2.1 Fixture: modified `.ts` with a diff, a markdown file, an untracked
      directory, a nested tree.
- [x] 2.2 Fake pane-detail: header, meta strip with the repo-name toggle,
      terminal stand-in box, the real key bar with no transport.
- [x] 2.3 hbox (landscape) / vbox (portrait) with a draggable splitter.
- [x] 2.4 Panel: goto bar / body (browser + viewer, side by side or behind a
      segmented control) / status line.
- [x] 2.5 Question controls: key bar keep / auto-collapse; split remembered /
      fixed, current ratio shown.
- [x] 2.6 Smoke spec: renders, lab marker visible, panel collapsed, toggle
      opens it, goto opens a file.

## 3. Gates

- [x] 3.1 `openspec validate add-labs-surface --strict`
- [x] 3.2 `make build`; initial bundle size before and after recorded.
- [x] 3.3 typecheck web + bridge
- [x] 3.4 unit tests web + bridge
- [x] 3.5 `pre-commit run --all-files`
