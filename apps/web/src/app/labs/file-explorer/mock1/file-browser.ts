import { Component, computed, input, output } from '@angular/core';
import { LucideChevronRight } from '../../../shared/icons';
import type { FixtureDir, FixtureNode, GitState } from './fixture';

interface Row {
  readonly path: string;
  readonly node: FixtureNode;
  readonly depth: number;
  readonly open: boolean;
}

const GIT_LETTER: Record<GitState, string> = { clean: '', modified: 'M', untracked: 'U' };

/**
 * The tree half of the panel body. Stateless: which directories are open
 * and which file is selected belong to the mock, so the goto bar can
 * reveal a path without reaching in here.
 *
 * Git state is a letter AND a colour — `M` in ochre, `U` in vermilion —
 * never colour alone (docs/UX-GUIDELINES.md, "Status is never colour alone").
 */
@Component({
  selector: 'app-file-browser',
  imports: [LucideChevronRight],
  templateUrl: './file-browser.html',
  styleUrl: './file-browser.scss',
})
export class FileBrowser {
  readonly root = input.required<FixtureDir>();
  readonly expanded = input.required<ReadonlySet<string>>();
  readonly selected = input<string | null>(null);

  readonly toggled = output<string>();
  readonly opened = output<string>();

  protected readonly letter = GIT_LETTER;

  protected readonly rows = computed(() => {
    const rows: Row[] = [];
    const expanded = this.expanded();
    const walk = (dir: FixtureDir, prefix: string, depth: number) => {
      const sorted = [...dir.children].sort((a, b) =>
        a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === 'dir' ? -1 : 1
      );
      for (const node of sorted) {
        const path = prefix ? `${prefix}/${node.name}` : node.name;
        const open = node.kind === 'dir' && expanded.has(path);
        rows.push({ path, node, depth, open });
        if (node.kind === 'dir' && open) walk(node, path, depth + 1);
      }
    };
    walk(this.root(), '', 0);
    return rows;
  });

  protected activate(row: Row): void {
    if (row.node.kind === 'dir') this.toggled.emit(row.path);
    else this.opened.emit(row.path);
  }
}
