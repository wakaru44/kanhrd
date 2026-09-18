import type { MdBlock, MdPhrasing } from './markdown-model';
import { RENDER_CAP_BYTES, capSource, parseMarkdown } from './markdown-pipeline';

/**
 * What the pipeline makes of GFM — the dialect this repo and its agents
 * actually write. The old hand-rolled parser degraded everything it did not
 * know to a paragraph, which is why this repo's own docs rendered as walls
 * of pipe characters; each case below is one of those.
 */
function blocks(source: string, dir = 'docs'): readonly MdBlock[] {
  return parseMarkdown(source, dir).blocks;
}

function text(parts: readonly MdPhrasing[]): string {
  return parts
    .map((part) => {
      if ('text' in part) return part.text;
      if ('children' in part) return text(part.children);
      if (part.kind === 'image') return part.alt;
      return '';
    })
    .join('');
}

describe('pane-detail/markdown pipeline', () => {
  it('reads a GFM table as a table, with per-column alignment', () => {
    const [block] = blocks(
      ['| key | note |', '| :-- | ---: |', '| `a` | one  |', '| `b` | two  |'].join('\n')
    );
    expect(block.kind).toBe('table');
    if (block.kind !== 'table') return;
    expect(block.align).toEqual(['left', 'right']);
    expect(block.head.map(text)).toEqual(['key', 'note']);
    expect(block.rows.map((row) => row.map(text))).toEqual([
      ['a', 'one'],
      ['b', 'two'],
    ]);
  });

  it('nests a list inside a list item rather than flattening it', () => {
    const [block] = blocks('- outer\n  - inner\n    1. deep');
    expect(block.kind).toBe('list');
    if (block.kind !== 'list') return;
    const inner = block.items[0].children[1];
    expect(inner.kind).toBe('list');
    if (inner.kind !== 'list') return;
    expect(inner.ordered).toBeFalse();
    const deep = inner.items[0].children[1];
    expect(deep.kind === 'list' && deep.ordered).toBeTrue();
  });

  it('reads task-list checkboxes, and leaves a plain item unchecked-by-absence', () => {
    const [block] = blocks('- [ ] todo\n- [x] done\n');
    expect(block.kind === 'list' && block.items.map((i) => i.checked)).toEqual([false, true]);
    const [plain] = blocks('- plain');
    expect(plain.kind === 'list' && plain.items[0].checked).toBeNull();
  });

  it('reads strikethrough, emphasis, strong and inline code', () => {
    const [block] = blocks('~~gone~~ *soft* **hard** `code`');
    expect(block.kind).toBe('paragraph');
    if (block.kind !== 'paragraph') return;
    expect(block.children.map((p) => p.kind)).toEqual([
      'delete',
      'text',
      'emphasis',
      'text',
      'strong',
      'text',
      'code',
    ]);
  });

  it('reads an autolink as a link', () => {
    const [block] = blocks('see https://example.com for more');
    expect(block.kind).toBe('paragraph');
    if (block.kind !== 'paragraph') return;
    const link = block.children.find((p) => p.kind === 'link');
    expect(link?.kind === 'link' && link.link.to).toBe('external');
  });

  it('reads a blockquote as blocks, not as text with angle brackets', () => {
    const [block] = blocks('> a quote\n>\n> - and a list');
    expect(block.kind).toBe('blockquote');
    if (block.kind !== 'blockquote') return;
    expect(block.children.map((b) => b.kind)).toEqual(['paragraph', 'list']);
  });

  it('reads setext headings and every ATX level', () => {
    const levels = blocks('Title\n=====\n\nSub\n---\n\n#### four\n\n###### six').map((b) =>
      b.kind === 'heading' ? b.depth : b.kind
    );
    expect(levels).toEqual([1, 2, 4, 6]);
  });

  it('reads a hard break as a break, not as two spaces', () => {
    const [block] = blocks('one  \ntwo');
    expect(block.kind === 'paragraph' && block.children.some((p) => p.kind === 'break')).toBeTrue();
  });

  it('collects footnotes at the end, numbered in reference order', () => {
    const parsed = blocks('see[^b] and[^a]\n\n[^a]: first\n[^b]: second\n');
    const last = parsed[parsed.length - 1];
    expect(last.kind).toBe('footnotes');
    if (last.kind !== 'footnotes') return;
    expect(last.items.map((i) => i.label)).toEqual(['b', 'a']);
    expect(last.items.map((i) => i.index)).toEqual([1, 2]);
    const body = parsed[0];
    const refs =
      body.kind === 'paragraph' ? body.children.filter((p) => p.kind === 'footnoteRef') : [];
    expect(refs.map((r) => (r.kind === 'footnoteRef' ? r.index : 0))).toEqual([1, 2]);
  });

  it('resolves a reference link against its definition', () => {
    const [block] = blocks('[the spec][s]\n\n[s]: ./spec.md\n');
    expect(block.kind).toBe('paragraph');
    if (block.kind !== 'paragraph') return;
    const [link] = block.children;
    expect(link.kind === 'link' && link.link).toEqual({ to: 'path', path: 'docs/spec.md' });
  });

  it('drops YAML frontmatter instead of rendering it as a heading and a table', () => {
    const parsed = blocks('---\ntitle: x\ntags: [a, b]\n---\n\n# real\n');
    expect(parsed.map((b) => b.kind)).toEqual(['heading']);
  });

  it('drops TOML frontmatter too', () => {
    const parsed = blocks('+++\ntitle = "x"\n+++\n\nbody\n');
    expect(parsed.map((b) => b.kind)).toEqual(['paragraph']);
  });

  it('keeps a fence`s info string, lowercased, for the renderer registry', () => {
    const [block] = blocks('```Mermaid\ngraph TD;\n```');
    expect(block).toEqual({ kind: 'code', lang: 'mermaid', text: 'graph TD;' });
  });

  it('reads an indented block as code', () => {
    const [block] = blocks('    const a = 1;\n');
    expect(block.kind).toBe('code');
  });

  describe('the render cap', () => {
    it('leaves a file under the cap whole', () => {
      const source = '# a\n\nbody\n';
      const parsed = parseMarkdown(source, '');
      expect(parsed.truncated).toBeFalse();
      expect(parsed.lines).toBe(parsed.totalLines);
    });

    it('cuts at a line boundary, so the parser never sees half a fence', () => {
      const line = `${'x'.repeat(99)}\n`;
      const source = line.repeat(Math.ceil((RENDER_CAP_BYTES * 1.5) / line.length));
      const cut = capSource(source);
      expect(cut.truncated).toBeTrue();
      expect(cut.text.length).toBeLessThanOrEqual(RENDER_CAP_BYTES);
      expect(source.startsWith(cut.text)).toBeTrue();
      expect(source[cut.text.length]).toBe('\n');
    });

    it('says how many lines it rendered, and how many the file has', () => {
      const line = `${'x'.repeat(99)}\n`;
      const source = line.repeat(Math.ceil((RENDER_CAP_BYTES * 1.5) / line.length));
      const parsed = parseMarkdown(source, '');
      expect(parsed.truncated).toBeTrue();
      expect(parsed.lines).toBeLessThan(parsed.totalLines);
      expect(parsed.lines).toBeGreaterThan(0);
    });

    /**
     * The cap is what keeps a 1 MiB file from locking the view, so this
     * measures what the cap actually costs and prints it. The assertion is a
     * pathology guard, not a budget: a browser under load varies by a factor
     * of three, and a number tight enough to be a budget would be flaky. The
     * printed measurement is the thing to read.
     */
    it('parses its own worst case without locking the view', () => {
      const unit = [
        '# heading',
        '',
        'a paragraph with `code`, **strong**, ~~gone~~ and [a link](./x.md).',
        '',
        '| a | b |',
        '| - | - |',
        '| 1 | 2 |',
        '',
        '- one',
        '  - two',
        '',
        '```ts',
        'const a = 1;',
        '```',
        '',
      ].join('\n');
      // Past the cap on purpose: what `parseMarkdown` then parses IS the
      // worst case a reader can reach, so this measures the worst case and
      // not a document that happens to be 5000 lines long.
      let source = unit;
      while (source.split('\n').length < 5000 || source.length < RENDER_CAP_BYTES) {
        source += unit;
      }
      expect(source.split('\n').length).toBeGreaterThan(5000);

      parseMarkdown(source, 'docs'); // warm
      const started = performance.now();
      const parsed = parseMarkdown(source, 'docs');
      const elapsed = performance.now() - started;

      // eslint-disable-next-line no-console
      console.info(
        `[markdown] ${source.split('\n').length} lines / ${source.length} bytes ` +
          `→ ${parsed.lines} lines / ${RENDER_CAP_BYTES} byte cap in ${elapsed.toFixed(1)}ms`
      );
      expect(elapsed).toBeLessThan(3000);
    });
  });
});
