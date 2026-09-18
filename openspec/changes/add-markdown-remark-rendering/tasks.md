# Tasks — add-markdown-remark-rendering

## 1. Pipeline

- [x] 1.1 Add `unified`, `remark-parse`, `remark-gfm`, `remark-frontmatter`
      and `@types/mdast` to `apps/web`.
- [x] 1.2 `markdown/markdown-pipeline.ts`: the `unified` processor, built
      once. `remark-frontmatter` for `yaml` and `toml`. Parse only — no
      `remark-rehype`, no stringify, no `vfile` reporting.
- [x] 1.3 The 64 KiB cut, at a line boundary, before parse; report the line
      count rendered.

## 2. Render model

- [x] 2.1 `markdown/markdown-model.ts`: the closed block and phrasing types
      the template walks. Nothing in it is an HTML string.
- [x] 2.2 `markdown/markdown-normalize.ts`: mdast → render model.
      `definition` nodes resolve `linkReference` / `imageReference`;
      frontmatter nodes drop; unknown node kinds degrade to their text
      rather than disappearing.
- [x] 2.3 Link policy in the normalizer: scheme allowlist over a
      whitespace- and control-stripped probe; `http`/`https` external with
      `target` + `rel`; no scheme → checkout path resolved against the open
      file's directory, rejected if it escapes the root; everything else
      inert, with the destination shown.
- [x] 2.4 Image policy in the normalizer: never an `img`; `remote` vs
      `local` placeholder, alt and destination visible.
- [x] 2.5 Raw `html` nodes, block and inline, become text.

## 3. Renderer

- [x] 3.1 `markdown/markdown-view.ts|html|scss`: recursive block and
      phrasing templates. Tables, blockquotes, task lists, footnotes,
      nested lists. Design-system tokens only — no raw hex, px or rem.
- [x] 3.2 `markdown/markdown-renderers.ts`: the registry — an injection
      token, a `provideMarkdownRenderer()` multi-provider, and lookup by
      fence info string or node kind. The view routes through
      `NgComponentOutlet`; an unregistered fence is a code block.
- [x] 3.3 `file-view.html`: `@defer` the markdown view inside the
      `rendered` branch, with the existing `reading…` copy as placeholder.
      Move the `.rendered` styles out of `file-view.scss`.
- [x] 3.4 Delete `markdown-blocks.ts` and its template branches.

## 4. Panel

- [x] 4.1 `FileView` gains a `pathSelect` output; `FilePanel` opens and
      reveals the path, reusing the goto path's probe behaviour.
- [x] 4.2 Copy: the two image placeholders and the truncation note, in
      `shared/copy.ts` and `docs/BRAND.md`'s table.

## 5. Gates

- [x] 5.1 Unit: GFM coverage (tables with alignment, nested + task lists,
      footnotes, strikethrough, autolinks, setext headings, hard breaks,
      frontmatter dropped).
- [x] 5.2 Unit: the security rules — script tag as text, `onerror` img as
      text, `html` fence as code, `javascript:` / `data:` / `vbscript:` /
      embedded-whitespace scheme inert, external `rel` and `target`,
      relative link resolution and escape rejection, images never fetched.
- [x] 5.3 Unit: no `innerHTML` / `bypassSecurityTrust` in the markdown
      sources or `file-view.html`.
- [x] 5.4 Unit: a fence kind registered from outside renders through its
      component, with the renderer's own sources untouched.
- [x] 5.5 Unit: the 64 KiB cut, and a timing readout for a 5000-line file.
- [x] 5.6 e2e: a markdown file with tables, links and an image renders in
      the panel against the isolated bridge.
- [x] 5.7 `make build` — the parser is in a lazy chunk; report initial
      bundle before and after, and the chunk's size. No budget silenced.
- [x] 5.8 `openspec validate --strict`, typecheck, `pnpm -C apps/web test`,
      `pnpm -C apps/web test:e2e`, `pre-commit run --all-files`.
