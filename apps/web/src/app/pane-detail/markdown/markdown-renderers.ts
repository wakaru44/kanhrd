import { InjectionToken, type Provider, type Type } from '@angular/core';
import type { MdBlock } from './markdown-model';

/**
 * The seam. Mermaid and SVG are the named next features, and neither should
 * cost an edit to the renderer's template: a new node renderer is a
 * `provideMarkdownRenderer(...)` in whatever configures the panel, and the
 * core walks past it without knowing what it is.
 *
 * Two keys, because those are the two shapes a richer block arrives in:
 *
 * - `fence` — a fenced code block's info string, lowercased. ```mermaid.
 * - `block` — a rendered block's `kind`. `html`, say, for a renderer that
 *   knows how to show an inline SVG safely.
 *
 * A fence renderer is handed `code` and `info`; a block renderer is handed
 * the rendered `block`. `NgComponentOutlet` binds exactly those, so a
 * renderer declares exactly those inputs. It is responsible for its own
 * safety: the core made no element from the file's text, and a renderer that
 * does is making that choice on its own account.
 */
export interface MarkdownRenderer {
  readonly match: 'fence' | 'block';
  /** The fence info string, or the block kind, this renderer claims. */
  readonly for: string;
  readonly component: Type<unknown>;
}

export const MARKDOWN_RENDERERS = new InjectionToken<readonly MarkdownRenderer[]>(
  'MARKDOWN_RENDERERS'
);

/** Register one renderer. Multi-provided, so registrations accumulate. */
export function provideMarkdownRenderer(renderer: MarkdownRenderer): Provider {
  return { provide: MARKDOWN_RENDERERS, useValue: renderer, multi: true };
}

/**
 * The renderer that claims this block, or `null` for the core's own
 * rendering. A fence claim wins over a block claim, because it is the more
 * specific of the two.
 */
export function pickRenderer(
  renderers: readonly MarkdownRenderer[],
  block: MdBlock
): MarkdownRenderer | null {
  if (block.kind === 'code' && block.lang !== '') {
    const fence = renderers.find((r) => r.match === 'fence' && r.for === block.lang);
    if (fence) {
      return fence;
    }
  }
  return renderers.find((r) => r.match === 'block' && r.for === block.kind) ?? null;
}

/** The inputs a registered renderer is bound to. */
export function rendererInputs(block: MdBlock): Record<string, unknown> {
  return block.kind === 'code' ? { code: block.text, info: block.lang } : { block };
}
