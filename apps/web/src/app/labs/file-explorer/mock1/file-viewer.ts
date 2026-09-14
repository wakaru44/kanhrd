import { NgTemplateOutlet } from '@angular/common';
import { Component, computed, input, output } from '@angular/core';
import type { DiffLine, FixtureFile } from './fixture';
import { parseMarkdown } from './markdown-blocks';

export type ViewerMode = 'source' | 'diff' | 'rendered';

/**
 * The reading half of the panel body: one file, three ways. `rendered` is
 * offered only for a type that has one, so a `.ts` shows two segments and a
 * `.md` three. Read-only: nothing here edits, stages or discards.
 */
@Component({
  selector: 'app-file-viewer',
  imports: [NgTemplateOutlet],
  templateUrl: './file-viewer.html',
  styleUrl: './file-viewer.scss',
})
export class FileViewer {
  readonly path = input<string | null>(null);
  readonly file = input<FixtureFile | null>(null);
  readonly mode = input.required<ViewerMode>();
  readonly modeChange = output<ViewerMode>();

  protected readonly modes = computed<readonly ViewerMode[]>(() =>
    this.file()?.renderable ? ['source', 'diff', 'rendered'] : ['source', 'diff']
  );

  /** A mode the file does not offer falls back to source rather than rendering nothing. */
  protected readonly effectiveMode = computed<ViewerMode>(() =>
    this.modes().includes(this.mode()) ? this.mode() : 'source'
  );

  /** An untracked file's diff is the whole file, added. */
  protected readonly diff = computed<readonly DiffLine[]>(() => {
    const file = this.file();
    if (!file) return [];
    if (file.git === 'untracked') {
      return [
        { kind: 'hunk', text: `@@ -0,0 +1,${file.lines.length} @@` },
        ...file.lines.map((text) => ({ kind: 'added' as const, text })),
      ];
    }
    return file.diff;
  });

  protected readonly blocks = computed(() => {
    const file = this.file();
    return file?.renderable ? parseMarkdown(file.lines) : [];
  });

  protected readonly diffMarker: Record<DiffLine['kind'], string> = {
    context: ' ',
    added: '+',
    removed: '-',
    hunk: '',
  };
}
