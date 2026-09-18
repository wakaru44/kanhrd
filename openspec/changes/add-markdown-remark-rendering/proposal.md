## Why

The viewer's `rendered` mode is backed by a 73-line hand-rolled parser
(`markdown-blocks.ts`) ported from the lab. It knows headings, paragraphs,
flat lists, fenced code and inline `code` / `**strong**`. Everything else
degrades to a paragraph — so this repo's own `docs/DESIGN-SYSTEM.md` and
`docs/BRAND.md`, which are mostly tables, render as walls of pipe
characters, and a spec's links, blockquotes and task lists render as
literal punctuation.

The files the panel reads are written by agents, in GFM, against GitHub and
Forgejo. A parser that is not GFM is wrong about the corpus it exists for.

The one property the hand-rolled parser had that must survive is that it
renders to DATA and the template walks it. Nothing reaches `innerHTML`, so a
README an agent wrote thirty seconds ago — untrusted text in a checkout
nobody reviewed — has no path to injecting markup into the panel.

## What Changes

- **`unified` + `remark-parse` + `remark-gfm` + `remark-frontmatter`
  replace `markdown-blocks.ts`.** GFM is the target because GFM is what the
  corpus is: tables, task lists, strikethrough, autolinks, footnotes,
  blockquotes, nested lists, setext headings, hard breaks.
- **mdast is normalized to a closed render model, and Angular templates walk
  it.** No `innerHTML`, no `DomSanitizer`, no rehype, no HTML string. The
  normalizer is where the link allowlist and the image policy are applied,
  so the template has no decision left to get wrong.
- **Raw HTML in markdown is shown, never executed.** An `html` node renders
  as visible text in a monospace block; an ```html fence is a code fence.
- **Link schemes are allowlisted.** `http`, `https` and `mailto` become
  anchors; an external one opens in a new tab with
  `rel="noopener noreferrer"`. Everything else — `javascript:`, `data:`,
  `vbscript:`, any unknown scheme — renders as inert text.
- **Relative in-repo links navigate inside the panel.** A spec linking to
  another spec is the common case here; the href resolves against the open
  file's directory and opens it in the panel. No URL change, no new route.
- **Remote images are not fetched.** A remote `<img>` would tell that server
  the operator opened the file. Both remote and local images render as a
  labelled placeholder with the URL visible.
- **Frontmatter is recognised and dropped**, not rendered as a stray table.
- **A registration seam for new renderers.** A fence with a given info
  string, or a normalized node kind, routes to a registered component
  through a multi-provider. Adding mermaid or SVG later is a `provide…`
  call, not surgery on the renderer's switch.
- **The parser is lazily loaded.** `@defer` on the markdown view puts
  `unified` and the remark stack in a chunk that is fetched the first time a
  markdown file is rendered, and never on the board.

## Not done

- **Mermaid and SVG rendering.** The seam is built and proven by a test;
  neither renderer is written. That is the next change.
- **Parsing off the main thread.** Parsing is synchronous, so a 64 KiB cap is
  what keeps a 1 MiB file from locking the view. A worker would remove the
  cap; it is a change of its own.
- **Fetching local image bytes.** The bridge has no method that returns
  binary file content, and `file.read` answers `binary: true` with a size
  and nothing else. A local image therefore cannot be displayed without a
  bridge change, which is out of this change's scope.
- **Syntax highlighting inside fences**, still.
- **Heading anchors and in-document `#` links.** No ids are emitted, so an
  in-document anchor would go nowhere; it renders as inert text.
- **Math, directives, footnote back-references, or any other remark plugin.**
  The pipeline is now the place to add one.

## Impact

- `apps/web/src/app/pane-detail/markdown/**` — new: the pipeline, the render
  model, the renderer component, the registry.
- `apps/web/src/app/pane-detail/markdown-blocks.ts` — deleted.
- `apps/web/src/app/pane-detail/file-view.{ts,html,scss}` — `rendered` defers
  to the new component; the `rendered` styles move with it.
- `apps/web/src/app/pane-detail/file-panel.ts` — opens a path a relative link
  names.
- `apps/web/src/app/shared/copy.ts` + `docs/BRAND.md` — the placeholder and
  cap strings.
- `apps/web/package.json` — `unified`, `remark-parse`, `remark-gfm`,
  `remark-frontmatter`, `@types/mdast`.
- No change to `apps/bridge/**` or `packages/schema/**`. No wire change.
