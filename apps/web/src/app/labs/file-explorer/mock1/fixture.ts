/**
 * Hard-coded fixture for the file-explorer mock. Nothing here is read from
 * a host: the tree, the file bodies and the diffs are invented, but shaped
 * like this repo so the operator judges the layout against believable
 * content rather than lorem ipsum.
 *
 * What it has to exercise (openspec add-labs-surface, "The file-explorer
 * mock poses its layout questions"): a modified `.ts` with a diff, a markdown
 * file with a rendered view, an untracked directory, and a tree deep enough
 * to see indentation behave.
 */

export type GitState = 'clean' | 'modified' | 'untracked';

export type DiffLineKind = 'context' | 'added' | 'removed' | 'hunk';

export interface DiffLine {
  readonly kind: DiffLineKind;
  readonly text: string;
}

export interface FixtureFile {
  readonly kind: 'file';
  readonly name: string;
  readonly git: GitState;
  /** Language label for the status line. */
  readonly type: string;
  /** Whether the viewer offers `rendered` for this type. */
  readonly renderable: boolean;
  readonly lines: readonly string[];
  /** Unified diff against HEAD; empty for a clean file. */
  readonly diff: readonly DiffLine[];
}

export interface FixtureDir {
  readonly kind: 'dir';
  readonly name: string;
  readonly git: GitState;
  readonly children: readonly FixtureNode[];
}

export type FixtureNode = FixtureFile | FixtureDir;

function file(
  name: string,
  type: string,
  body: string,
  opts: { git?: GitState; diff?: string; renderable?: boolean } = {}
): FixtureFile {
  return {
    kind: 'file',
    name,
    git: opts.git ?? 'clean',
    type,
    renderable: opts.renderable ?? false,
    lines: body.replace(/\n$/, '').split('\n'),
    diff: opts.diff ? parseDiff(opts.diff) : [],
  };
}

/** Directory state rolls up from its children: untracked wins only when every child is untracked. */
function dir(name: string, children: readonly FixtureNode[], git?: GitState): FixtureDir {
  const states = children.map((child) => child.git);
  const rolled: GitState =
    git ??
    (states.length > 0 && states.every((s) => s === 'untracked')
      ? 'untracked'
      : states.some((s) => s !== 'clean')
        ? 'modified'
        : 'clean');
  return { kind: 'dir', name, git: rolled, children };
}

function parseDiff(raw: string): DiffLine[] {
  return raw
    .replace(/\n$/, '')
    .split('\n')
    .map((line) => {
      if (line.startsWith('@@')) return { kind: 'hunk', text: line };
      if (line.startsWith('+')) return { kind: 'added', text: line.slice(1) };
      if (line.startsWith('-')) return { kind: 'removed', text: line.slice(1) };
      return { kind: 'context', text: line.slice(1) };
    });
}

const PANE_DETAIL_TS = `import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { COPY } from '../shared/copy';
import { PanesStore, paneKey } from '../state/panes.store';
import { TerminalKeyBarService } from '../state/terminal-key-bar.service';
import { KeyBar } from './key-bar';
import { DEFAULT_KEY_BAR_CELLS, KeyBarModifiers } from './key-bar-cells';

export type PaneViewState = 'loading' | 'failed' | 'unavailable' | 'stale' | 'gone' | 'empty' | 'live';

/**
 * Pane detail: one terminal at a time, subscribing on init and tearing
 * down on destroy. The file panel sits beside it and never edits a file.
 */
@Component({
  selector: 'app-pane-detail',
  imports: [RouterLink, KeyBar],
  templateUrl: './pane-detail.html',
  styleUrl: './pane-detail.scss',
})
export class PaneDetail {
  private readonly store = inject(PanesStore);

  protected readonly copy = COPY;
  protected readonly keyBarModifiers = new KeyBarModifiers();
  protected readonly keyBarCells = DEFAULT_KEY_BAR_CELLS;
  protected readonly keyBar = inject(TerminalKeyBarService);
  protected readonly keyBarReserve = signal(0);

  /** Collapsed on every visit; the panel is opt-in per pane. */
  protected readonly filePanelOpen = signal(false);
  protected readonly splitRatio = signal(0.6);

  protected readonly pane = computed(() =>
    this.store.panesSignal().get(paneKey(this.host(), this.id()))
  );

  protected readonly project = computed(() => this.pane()?.project ?? null);

  /** The panel is that repo, so it exists only where herdr reports one. */
  protected readonly filePanelAvailable = computed(() => this.project() !== null);

  protected toggleFilePanel(): void {
    if (!this.filePanelAvailable()) return;
    this.filePanelOpen.update((open) => !open);
  }

  protected onSplitterDrag(ratio: number): void {
    this.splitRatio.set(Math.min(0.8, Math.max(0.2, ratio)));
  }

  protected sendKeyBarKeys(keys: readonly string[]): void {
    const pane = this.pane();
    if (!pane || this.viewState() === 'gone') return;
    this.terminal.sendKeys(keys);
  }
}
`;

const PANE_DETAIL_DIFF = `@@ -1,12 +1,12 @@
 import { Component, computed, inject, signal } from '@angular/core';
 import { RouterLink } from '@angular/router';
 import { COPY } from '../shared/copy';
 import { PanesStore, paneKey } from '../state/panes.store';
 import { TerminalKeyBarService } from '../state/terminal-key-bar.service';
 import { KeyBar } from './key-bar';
 import { DEFAULT_KEY_BAR_CELLS, KeyBarModifiers } from './key-bar-cells';

-export type PaneViewState = 'loading' | 'failed' | 'unavailable' | 'stale' | 'empty' | 'live';
+export type PaneViewState = 'loading' | 'failed' | 'unavailable' | 'stale' | 'gone' | 'empty' | 'live';

 /**
  * Pane detail: one terminal at a time, subscribing on init and tearing
- * down on destroy.
+ * down on destroy. The file panel sits beside it and never edits a file.
  */
@@ -27,12 +27,26 @@ export class PaneDetail {
   protected readonly keyBar = inject(TerminalKeyBarService);
   protected readonly keyBarReserve = signal(0);

+  /** Collapsed on every visit; the panel is opt-in per pane. */
+  protected readonly filePanelOpen = signal(false);
+  protected readonly splitRatio = signal(0.6);
+
   protected readonly pane = computed(() =>
     this.store.panesSignal().get(paneKey(this.host(), this.id()))
   );

   protected readonly project = computed(() => this.pane()?.project ?? null);

+  /** The panel is that repo, so it exists only where herdr reports one. */
+  protected readonly filePanelAvailable = computed(() => this.project() !== null);
+
+  protected toggleFilePanel(): void {
+    if (!this.filePanelAvailable()) return;
+    this.filePanelOpen.update((open) => !open);
+  }
+
+  protected onSplitterDrag(ratio: number): void {
+    this.splitRatio.set(Math.min(0.8, Math.max(0.2, ratio)));
+  }
+
   protected sendKeyBarKeys(keys: readonly string[]): void {
     const pane = this.pane();
-    if (!pane) return;
+    if (!pane || this.viewState() === 'gone') return;
     this.terminal.sendKeys(keys);
   }
`;

const KEY_BAR_TS = `/** Termux's fallback long-press threshold (ExtraKeysView). */
export const KEY_BAR_LONG_PRESS_MS = 400;

/**
 * How far the soft keyboard covers the bottom of the layout viewport.
 * Under interactive-widget=resizes-content this is 0, which is correct;
 * on iOS Safari it is the keyboard's height.
 */
export function occludedBottom(
  layoutHeight: number,
  visual: { height: number; offsetTop: number } | null
): number {
  if (!visual) return 0;
  return Math.max(0, Math.round(layoutHeight - (visual.height + visual.offsetTop)));
}
`;

const PANES_STORE_TS = `import { Injectable, signal } from '@angular/core';
import type { Pane } from '@kanhrd/schema';

export function paneKey(host: string, id: string): string {
  return \`\${host}/\${id}\`;
}

@Injectable({ providedIn: 'root' })
export class PanesStore {
  private readonly panes = signal(new Map<string, Pane>());

  readonly panesSignal = this.panes.asReadonly();

  upsert(pane: Pane): void {
    this.panes.update((map) => new Map(map).set(paneKey(pane.host, pane.id), pane));
  }

  remove(host: string, id: string): void {
    this.panes.update((map) => {
      const next = new Map(map);
      next.delete(paneKey(host, id));
      return next;
    });
  }
}
`;

const POLLER_TS = `import type { HostConnection } from './host-connection';

/** One pane.list per host per interval; agent_status changes are derived, never resubscribed. */
export async function pollPanes(host: HostConnection, intervalMs: number): Promise<void> {
  for (;;) {
    const panes = await host.call('pane.list', {});
    host.reconcile(panes);
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}
`;

const FILE_PANEL_MD = `# file panel

A read-only view of the repo a pane works in, beside its terminal.

## what it is for

The agent prints a path. The operator pastes it into the goto bar and reads
the file, or its diff, **without leaving the pane**.

- source, with line numbers
- diff against \`HEAD\`
- rendered, for markdown only

## what it never does

1. Edit a file.
2. Stage, commit or discard anything.
3. Run a command in the pane.

## open questions

The layout questions are device questions. They are answered on a phone,
in \`/labs/file-explorer/mock1\`, not here.

\`\`\`text
wide      terminal | panel
portrait  terminal
          panel
          key bar
\`\`\`
`;

const README_MD = `# kanhrd

A web UI for herdr: a shepherd's console over the flock of coding agents
herdr runs.

## run it

\`\`\`shell
make install
make run
\`\`\`

Then open \`http://127.0.0.1:5173\`.
`;

const NOTES_MD = `# scratch

Probe notes for the file panel. Not tracked; delete when done.

- \`git status --porcelain=v2\` gives rename info the panel will want
- a 4000-line file still scrolls at 60fps in the source view
`;

const PROBE_TS = `// Throwaway: how long does a porcelain parse take on a big repo?
const started = performance.now();
const lines = (await Bun.file('status.txt').text()).split('\\n');
console.log(lines.length, 'entries in', performance.now() - started, 'ms');
`;

const PACKAGE_JSON = `{
  "name": "kanhrd",
  "private": true,
  "packageManager": "pnpm@9.12.0",
  "scripts": {
    "build": "pnpm -r build",
    "test": "pnpm -r test"
  }
}
`;

export const FIXTURE_REPO_NAME = 'kanhrd';
export const FIXTURE_CHECKOUT_PATH = '/Users/operator/src/kanhrd';

export const FIXTURE_TREE: FixtureDir = dir(FIXTURE_REPO_NAME, [
  dir('apps', [
    dir('bridge', [dir('src', [file('poller.ts', 'typescript', POLLER_TS)])]),
    dir('web', [
      dir('src', [
        dir('app', [
          dir('pane-detail', [
            file('key-bar.ts', 'typescript', KEY_BAR_TS),
            file('pane-detail.ts', 'typescript', PANE_DETAIL_TS, {
              git: 'modified',
              diff: PANE_DETAIL_DIFF,
            }),
          ]),
          dir('state', [file('panes.store.ts', 'typescript', PANES_STORE_TS)]),
        ]),
      ]),
    ]),
  ]),
  dir('docs', [
    dir('how-to', [
      file('file-panel.md', 'markdown', FILE_PANEL_MD, { git: 'untracked', renderable: true }),
    ]),
  ]),
  dir('scratch', [
    file('notes.md', 'markdown', NOTES_MD, { git: 'untracked', renderable: true }),
    file('probe.ts', 'typescript', PROBE_TS, { git: 'untracked' }),
  ]),
  file('package.json', 'json', PACKAGE_JSON),
  file('README.md', 'markdown', README_MD, { renderable: true }),
]);

/** Repo-relative path → node. Directories are keyed without a trailing slash. */
export function indexTree(root: FixtureDir): ReadonlyMap<string, FixtureNode> {
  const index = new Map<string, FixtureNode>();
  const walk = (node: FixtureDir, prefix: string) => {
    for (const child of node.children) {
      const path = prefix ? `${prefix}/${child.name}` : child.name;
      index.set(path, child);
      if (child.kind === 'dir') walk(child, path);
    }
  };
  walk(root, '');
  return index;
}

/** A pasted path, as agents print it: `./x`, `/x`, `x/`, surrounding whitespace or quotes. */
export function normalizeRepoPath(raw: string): string {
  return raw
    .trim()
    .replace(/^['"`]|['"`]$/g, '')
    .replace(/^\.\//, '')
    .replace(/^\/+/, '')
    .replace(/\/+$/, '')
    .replace(/:\d+(:\d+)?$/, '');
}
