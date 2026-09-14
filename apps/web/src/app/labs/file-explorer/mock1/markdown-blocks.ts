/**
 * Just enough markdown for the mock's rendered view: headings, paragraphs,
 * bullet and numbered lists, fenced code, and inline `code` / **strong**.
 * It renders to data, not HTML, so the template never binds innerHTML.
 * Not a markdown implementation — the real panel picks one.
 */

export type Inline = { readonly kind: 'text' | 'code' | 'strong'; readonly text: string };

export type Block =
  | { readonly kind: 'heading'; readonly level: 1 | 2 | 3; readonly inline: readonly Inline[] }
  | { readonly kind: 'paragraph'; readonly inline: readonly Inline[] }
  | {
      readonly kind: 'list';
      readonly ordered: boolean;
      readonly items: readonly (readonly Inline[])[];
    }
  | { readonly kind: 'code'; readonly text: string };

export function parseInline(text: string): Inline[] {
  const out: Inline[] = [];
  const pattern = /`([^`]+)`|\*\*([^*]+)\*\*/g;
  let last = 0;
  for (const match of text.matchAll(pattern)) {
    if (match.index > last) out.push({ kind: 'text', text: text.slice(last, match.index) });
    out.push(
      match[1] !== undefined ? { kind: 'code', text: match[1] } : { kind: 'strong', text: match[2] }
    );
    last = match.index + match[0].length;
  }
  if (last < text.length) out.push({ kind: 'text', text: text.slice(last) });
  return out;
}

export function parseMarkdown(lines: readonly string[]): Block[] {
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === '') {
      i++;
    } else if (line.startsWith('```')) {
      const body: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith('```')) body.push(lines[i++]);
      i++;
      blocks.push({ kind: 'code', text: body.join('\n') });
    } else if (/^#{1,3} /.test(line)) {
      const level = line.indexOf(' ') as 1 | 2 | 3;
      blocks.push({ kind: 'heading', level, inline: parseInline(line.slice(level + 1)) });
      i++;
    } else if (/^(- |\d+\. )/.test(line)) {
      const ordered = /^\d+\. /.test(line);
      const items: Inline[][] = [];
      while (i < lines.length && /^(- |\d+\. )/.test(lines[i])) {
        items.push(parseInline(lines[i].replace(/^(- |\d+\. )/, '')));
        i++;
      }
      blocks.push({ kind: 'list', ordered, items });
    } else {
      const para: string[] = [];
      while (
        i < lines.length &&
        lines[i].trim() !== '' &&
        !/^(#{1,3} |- |\d+\. |```)/.test(lines[i])
      ) {
        para.push(lines[i++]);
      }
      blocks.push({ kind: 'paragraph', inline: parseInline(para.join(' ')) });
    }
  }
  return blocks;
}
