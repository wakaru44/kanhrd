import { NgComponentOutlet, NgTemplateOutlet } from '@angular/common';
import { Component, computed, inject, input, output } from '@angular/core';
import { COPY, fill } from '../../shared/copy';
import { dirOf } from './markdown-links';
import type { MdBlock } from './markdown-model';
import { parseMarkdown } from './markdown-pipeline';
import {
  MARKDOWN_RENDERERS,
  pickRenderer,
  rendererInputs,
  type MarkdownRenderer,
} from './markdown-renderers';

/**
 * The rendered view of one markdown file.
 *
 * This component and everything it imports — `unified`, the remark stack,
 * the normalizer — are reachable only through the `@defer` block in
 * `file-view.html`, so the board never downloads a markdown parser it has no
 * use for.
 *
 * The rendering is templates over data, all the way down: no markup is ever
 * built from the file's text, so there is nothing for a sanitizer to stand
 * in front of. Raw HTML in the file arrives as an `html` block and is
 * printed. The files this renders were written by agents minutes ago in a
 * checkout nobody reviewed, and that property is the reason the easy path
 * was not taken.
 */
@Component({
  selector: 'app-markdown-view',
  imports: [NgTemplateOutlet, NgComponentOutlet],
  templateUrl: './markdown-view.html',
  styleUrl: './markdown-view.scss',
})
export class MarkdownView {
  /** The file's text. */
  readonly source = input.required<string>();
  /** Its checkout path — the base a relative link resolves against. */
  readonly path = input<string | null>(null);
  /** A relative link the reader followed, as a checkout path. */
  readonly pathSelect = output<string>();

  private readonly renderers: readonly MarkdownRenderer[] =
    inject(MARKDOWN_RENDERERS, { optional: true }) ?? [];

  protected readonly copy = COPY;

  protected readonly doc = computed(() => parseMarkdown(this.source(), dirOf(this.path())));

  protected readonly truncatedNote = computed(() =>
    fill(COPY.files.renderedTruncated, { lines: String(this.doc().lines) })
  );

  /** A registered renderer for this block, or `null` for the core's own. */
  protected rendererFor(block: MdBlock): MarkdownRenderer | null {
    return pickRenderer(this.renderers, block);
  }

  protected readonly inputsFor = rendererInputs;

  protected imageNote(at: 'remote' | 'local'): string {
    return at === 'remote' ? COPY.files.imageRemote : COPY.files.imageLocal;
  }

  protected follow(path: string): void {
    this.pathSelect.emit(path);
  }
}
