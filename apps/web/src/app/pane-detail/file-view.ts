import { Component, computed, input, output } from '@angular/core';
import type { RepoDiffChange } from '@kanhrd/schema';
import { COPY, fill } from '../shared/copy';
import { LucideTriangleAlert } from '../shared/icons';
import type { DiffLine } from './file-diff';
import { MarkdownView } from './markdown/markdown-view';

export type ViewerMode = 'source' | 'diff' | 'rendered';

/**
 * What the panel knows about the selected file's CONTENT. Every arm but
 * `text` is a fact the bridge reported: a binary file and an oversized one
 * are answers, not failures, and neither may be rendered as an empty
 * source view (docs/UX-GUIDELINES.md, "Reliability states tell the truth").
 */
export type FileContent =
  | { readonly kind: 'none' }
  | { readonly kind: 'loading' }
  | {
      readonly kind: 'text';
      readonly size: number;
      readonly lines: readonly string[];
      /** Whether this type has a `rendered` view at all. */
      readonly renderable: boolean;
    }
  | { readonly kind: 'binary'; readonly size: number }
  /** The bridge's own `file_too_large` message names the size and the cap. */
  | { readonly kind: 'too-large'; readonly reason: string }
  | { readonly kind: 'gone' }
  | { readonly kind: 'failed'; readonly reason: string };

/** What the panel knows about the selected file's diff against `HEAD`. */
export type FileDiff =
  | { readonly kind: 'none' }
  | { readonly kind: 'loading' }
  | {
      readonly kind: 'diff';
      readonly change: RepoDiffChange;
      readonly binary: boolean;
      readonly lines: readonly DiffLine[];
      readonly truncated: boolean;
    }
  | { readonly kind: 'gone' }
  | { readonly kind: 'failed'; readonly reason: string };

const DIFF_MARKER: Record<DiffLine['kind'], string> = {
  context: ' ',
  added: '+',
  removed: '-',
  hunk: '',
  meta: '',
};

/**
 * The reading half of the panel body: one file, up to three ways. Purely
 * presentational — it fetches nothing, so every state it can show is one
 * `FilePanel` decided on, and there is no path by which it renders an empty
 * box for a file the bridge refused.
 *
 * `rendered` is offered only for a type that has one, so a `.ts` shows two
 * segments and a `.md` three. Read-only throughout: no field here is
 * editable and nothing it shows can be written back.
 */
@Component({
  selector: 'app-file-view',
  imports: [LucideTriangleAlert, MarkdownView],
  templateUrl: './file-view.html',
  styleUrl: './file-view.scss',
})
export class FileView {
  readonly path = input<string | null>(null);
  readonly content = input.required<FileContent>();
  readonly diff = input.required<FileDiff>();
  readonly mode = input.required<ViewerMode>();
  readonly modeChange = output<ViewerMode>();
  /** A checkout path a link in the rendered view named. */
  readonly pathSelect = output<string>();

  protected readonly copy = COPY;
  protected readonly diffMarker = DIFF_MARKER;

  /** `source` is only honest while there IS source; `diff` always is. */
  protected readonly modes = computed<readonly ViewerMode[]>(() => {
    const content = this.content();
    if (content.kind === 'text') {
      return content.renderable ? ['source', 'diff', 'rendered'] : ['source', 'diff'];
    }
    return ['diff'];
  });

  protected readonly modeLabels: Record<ViewerMode, string> = {
    source: COPY.files.modeSource,
    diff: COPY.files.modeDiff,
    rendered: COPY.files.modeRendered,
  };

  /** A mode the file does not offer falls back rather than rendering nothing. */
  protected readonly effectiveMode = computed<ViewerMode>(() => {
    const modes = this.modes();
    return modes.includes(this.mode()) ? this.mode() : modes[0];
  });

  /**
   * The file as one string, for the renderer. Only ever read inside the
   * `rendered` branch, so a source or diff view never joins the lines.
   */
  protected readonly text = computed(() => {
    const content = this.content();
    return content.kind === 'text' ? content.lines.join('\n') : '';
  });

  protected readonly failure = (reason: string) => fill(COPY.files.failed, { reason });
}
