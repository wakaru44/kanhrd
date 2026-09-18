import remarkFrontmatter from 'remark-frontmatter';
import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';
import { unified } from 'unified';
import type { MdDocument } from './markdown-model';
import { normalize } from './markdown-normalize';

/**
 * The one place a markdown plugin is added.
 *
 * Parse only. There is no HTML-producing plugin and no stringify step: the
 * rendered view walks mdast through Angular templates and never touches an
 * HTML string. A pipeline that produces one is a pipeline that then has to
 * be defended with a sanitizer, and this view has nothing to defend.
 *
 * `remark-frontmatter` is here so that a `---` block at the head of a file is
 * recognised as frontmatter and dropped, rather than parsed as a setext
 * heading followed by a table's worth of stray text.
 */
const processor = unified()
  .use(remarkParse)
  .use(remarkFrontmatter, ['yaml', 'toml'])
  .use(remarkGfm)
  .freeze();

/**
 * How much of a file is parsed.
 *
 * The bridge caps `file.read` at 1 MiB, and parsing is synchronous on the
 * main thread: a megabyte of markdown measured several seconds in a headless
 * Chrome, which is a locked view, not a slow one. 64 KiB measures around a
 * tenth of that, and the largest markdown file in this repository is under
 * 50 KiB — so the cap is above everything the panel actually reads, and the
 * viewer says so on the rare file it is not.
 *
 * Moving the parse to a worker would remove the cap entirely. That is a
 * change of its own; this one keeps the main thread answering.
 */
export const RENDER_CAP_BYTES = 64 * 1024;

/**
 * Cut a file to the render cap at a line boundary, so the parser is never
 * handed half a fence or half a table row.
 */
export function capSource(text: string): { readonly text: string; readonly truncated: boolean } {
  if (text.length <= RENDER_CAP_BYTES) {
    return { text, truncated: false };
  }
  const head = text.slice(0, RENDER_CAP_BYTES);
  const cut = head.lastIndexOf('\n');
  return { text: cut === -1 ? head : head.slice(0, cut), truncated: true };
}

/** Parse a markdown file into the closed model the rendered view walks. */
export function parseMarkdown(source: string, dir: string): MdDocument {
  const { text, truncated } = capSource(source);
  return {
    blocks: normalize(processor.parse(text), dir),
    lines: countLines(text),
    totalLines: countLines(source),
    truncated,
  };
}

function countLines(text: string): number {
  if (text === '') {
    return 0;
  }
  let lines = 1;
  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) === 10) {
      lines++;
    }
  }
  return lines;
}
