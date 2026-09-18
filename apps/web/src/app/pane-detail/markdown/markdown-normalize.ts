import type {
  Definition,
  FootnoteDefinition,
  Nodes,
  PhrasingContent,
  Root,
  RootContent,
  TableCell,
} from 'mdast';
import { classifyLink } from './markdown-links';
import type { MdBlock, MdFootnote, MdListItem, MdPhrasing } from './markdown-model';

/**
 * mdast in, render model out. This function is the whole security boundary
 * of the rendered view: the scheme allowlist, the image policy and the "raw
 * HTML is text" rule are applied here, once, so the template downstream has
 * no decision left that could be got wrong on some branch nobody tested.
 *
 * Anything this does not understand degrades to its text rather than
 * disappearing — a file the panel shows should never be quietly smaller than
 * the file on disk.
 */
export function normalize(tree: Root, dir: string): readonly MdBlock[] {
  return new Normalizer(tree, dir).run();
}

class Normalizer {
  /** `[label]: url` targets, for the reference forms of links and images. */
  private readonly definitions = new Map<string, Definition>();
  private readonly footnotes = new Map<string, FootnoteDefinition>();
  /** Footnote labels in the order the body first referenced them. */
  private readonly order: string[] = [];

  constructor(
    private readonly tree: Root,
    private readonly dir: string
  ) {
    collect(tree, this.definitions, this.footnotes);
  }

  run(): readonly MdBlock[] {
    const blocks = this.blocks(this.tree.children);
    const items = this.footnoteItems();
    return items.length === 0 ? blocks : [...blocks, { kind: 'footnotes', items }];
  }

  /**
   * Definitions the body referenced, in reference order, then any it did
   * not — an unreferenced footnote is still content the file contains.
   */
  private footnoteItems(): readonly MdFootnote[] {
    for (const label of this.footnotes.keys()) {
      if (!this.order.includes(label)) {
        this.order.push(label);
      }
    }
    return this.order.map((label, index) => {
      const definition = this.footnotes.get(label);
      return {
        label,
        index: index + 1,
        children: definition ? this.blocks(definition.children) : [],
      };
    });
  }

  private blocks(nodes: readonly RootContent[]): readonly MdBlock[] {
    const out: MdBlock[] = [];
    for (const node of nodes) {
      const block = this.block(node);
      if (block) {
        out.push(block);
      }
    }
    return out;
  }

  private block(node: RootContent): MdBlock | null {
    // Frontmatter is recognised by the pipeline so that it does not reach the
    // body as a stray table row or thematic break, and has no place in the
    // rendered document. `@types/mdast` declares the `yaml` node but not the
    // `toml` one `remark-frontmatter` also produces, so both are matched by
    // name rather than through the union.
    if (node.type === 'yaml' || (node.type as string) === 'toml') {
      return null;
    }
    switch (node.type) {
      case 'heading':
        return { kind: 'heading', depth: node.depth, children: this.phrasing(node.children) };
      case 'paragraph':
        return { kind: 'paragraph', children: this.phrasing(node.children) };
      case 'blockquote':
        return { kind: 'blockquote', children: this.blocks(node.children) };
      case 'thematicBreak':
        return { kind: 'rule' };
      case 'code':
        return { kind: 'code', lang: (node.lang ?? '').trim().toLowerCase(), text: node.value };
      case 'list':
        return {
          kind: 'list',
          ordered: node.ordered === true,
          start: node.start ?? null,
          items: node.children.map((item): MdListItem => ({
            checked: item.checked ?? null,
            children: this.blocks(item.children),
          })),
        };
      case 'table':
        return {
          kind: 'table',
          align: (node.align ?? []).map((a) => a ?? null),
          head: (node.children[0]?.children ?? []).map((cell) => this.cell(cell)),
          rows: node.children.slice(1).map((row) => row.children.map((cell) => this.cell(cell))),
        };
      // Raw HTML from the file. It is printed, not parsed — this is the one
      // branch where the easy, wrong thing was available.
      case 'html':
        return { kind: 'html', text: node.value };
      // Collected above and rendered at the end, wherever they were written.
      case 'definition':
      case 'footnoteDefinition':
        return null;
      default:
        return this.fallback(node);
    }
  }

  /** A node kind the model has no branch for still shows the text it held. */
  private fallback(node: Nodes): MdBlock | null {
    const text = plainText(node);
    return text === '' ? null : { kind: 'paragraph', children: [{ kind: 'text', text }] };
  }

  private cell(cell: TableCell): readonly MdPhrasing[] {
    return this.phrasing(cell.children);
  }

  private phrasing(nodes: readonly PhrasingContent[]): readonly MdPhrasing[] {
    const out: MdPhrasing[] = [];
    for (const node of nodes) {
      out.push(...this.inline(node));
    }
    return out;
  }

  private inline(node: PhrasingContent): readonly MdPhrasing[] {
    switch (node.type) {
      case 'text':
        return [{ kind: 'text', text: node.value }];
      case 'emphasis':
        return [{ kind: 'emphasis', children: this.phrasing(node.children) }];
      case 'strong':
        return [{ kind: 'strong', children: this.phrasing(node.children) }];
      case 'delete':
        return [{ kind: 'delete', children: this.phrasing(node.children) }];
      case 'inlineCode':
        return [{ kind: 'code', text: node.value }];
      case 'break':
        return [{ kind: 'break' }];
      // Inline HTML, like block HTML, is the text the file contains.
      case 'html':
        return [{ kind: 'text', text: node.value }];
      case 'link':
        return [this.link(node.url, this.phrasing(node.children))];
      case 'image':
        return [this.image(node.url, node.alt ?? '')];
      case 'linkReference': {
        const target = this.definitions.get(node.identifier);
        const children = this.phrasing(node.children);
        return target ? [this.link(target.url, children)] : children;
      }
      case 'imageReference': {
        const target = this.definitions.get(node.identifier);
        const alt = node.alt ?? '';
        return target ? [this.image(target.url, alt)] : [{ kind: 'text', text: alt }];
      }
      case 'footnoteReference': {
        if (!this.order.includes(node.identifier)) {
          this.order.push(node.identifier);
        }
        return [
          {
            kind: 'footnoteRef',
            label: node.identifier,
            index: this.order.indexOf(node.identifier) + 1,
          },
        ];
      }
      default: {
        const text = plainText(node);
        return text === '' ? [] : [{ kind: 'text', text }];
      }
    }
  }

  /** A destination the allowlist refuses becomes its own text, plus the URL. */
  private link(url: string, children: readonly MdPhrasing[]): MdPhrasing {
    const link = classifyLink(url, this.dir);
    if (link === null) {
      return { kind: 'inert', text: flatten(children), raw: url };
    }
    return { kind: 'link', link, children };
  }

  /**
   * An image is never fetched. A remote one would tell that server the
   * operator opened the file; a checkout one has no method that returns its
   * bytes. Both become a placeholder that names the destination.
   */
  private image(url: string, alt: string): MdPhrasing {
    const link = classifyLink(url, this.dir);
    if (link === null || link.to === 'mail') {
      return { kind: 'inert', text: alt, raw: url };
    }
    return link.to === 'external'
      ? { kind: 'image', alt, src: link.href, at: 'remote' }
      : { kind: 'image', alt, src: link.path, at: 'local' };
  }
}

/** Index every definition in the tree, wherever in it they were written. */
function collect(
  node: Nodes,
  definitions: Map<string, Definition>,
  footnotes: Map<string, FootnoteDefinition>
): void {
  if (node.type === 'definition') {
    definitions.set(node.identifier, node);
  } else if (node.type === 'footnoteDefinition') {
    footnotes.set(node.identifier, node);
  }
  if ('children' in node) {
    for (const child of node.children) {
      collect(child, definitions, footnotes);
    }
  }
}

/** Everything a node holds as text, for the branches the model has no shape for. */
function plainText(node: Nodes): string {
  if ('value' in node && typeof node.value === 'string') {
    return node.value;
  }
  if ('children' in node) {
    return node.children.map((child) => plainText(child)).join('');
  }
  return '';
}

/** The text of an inline run, for a link whose destination was refused. */
function flatten(parts: readonly MdPhrasing[]): string {
  return parts
    .map((part) => {
      switch (part.kind) {
        case 'text':
        case 'code':
          return part.text;
        case 'emphasis':
        case 'strong':
        case 'delete':
        case 'link':
          return flatten(part.children);
        case 'inert':
          return part.text;
        case 'image':
          return part.alt;
        default:
          return '';
      }
    })
    .join('');
}
