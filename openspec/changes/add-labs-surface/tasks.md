# Tasks — add-labs-surface

## 1. The labs surface

- [ ] 1.1 One lazy `loadComponent` route per lab in `app.routes.ts`, before
      `**`; no `labs` index route.
- [ ] 1.2 A shared lab frame that marks the page as a lab and names it.
- [ ] 1.3 `labs/labs-boundary.spec.ts`: product code never imports `labs/`
      (route table's `loadComponent` excepted), with a planted-violation
      guard so the scan is not vacuous.
- [ ] 1.4 Router spec: the mock path resolves, bare `/labs` and an unknown
      `/labs/*` land on `NotFound`.
- [ ] 1.5 Lab components join the style-lint population.

## 2. The file-explorer mock

- [ ] 2.1 Fixture: modified `.ts` with a diff, a markdown file, an untracked
      directory, a nested tree.
- [ ] 2.2 Fake pane-detail: header, meta strip with the repo-name toggle,
      terminal stand-in box, the real key bar with no transport.
- [ ] 2.3 hbox (landscape) / vbox (portrait) with a draggable splitter.
- [ ] 2.4 Panel: goto bar / body (browser + viewer, side by side or behind a
      segmented control) / status line.
- [ ] 2.5 Question controls: key bar keep / auto-collapse; split remembered /
      fixed, current ratio shown.
- [ ] 2.6 Smoke spec: renders, lab marker visible, panel collapsed, toggle
      opens it, goto opens a file.

## 3. Gates

- [ ] 3.1 `openspec validate add-labs-surface --strict`
- [ ] 3.2 `make build`; initial bundle size before and after recorded.
- [ ] 3.3 typecheck web + bridge
- [ ] 3.4 unit tests web + bridge
- [ ] 3.5 `pre-commit run --all-files`
