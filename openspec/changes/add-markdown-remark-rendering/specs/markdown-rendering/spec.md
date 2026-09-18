## ADDED Requirements

### Requirement: The rendered view parses GFM through a remark pipeline

The viewer's `rendered` mode SHALL parse markdown with a `unified` pipeline
built from `remark-parse`, `remark-gfm` and `remark-frontmatter`, and SHALL
NOT carry a second, hand-rolled markdown parser. The pipeline SHALL be the
single place a plugin is added.

The view SHALL render, as their own structures: ATX and setext headings of
every level, paragraphs, hard breaks, thematic breaks, blockquotes, bullet
and ordered lists nested to any depth, task-list checkboxes, fenced and
indented code, tables with per-column alignment, footnote definitions and
references, and the inline forms `emphasis`, `strong`, `delete`,
`inlineCode`, links and autolinks.

`rendered` SHALL remain offered for markdown files only; no other type
gains the mode.

#### Scenario: A table renders as a table

- **WHEN** the operator opens `docs/DESIGN-SYSTEM.md` in `rendered`
- **THEN** its GFM tables render as tables with header cells and per-column
  alignment, not as paragraphs of pipe characters

#### Scenario: A nested task list renders as nested lists

- **WHEN** a file contains a bullet list whose items contain `- [ ]` and
  `- [x]` sub-items
- **THEN** the sub-list renders nested inside its parent item, each item
  carrying a disabled checkbox in the state the source gave it

### Requirement: Nothing in the rendered view reaches innerHTML

The rendered view SHALL be produced by Angular templates walking a parsed
data structure. No part of the pipeline SHALL serialise markdown to an HTML
string, and no binding in the rendered view SHALL be `[innerHTML]`,
`[outerHTML]`, `bypassSecurityTrust*`, or any other API that inserts markup
from file content. A file the panel renders is untrusted text.

#### Scenario: The template is the only renderer

- **WHEN** the rendered view's sources are searched for `innerHTML` or
  `bypassSecurityTrust`
- **THEN** there is no occurrence, and a unit test asserts this over the
  markdown sources

### Requirement: Raw HTML in a markdown file is shown, never executed

An HTML construct in a markdown file SHALL render as visible text, whether
it arrives as a block `html` node, an inline `html` node, or the body of a
fence whose info string is `html`. The rendered view SHALL NOT create an
element, run a script, or load a resource on account of it.

#### Scenario: A script tag is text

- **WHEN** a markdown file contains `<script>alert(1)</script>` on its own
  line
- **THEN** the rendered view shows that text and no `script` element exists
  in the view

#### Scenario: An event handler attribute is text

- **WHEN** a markdown file contains `<img src=x onerror="alert(1)">`
- **THEN** the rendered view shows that text and no `img` element exists in
  the view

#### Scenario: An html fence is code

- **WHEN** a markdown file contains a fence whose info string is `html`
- **THEN** its body renders as a code block

### Requirement: Link destinations are allowlisted by scheme

A link destination SHALL become an anchor only when it carries the scheme
`http:`, `https:` or `mailto:`, or carries no scheme at all. The scheme
SHALL be determined after removing whitespace and C0 control characters from
the destination, so a destination that hides its scheme with embedded
whitespace is judged on what it resolves to.

Any other destination — `javascript:`, `data:`, `vbscript:`, `file:`, or an
unknown scheme — SHALL render as inert text, and SHALL show the rejected
destination beside the link's own text rather than hiding it.

An `http:` or `https:` anchor SHALL carry `target="_blank"` and
`rel="noopener noreferrer"`.

#### Scenario: A javascript URL is not an anchor

- **WHEN** a markdown file contains `[click](javascript:alert(1))`
- **THEN** no anchor is rendered for it, the link text is shown as text, and
  the destination is shown beside it

#### Scenario: A javascript URL with embedded whitespace is not an anchor

- **WHEN** a markdown file contains a link whose destination is
  `java\nscript:alert(1)`
- **THEN** no anchor is rendered for it

#### Scenario: An external link opens in a new tab

- **WHEN** a markdown file links to `https://example.com`
- **THEN** the anchor carries `target="_blank"` and
  `rel="noopener noreferrer"`

### Requirement: A relative link opens the file it names, in the panel

A link destination with no scheme SHALL be treated as a path in the
checkout, resolved against the directory of the file being rendered, with
any `?query` and `#fragment` discarded and any `.` and `..` segments
resolved. Activating it SHALL open that path in the panel — the same
behaviour as selecting the file in the tree — and SHALL NOT navigate the
browser, change the URL, or leave the pane.

A resolved path that escapes the checkout root SHALL render as inert text.
A destination that is only a `#fragment` SHALL render as inert text, because
the rendered view emits no heading ids for one to reach.

#### Scenario: A spec links to a sibling spec

- **WHEN** the operator is rendering `docs/BRAND.md` and activates a link to
  `DESIGN-SYSTEM.md`
- **THEN** the panel opens `docs/DESIGN-SYSTEM.md`, the tree reveals it, and
  the browser's URL is unchanged

#### Scenario: A link climbs out of the checkout

- **WHEN** a file at the checkout root links to `../../etc/passwd`
- **THEN** no anchor is rendered for it

### Requirement: Images are not fetched

The rendered view SHALL NOT create an `img` element, a `background-image`,
or any other construct that fetches an image named by a markdown file. An
image SHALL render as a labelled placeholder showing its alt text, if any,
and its destination.

A remote destination and a checkout-relative one SHALL say which they are:
a remote image is not loaded because doing so would tell that server the
operator opened the file, and a checkout-relative one cannot be loaded
because the bridge has no method that returns a file's bytes.

#### Scenario: A remote image is a placeholder

- **WHEN** a markdown file references `https://tracker.example/pixel.png`
- **THEN** no request is made for it, and the view shows a placeholder
  naming the URL

### Requirement: Frontmatter is recognised and not rendered

A YAML or TOML frontmatter block at the head of a file SHALL be parsed as
frontmatter and SHALL NOT appear in the rendered body — not as a table, not
as a thematic break, not as a paragraph of its own text.

#### Scenario: A file opening with `---`

- **WHEN** a markdown file opens with a `---` delimited YAML block
- **THEN** the rendered body starts at the content after it

### Requirement: A new node renderer is added by registration

The rendered view SHALL route a node to a dedicated component by lookup in a
registry, keyed by a fence's info string or by a rendered node's kind. A
registry entry SHALL be contributed by a provider, and adding one SHALL
require no edit to the renderer component, its template, or the pipeline.
A fence whose info string has no entry SHALL render as a code block.

#### Scenario: A fence kind is registered

- **WHEN** a component is registered for the info string `mermaid` and a
  file contains a ```mermaid fence
- **THEN** that component renders in place of the code block, receiving the
  fence's body, and the renderer's own sources are unchanged

### Requirement: The markdown parser is not in the initial bundle

The remark pipeline SHALL be reachable only through a lazily loaded chunk,
fetched the first time a markdown file is rendered. No module in the initial
bundle SHALL import `unified`, `remark-parse`, `remark-gfm` or
`remark-frontmatter`, directly or transitively. Opening the board, a pane,
or a non-markdown file SHALL NOT fetch it.

#### Scenario: The board does not pay for the parser

- **WHEN** the production build is inspected
- **THEN** no initial chunk contains the remark pipeline, and it is present
  in a lazy chunk

### Requirement: A file too long to render is truncated and says so

The rendered view SHALL parse at most 64 KiB of a file, cut at a line
boundary. When it cuts, it SHALL state how many lines it rendered and point
at `source` for the rest, in the panel and not in a hover.

#### Scenario: A file over the cap

- **WHEN** the operator renders a 5000-line markdown file larger than
  64 KiB
- **THEN** the view renders the leading lines and states how many it
  rendered and where the rest is
