import { Component, input, output } from '@angular/core';
import { COPY } from '../shared/copy';
import { LucideChevronRight } from '../shared/icons';

/** What `repo.status` said about a path, reduced to what a row shows. */
export type TreeGit = 'clean' | 'modified' | 'untracked';

/**
 * One rendered line. `entry` is a real `repo.tree` entry; `note` is a
 * caption the panel puts under a directory's entries — a truncated listing,
 * an empty directory, a failed expansion. A note is never a row the
 * operator can activate.
 */
export type TreeRow =
  | {
      readonly kind: 'entry';
      readonly path: string;
      readonly name: string;
      readonly type: 'file' | 'directory' | 'symlink' | 'other';
      readonly depth: number;
      readonly open: boolean;
      readonly loading: boolean;
      readonly ignored: boolean;
      readonly git: TreeGit;
    }
  | { readonly kind: 'note'; readonly id: string; readonly depth: number; readonly text: string };

const GIT_LETTER: Record<TreeGit, string> = { clean: '', modified: 'M', untracked: 'U' };

/**
 * The tree half of the panel body. Stateless by design: which directories
 * are open, which are still loading and which file is selected all belong
 * to `FilePanel`, so the goto field can reveal a path without reaching in
 * here, and so one level arriving from `repo.tree` re-renders through the
 * same input as every other.
 *
 * Git state is a letter AND a colour — `M` in ochre, `U` in vermilion —
 * never colour alone (docs/UX-GUIDELINES.md, "Status is never colour
 * alone"). `ignored` is a word, for the same reason.
 */
@Component({
  selector: 'app-file-tree',
  imports: [LucideChevronRight],
  templateUrl: './file-tree.html',
  styleUrl: './file-tree.scss',
})
export class FileTree {
  readonly rows = input.required<readonly TreeRow[]>();
  readonly selected = input<string | null>(null);

  readonly toggled = output<string>();
  readonly opened = output<string>();

  protected readonly letter = GIT_LETTER;
  protected readonly copyIgnored = COPY.files.ignored;

  protected activate(row: TreeRow): void {
    if (row.kind !== 'entry') {
      return;
    }
    if (row.type === 'directory') {
      this.toggled.emit(row.path);
    } else {
      this.opened.emit(row.path);
    }
  }
}
