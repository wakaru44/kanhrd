import {
  Component,
  DestroyRef,
  ElementRef,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import type { Pane, RepoStatusEntry, RepoTreeEntry } from '@kanhrd/schema';
import { COPY, fill } from '../shared/copy';
import { LucideRefreshCw, LucideTriangleAlert, LucideUnplug } from '../shared/icons';
import { RepoFilesService, type RepoFilesErrorCode } from '../state/repo-files.service';
import { parseUnifiedDiff } from './file-diff';
import { FileTree, type TreeGit, type TreeRow } from './file-tree';
import { FileView, type FileContent, type FileDiff, type ViewerMode } from './file-view';
import { SIDE_BY_SIDE_MIN_PX } from './file-panel-split';

/**
 * Why the panel cannot show files, or `ready`. Exactly one of these holds at
 * a time, and none of them is ever rendered as an empty tree or a spinner
 * that does not end (docs/UX-GUIDELINES.md, "Reliability states tell the
 * truth"). `not-local` is the everyday one: every host reached over a
 * tunnel lands here, and it has to say which machine reads the files rather
 * than look broken.
 */
export type PanelGate =
  'ready' | 'no-repo' | 'not-local' | 'not-a-repo' | 'git-missing' | 'checkout-gone';

/** Codes that end the panel's conversation with the bridge for this pane. */
const FATAL: Partial<Record<RepoFilesErrorCode, PanelGate>> = {
  files_not_local: 'not-local',
  not_a_repository: 'not-a-repo',
  git_unavailable: 'git-missing',
  pane_not_found: 'checkout-gone',
  no_checkout: 'checkout-gone',
};

const MARKDOWN = /\.(md|markdown)$/i;

interface DirState {
  readonly loading: boolean;
  readonly entries: readonly RepoTreeEntry[];
  readonly truncated: boolean;
  readonly error: string | null;
}

interface StatusView {
  readonly branch: string | null;
  readonly head: string | null;
  readonly upstream: string | null;
  readonly ahead: number | null;
  readonly behind: number | null;
  readonly entries: readonly RepoStatusEntry[];
  readonly truncated: boolean;
}

/** The checkout-relative form of what the operator pasted. */
export function normalizeRepoPath(raw: string): string {
  return raw.trim().replace(/^\.\//, '').replace(/^\/+/, '').replace(/\/+$/, '');
}

/**
 * Git state per path, for the tree. A directory inherits `modified` when
 * anything under it changed: the operator scanning a collapsed tree needs to
 * know which branch to open, and git itself has no state for a directory.
 */
export function gitByPath(entries: readonly RepoStatusEntry[]): Map<string, TreeGit> {
  const map = new Map<string, TreeGit>();
  for (const entry of entries) {
    const path = entry.path.replace(/\/$/, '');
    map.set(path, entry.kind === 'untracked' ? 'untracked' : 'modified');
    const parts = path.split('/');
    for (let i = 1; i < parts.length; i++) {
      const ancestor = parts.slice(0, i).join('/');
      if (!map.has(ancestor)) {
        map.set(ancestor, 'modified');
      }
    }
  }
  return map;
}

/**
 * The read-only file panel beside the terminal. It owns every fetch it
 * makes, so `FileTree` and `FileView` stay presentational and every state
 * the operator can see is one this component decided on.
 *
 * Read-only throughout: the four methods it calls cannot write, and the
 * panel offers no control that would want to.
 *
 * The tree is fetched ONE LEVEL AT A TIME, by design — the bridge lists a
 * single directory per call and an ignored `node_modules` is one entry, not
 * a walk.
 */
@Component({
  selector: 'app-file-panel',
  imports: [FileTree, FileView, LucideRefreshCw, LucideTriangleAlert, LucideUnplug],
  templateUrl: './file-panel.html',
  styleUrl: './file-panel.scss',
})
export class FilePanel {
  private readonly repoFiles = inject(RepoFilesService);
  private readonly element: ElementRef<HTMLElement> = inject(ElementRef);

  readonly host = input.required<string>();
  readonly paneId = input.required<string>();
  readonly project = input<Pane['project'] | null>(null);
  /**
   * The pane's host is out of sight, or the session ended. The panel keeps
   * what it already read on screen and stops asking for more — a poll
   * against a lost host is noise, and a poll against a dead pane is a lie.
   */
  readonly paused = input(false);

  protected readonly copy = COPY;

  // ---- gate --------------------------------------------------------------

  private readonly fatal = signal<PanelGate | null>(null);
  /** The pane the panel's contents belong to, and whether its first read went out. */
  private loadedKey = '';
  private requested = false;

  protected readonly gate = computed<PanelGate>(() => {
    const project = this.project();
    if (!project) {
      return 'no-repo';
    }
    const fatal = this.fatal();
    if (fatal) {
      return fatal;
    }
    return project.files_local === true ? 'ready' : 'not-local';
  });

  protected readonly notLocalBody = computed(() =>
    fill(COPY.files.notLocalBody, { host: this.host() })
  );

  // ---- status ------------------------------------------------------------

  protected readonly status = signal<StatusView | null>(null);
  /** A poll that failed leaves the last good status up, marked, rather than blanking it. */
  protected readonly statusStale = signal(false);
  protected readonly statusError = signal<string | null>(null);
  protected readonly statusFailure = computed(() => {
    const reason = this.statusError();
    return reason === null ? '' : fill(COPY.files.failed, { reason });
  });

  private readonly git = computed(() => gitByPath(this.status()?.entries ?? []));

  protected readonly summary = computed(() => {
    const status = this.status();
    if (!status) {
      return null;
    }
    let modified = 0;
    let untracked = 0;
    for (const entry of status.entries) {
      if (entry.kind === 'untracked') {
        untracked++;
      } else {
        modified++;
      }
    }
    return {
      branch: status.branch,
      /**
       * The commit, short. It is the whole of the answer on a detached
       * HEAD, where there is no branch name to show, and the check against
       * the branch's own tip everywhere else.
       */
      head: status.head === null ? null : status.head.slice(0, 7),
      upstream: status.upstream,
      ahead: status.ahead,
      behind: status.behind,
      modified,
      untracked,
      truncated: status.truncated,
    };
  });

  // ---- tree --------------------------------------------------------------

  private readonly dirs = signal<ReadonlyMap<string, DirState>>(new Map());
  private readonly expanded = signal<ReadonlySet<string>>(new Set(['']));

  protected readonly rows = computed<readonly TreeRow[]>(() => {
    const dirs = this.dirs();
    const expanded = this.expanded();
    const git = this.git();
    const rows: TreeRow[] = [];

    const walk = (path: string, depth: number): void => {
      const dir = dirs.get(path);
      if (!dir) {
        return;
      }
      if (dir.loading && dir.entries.length === 0) {
        rows.push({ kind: 'note', id: `${path}:loading`, depth, text: COPY.files.loading });
        return;
      }
      if (dir.error) {
        rows.push({
          kind: 'note',
          id: `${path}:error`,
          depth,
          text: fill(COPY.files.failed, { reason: dir.error }),
        });
        return;
      }
      for (const entry of dir.entries) {
        const open = entry.type === 'directory' && expanded.has(entry.path);
        rows.push({
          kind: 'entry',
          path: entry.path,
          name: entry.name,
          type: entry.type,
          depth,
          open,
          loading: dirs.get(entry.path)?.loading === true,
          ignored: entry.ignored,
          git: git.get(entry.path) ?? 'clean',
        });
        if (open) {
          walk(entry.path, depth + 1);
        }
      }
      if (dir.truncated) {
        rows.push({
          kind: 'note',
          id: `${path}:truncated`,
          depth,
          text: COPY.files.treeTruncated,
        });
      }
    };

    walk('', 0);
    return rows;
  });

  // ---- viewer ------------------------------------------------------------

  protected readonly selected = signal<string | null>(null);
  protected readonly content = signal<FileContent>({ kind: 'none' });
  protected readonly diff = signal<FileDiff>({ kind: 'none' });
  protected readonly viewerMode = signal<ViewerMode>('diff');

  protected readonly selectedGit = computed<TreeGit>(() => {
    const path = this.selected();
    return path ? (this.git().get(path) ?? 'clean') : 'clean';
  });

  // ---- goto --------------------------------------------------------------

  protected readonly goto = signal('');
  protected readonly gotoError = signal<string | null>(null);

  // ---- layout ------------------------------------------------------------

  /** The PANEL's own width decides side-by-side vs single — not the viewport's. */
  protected readonly width = signal(0);
  protected readonly layout = computed(() =>
    this.width() >= SIDE_BY_SIDE_MIN_PX ? 'side-by-side' : 'single'
  );
  protected readonly surface = signal<'browser' | 'viewer'>('browser');

  constructor() {
    const destroyRef = inject(DestroyRef);

    const observer =
      typeof ResizeObserver === 'function'
        ? new ResizeObserver((entries) => {
            for (const entry of entries) {
              this.width.set(Math.round(entry.contentRect.width));
            }
          })
        : null;
    observer?.observe(this.element.nativeElement);
    destroyRef.onDestroy(() => observer?.disconnect());

    // A different pane is a different checkout: nothing read for the last
    // one may survive into this one. The first read waits for the gate,
    // because a pane whose `project` has not arrived yet is not yet known
    // to be servable — and `requested` keeps it to one read per pane, since
    // clearing `fatal` moves the gate and would otherwise re-enter here.
    effect(() => {
      const key = `${this.host()}\u0000${this.paneId()}`;
      const ready = this.gate() === 'ready';
      untracked(() => {
        if (key !== this.loadedKey) {
          this.loadedKey = key;
          this.requested = false;
          this.reset();
        }
        if (ready && !this.requested && this.host() && this.paneId()) {
          this.requested = true;
          void this.loadRoot();
          void this.pollStatus();
        }
      });
    });

    // Status is polled at the cadence the bridge advertises, and only while
    // the panel exists and can be served — it is collapsed by being
    // destroyed, so there is no path by which a hidden panel keeps polling.
    effect((onCleanup) => {
      const ready = this.gate() === 'ready' && !this.paused();
      const interval = this.repoFiles.capability(this.host())?.statusPollIntervalMs ?? 0;
      if (!ready || interval <= 0) {
        return;
      }
      const timer = setInterval(() => void this.pollStatus(), interval);
      onCleanup(() => clearInterval(timer));
    });
  }

  private reset(): void {
    this.fatal.set(null);
    this.status.set(null);
    this.statusStale.set(false);
    this.statusError.set(null);
    this.dirs.set(new Map());
    this.expanded.set(new Set(['']));
    this.selected.set(null);
    this.content.set({ kind: 'none' });
    this.diff.set({ kind: 'none' });
    this.goto.set('');
    this.gotoError.set(null);
    this.surface.set('browser');
  }

  /**
   * A code that ends the conversation is recorded once and gates the whole
   * panel; anything else is this call's own failure and is reported where
   * the call was made.
   */
  private takeFatal(code: RepoFilesErrorCode): boolean {
    const gate = FATAL[code];
    if (gate) {
      this.fatal.set(gate);
      return true;
    }
    return false;
  }

  protected retry(): void {
    this.fatal.set(null);
    this.statusError.set(null);
    this.requested = true;
    void this.loadRoot();
    void this.pollStatus();
  }

  // ---- fetches -----------------------------------------------------------

  private async pollStatus(): Promise<void> {
    const result = await this.repoFiles.status(this.host(), this.paneId());
    if (!result.ok) {
      if (this.takeFatal(result.code)) {
        return;
      }
      // Keep the last good status visible and say it is no longer fresh.
      this.statusStale.set(this.status() !== null);
      this.statusError.set(result.message);
      return;
    }
    const data = result.data;
    this.statusStale.set(false);
    this.statusError.set(null);
    this.status.set({
      branch: data.branch,
      head: data.head,
      upstream: data.upstream ?? null,
      ahead: data.ahead ?? null,
      behind: data.behind ?? null,
      entries: data.entries,
      truncated: data.truncated,
    });
  }

  private loadRoot(): Promise<void> {
    return this.loadDir('');
  }

  private async loadDir(path: string): Promise<void> {
    this.patchDir(path, { loading: true, entries: [], truncated: false, error: null });
    const result = await this.repoFiles.tree(this.host(), this.paneId(), path || undefined);
    if (!result.ok) {
      if (this.takeFatal(result.code)) {
        return;
      }
      this.patchDir(path, { loading: false, entries: [], truncated: false, error: result.message });
      return;
    }
    this.patchDir(path, {
      loading: false,
      entries: result.data.entries,
      truncated: result.data.truncated,
      error: null,
    });
  }

  private patchDir(path: string, state: DirState): void {
    this.dirs.update((map) => {
      const next = new Map(map);
      const previous = next.get(path);
      // A reload keeps the entries already on screen until the new ones
      // arrive, so an expanded branch does not blink on every refresh.
      next.set(
        path,
        state.loading && previous ? { ...previous, loading: true, error: null } : state
      );
      return next;
    });
  }

  // ---- interactions ------------------------------------------------------

  protected toggleDir(path: string): void {
    const open = this.expanded().has(path);
    this.expanded.update((set) => {
      const next = new Set(set);
      if (open) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
    if (!open && !this.dirs().has(path)) {
      void this.loadDir(path);
    }
  }

  protected openFile(path: string): void {
    this.selected.set(path);
    this.surface.set('viewer');
    void this.readFile(path);
    void this.readDiff(path);
  }

  private async readFile(path: string): Promise<void> {
    this.content.set({ kind: 'loading' });
    const result = await this.repoFiles.read(this.host(), this.paneId(), path);
    if (this.selected() !== path) {
      return; // the operator moved on while this was in flight
    }
    if (!result.ok) {
      if (this.takeFatal(result.code)) {
        return;
      }
      if (result.code === 'file_too_large') {
        this.content.set({ kind: 'too-large', reason: result.message });
      } else if (result.code === 'not_found' || result.code === 'not_a_file') {
        this.content.set({ kind: 'gone' });
      } else {
        this.content.set({ kind: 'failed', reason: result.message });
      }
      return;
    }
    const data = result.data;
    if (data.binary) {
      // `modes()` already leaves `diff` as the only honest view; forcing the
      // signal here would stick the operator in it for the NEXT file too.
      this.content.set({ kind: 'binary', size: data.size });
      return;
    }
    this.content.set({
      kind: 'text',
      size: data.size,
      lines: data.content.split('\n'),
      renderable: MARKDOWN.test(path),
    });
  }

  private async readDiff(path: string): Promise<void> {
    this.diff.set({ kind: 'loading' });
    const result = await this.repoFiles.diff(this.host(), this.paneId(), path);
    if (this.selected() !== path) {
      return;
    }
    if (!result.ok) {
      if (this.takeFatal(result.code)) {
        return;
      }
      this.diff.set(
        result.code === 'not_found' ? { kind: 'gone' } : { kind: 'failed', reason: result.message }
      );
      return;
    }
    const data = result.data;
    this.diff.set({
      kind: 'diff',
      change: data.change,
      binary: data.binary,
      lines: parseUnifiedDiff(data.diff),
      truncated: data.truncated,
    });
  }

  // ---- goto --------------------------------------------------------------

  protected onGotoInput(event: Event): void {
    this.goto.set((event.target as HTMLInputElement).value);
    this.gotoError.set(null);
  }

  /**
   * The bridge is the authority on whether a path is in the checkout, so the
   * field asks it rather than searching the partial tree the panel happens
   * to hold. A directory answers `not_a_file`, which is how one is opened.
   */
  protected async submitGoto(event: Event): Promise<void> {
    event.preventDefault();
    const path = normalizeRepoPath(this.goto());
    if (!path) {
      return;
    }
    const probe = await this.repoFiles.read(this.host(), this.paneId(), path);
    if (probe.ok) {
      this.gotoError.set(null);
      await this.reveal(path);
      this.openFile(path);
      return;
    }
    if (this.takeFatal(probe.code)) {
      return;
    }
    if (probe.code === 'not_a_file') {
      this.gotoError.set(null);
      await this.reveal(path);
      this.expanded.update((set) => new Set(set).add(path));
      if (!this.dirs().has(path)) {
        void this.loadDir(path);
      }
      this.surface.set('browser');
      return;
    }
    if (probe.code === 'file_too_large') {
      // Too big to READ is still a real path: select it and state why.
      this.gotoError.set(null);
      await this.reveal(path);
      this.selected.set(path);
      this.surface.set('viewer');
      this.content.set({ kind: 'too-large', reason: probe.message });
      void this.readDiff(path);
      return;
    }
    this.gotoError.set(
      fill(COPY.files.gotoMissing, { repo: this.project()?.repo_name ?? this.host(), path })
    );
  }

  /** Open and load every ancestor of `path`, so the tree shows where it is. */
  private async reveal(path: string): Promise<void> {
    const parts = path.split('/');
    for (let i = 1; i < parts.length; i++) {
      const ancestor = parts.slice(0, i).join('/');
      this.expanded.update((set) => new Set(set).add(ancestor));
      if (!this.dirs().has(ancestor)) {
        await this.loadDir(ancestor);
      }
    }
  }
}
