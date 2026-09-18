/**
 * The closed shape the rendered view walks.
 *
 * Every markdown file the panel shows was written by an agent, in a checkout
 * nobody reviewed, so the render model is the boundary where that text stops
 * being a document and becomes data. Nothing here is, or can hold, an HTML
 * string: a `link` carries a destination already judged against the scheme
 * allowlist, an `image` carries a placeholder's worth of facts and never a
 * `src` anything will fetch, and raw HTML arrives as `html`, which the
 * template prints.
 *
 * mdast is the input to this, not the thing rendered. Keeping our own model
 * means a node kind we do not handle is a compile error in one file, not a
 * silently empty branch in a template.
 */

/** A table column's alignment, or `null` for the default. */
export type MdAlign = 'left' | 'right' | 'center' | null;

/**
 * Where a link destination is allowed to point. Decided once, in the
 * normalizer, so no template has a scheme decision left to get wrong.
 *
 * - `external` — `http:` / `https:`, opened in a new tab.
 * - `mail` — `mailto:`, handed to the browser as-is.
 * - `path` — no scheme: a path in this checkout, already resolved against
 *   the open file's directory and proven not to climb out of the root.
 */
export type MdLink =
  | { readonly to: 'external'; readonly href: string }
  | { readonly to: 'mail'; readonly href: string }
  | { readonly to: 'path'; readonly path: string };

export type MdPhrasing =
  | { readonly kind: 'text'; readonly text: string }
  | { readonly kind: 'emphasis'; readonly children: readonly MdPhrasing[] }
  | { readonly kind: 'strong'; readonly children: readonly MdPhrasing[] }
  | { readonly kind: 'delete'; readonly children: readonly MdPhrasing[] }
  | { readonly kind: 'code'; readonly text: string }
  | { readonly kind: 'break' }
  | { readonly kind: 'link'; readonly link: MdLink; readonly children: readonly MdPhrasing[] }
  /** Never fetched. `at` decides which reason the placeholder states. */
  | {
      readonly kind: 'image';
      readonly alt: string;
      readonly src: string;
      readonly at: 'remote' | 'local';
    }
  /**
   * A destination the allowlist refused, or one that climbed out of the
   * checkout. The text is rendered, and the destination beside it: hiding
   * what was rejected would be the one thing worse than rendering it.
   */
  | { readonly kind: 'inert'; readonly text: string; readonly raw: string }
  | { readonly kind: 'footnoteRef'; readonly label: string; readonly index: number };

export interface MdListItem {
  /** `null` unless the source made it a task list item. */
  readonly checked: boolean | null;
  readonly children: readonly MdBlock[];
}

export interface MdFootnote {
  readonly label: string;
  readonly index: number;
  readonly children: readonly MdBlock[];
}

export type MdBlock =
  | {
      readonly kind: 'heading';
      readonly depth: 1 | 2 | 3 | 4 | 5 | 6;
      readonly children: readonly MdPhrasing[];
    }
  | { readonly kind: 'paragraph'; readonly children: readonly MdPhrasing[] }
  | { readonly kind: 'blockquote'; readonly children: readonly MdBlock[] }
  | {
      readonly kind: 'list';
      readonly ordered: boolean;
      readonly start: number | null;
      readonly items: readonly MdListItem[];
    }
  | { readonly kind: 'code'; readonly lang: string; readonly text: string }
  | {
      readonly kind: 'table';
      readonly align: readonly MdAlign[];
      readonly head: readonly (readonly MdPhrasing[])[];
      readonly rows: readonly (readonly (readonly MdPhrasing[])[])[];
    }
  | { readonly kind: 'rule' }
  /** Raw HTML from the file. Printed, never parsed into elements. */
  | { readonly kind: 'html'; readonly text: string }
  /** Every `footnoteDefinition` in the file, collected, in reference order. */
  | { readonly kind: 'footnotes'; readonly items: readonly MdFootnote[] };

/** One parsed file, plus what the reader needs to know about the parse. */
export interface MdDocument {
  readonly blocks: readonly MdBlock[];
  /** Lines actually handed to the parser. */
  readonly lines: number;
  /** Lines in the file. Equal to `lines` unless the cut fired. */
  readonly totalLines: number;
  readonly truncated: boolean;
}
