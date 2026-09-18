import {
  Component,
  DestroyRef,
  ElementRef,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { DEFAULT_KEY_BAR_CELLS, KeyBarModifiers } from '../../../pane-detail/key-bar-cells';
import { KeyBar } from '../../../pane-detail/key-bar';
import { LucideArrowLeft, LucideChevronRight } from '../../../shared/icons';
import { COPY } from '../../../shared/copy';
import { LabFrame } from '../../lab-frame';
import { FileBrowser } from './file-browser';
import { FileViewer, type ViewerMode } from './file-viewer';
import {
  FIXTURE_CHECKOUT_PATH,
  FIXTURE_REPO_NAME,
  FIXTURE_TREE,
  indexTree,
  normalizeRepoPath,
  type FixtureFile,
} from './fixture';

/** Question 1: what the key bar does while the file panel has focus. */
export type KeyBarMode = 'keep' | 'auto-collapse';

/** Question 2: whether a dragged split survives a reload, or every open starts at the default. */
export type SplitMode = 'remembered' | 'fixed';

export type Axis = 'hbox' | 'vbox';

/** Terminal share of the split, per axis. The panel gets the rest. */
export const DEFAULT_SPLIT: Readonly<Record<Axis, number>> = { hbox: 0.6, vbox: 0.5 };
export const SPLIT_MIN = 0.2;
export const SPLIT_MAX = 0.8;
export const SPLIT_STORAGE_KEY = 'kanhrd.labs.file-explorer-mock1.split';

/** Below this panel width the browser and viewer stop sitting side by side. */
export const SIDE_BY_SIDE_MIN_PX = 560;

const LAB_NAME = 'file-explorer/mock1';

export function clampSplit(ratio: number): number {
  return Math.min(SPLIT_MAX, Math.max(SPLIT_MIN, ratio));
}

export function loadSplit(storage: Pick<Storage, 'getItem'> = localStorage): Record<Axis, number> {
  try {
    const raw = JSON.parse(storage.getItem(SPLIT_STORAGE_KEY) ?? 'null') as Partial<
      Record<Axis, unknown>
    > | null;
    const pick = (axis: Axis) =>
      typeof raw?.[axis] === 'number' ? clampSplit(raw[axis] as number) : DEFAULT_SPLIT[axis];
    return { hbox: pick('hbox'), vbox: pick('vbox') };
  } catch {
    return { ...DEFAULT_SPLIT };
  }
}

/**
 * `/labs/file-explorer/mock1` — a static mock of the read-only file panel
 * inside a FAKE pane-detail view. No bridge, no xterm, no `PaneDetail`: a
 * styled box stands in for the terminal. The key bar is the real one, fed
 * no transport, because the keyboard reserve it measures is exactly what the
 * layout has to be judged against on a phone.
 *
 * It answers nothing. Both open questions (key bar while the panel has
 * focus; remembered vs fixed split) are lab controls in the band, so the
 * operator settles them on the device.
 */
@Component({
  selector: 'app-labs-file-explorer-mock1',
  imports: [
    RouterLink,
    LabFrame,
    KeyBar,
    FileBrowser,
    FileViewer,
    LucideArrowLeft,
    LucideChevronRight,
  ],
  templateUrl: './mock1.html',
  styleUrl: './mock1.scss',
})
export class FileExplorerMock1 {
  protected readonly labName = LAB_NAME;
  protected readonly copy = COPY;
  protected readonly repoName = FIXTURE_REPO_NAME;
  protected readonly checkoutPath = FIXTURE_CHECKOUT_PATH;
  protected readonly tree = FIXTURE_TREE;
  private readonly index = indexTree(FIXTURE_TREE);

  protected readonly controlsOpen = signal(true);

  // ---- layout -----------------------------------------------------------
  protected readonly panelOpen = signal(false);
  protected readonly axis = signal<Axis>(this.readAxis());

  protected readonly splitMode = signal<SplitMode>('remembered');
  private readonly splits = signal<Record<Axis, number>>(loadSplit());
  protected readonly ratio = computed(() => this.splits()[this.axis()]);
  protected readonly dragging = signal(false);

  private readonly split = viewChild<ElementRef<HTMLElement>>('split');
  private readonly panel = viewChild<ElementRef<HTMLElement>>('panel');
  protected readonly panelWidth = signal(0);
  protected readonly bodyLayout = computed(() =>
    this.panelWidth() >= SIDE_BY_SIDE_MIN_PX ? 'side-by-side' : 'single'
  );
  protected readonly surface = signal<'browser' | 'viewer'>('browser');

  // ---- key bar ----------------------------------------------------------
  protected readonly keyBarMode = signal<KeyBarMode>('keep');
  protected readonly keyBarCells = DEFAULT_KEY_BAR_CELLS;
  protected readonly keyBarModifiers = new KeyBarModifiers();
  protected readonly keyBarReserve = signal(0);
  private readonly keyBarChosen = signal(
    typeof matchMedia === 'function' && matchMedia('(any-pointer: coarse)').matches
  );
  protected readonly panelFocused = signal(false);
  protected readonly keyBarExpanded = computed(
    () => this.keyBarChosen() && !(this.keyBarMode() === 'auto-collapse' && this.panelFocused())
  );
  protected readonly lastKeys = signal<string>('none');

  // ---- panel content ----------------------------------------------------
  protected readonly expanded = signal<ReadonlySet<string>>(
    new Set([
      'apps',
      'apps/web',
      'apps/web/src',
      'apps/web/src/app',
      'apps/web/src/app/pane-detail',
      'scratch',
    ])
  );
  protected readonly selected = signal<string | null>(
    'apps/web/src/app/pane-detail/pane-detail.ts'
  );
  protected readonly selectedFile = computed<FixtureFile | null>(() => {
    const node = this.selected() ? this.index.get(this.selected()!) : undefined;
    return node?.kind === 'file' ? node : null;
  });
  protected readonly viewerMode = signal<ViewerMode>('diff');
  protected readonly goto = signal('');
  protected readonly gotoError = signal<string | null>(null);

  protected readonly repoSummary = computed(() => {
    let modified = 0;
    let untracked = 0;
    for (const node of this.index.values()) {
      if (node.kind !== 'file') continue;
      if (node.git === 'modified') modified++;
      if (node.git === 'untracked') untracked++;
    }
    return `${modified} modified · ${untracked} untracked`;
  });

  constructor() {
    const destroyRef = inject(DestroyRef);

    if (typeof matchMedia === 'function') {
      const query = matchMedia('(orientation: portrait)');
      const onChange = () => this.axis.set(this.readAxis());
      query.addEventListener('change', onChange);
      destroyRef.onDestroy(() => query.removeEventListener('change', onChange));
    }

    // The panel's own width decides side-by-side vs single — not the viewport.
    const observer =
      typeof ResizeObserver === 'function'
        ? new ResizeObserver((entries) => {
            for (const entry of entries) this.panelWidth.set(Math.round(entry.contentRect.width));
          })
        : null;
    effect((onCleanup) => {
      const el = this.panel()?.nativeElement;
      if (!el || !observer) return;
      observer.observe(el);
      onCleanup(() => observer.unobserve(el));
    });
    destroyRef.onDestroy(() => observer?.disconnect());
  }

  private readAxis(): Axis {
    return typeof matchMedia === 'function' && matchMedia('(orientation: portrait)').matches
      ? 'vbox'
      : 'hbox';
  }

  // ---- toggles ----------------------------------------------------------

  protected togglePanel(): void {
    const opening = !this.panelOpen();
    if (opening && this.splitMode() === 'fixed') this.splits.set({ ...DEFAULT_SPLIT });
    this.panelOpen.set(opening);
    if (!opening) this.panelFocused.set(false);
  }

  protected setSplitMode(mode: SplitMode): void {
    this.splitMode.set(mode);
    this.splits.set(mode === 'fixed' ? { ...DEFAULT_SPLIT } : loadSplit());
  }

  protected resetRemembered(): void {
    try {
      localStorage.removeItem(SPLIT_STORAGE_KEY);
    } catch {
      /* storage unavailable: nothing was remembered */
    }
    this.splits.set({ ...DEFAULT_SPLIT });
  }

  protected toggleKeyBar(): void {
    this.keyBarChosen.set(!this.keyBarExpanded());
    this.panelFocused.set(false);
  }

  protected onKeyBarKeys(keys: readonly string[]): void {
    // No transport: the keys go nowhere, and the band says what they would have been.
    this.lastKeys.set(
      keys.map((key, i) => (i === 0 ? this.keyBarModifiers.consume(key) : key)).join(' ')
    );
  }

  // ---- splitter ---------------------------------------------------------

  protected onSplitterDown(event: PointerEvent): void {
    event.preventDefault();
    (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
    this.dragging.set(true);
  }

  protected onSplitterMove(event: PointerEvent): void {
    if (!this.dragging()) return;
    const rect = this.split()?.nativeElement.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0) return;
    const ratio =
      this.axis() === 'hbox'
        ? (event.clientX - rect.left) / rect.width
        : (event.clientY - rect.top) / rect.height;
    this.setRatio(ratio, false);
  }

  protected onSplitterUp(): void {
    if (!this.dragging()) return;
    this.dragging.set(false);
    this.persist();
  }

  protected onSplitterKey(event: KeyboardEvent): void {
    const back = this.axis() === 'hbox' ? 'ArrowLeft' : 'ArrowUp';
    const fwd = this.axis() === 'hbox' ? 'ArrowRight' : 'ArrowDown';
    if (event.key !== back && event.key !== fwd) return;
    event.preventDefault();
    this.setRatio(this.ratio() + (event.key === fwd ? 0.05 : -0.05), true);
  }

  private setRatio(ratio: number, persist: boolean): void {
    const axis = this.axis();
    this.splits.update((s) => ({ ...s, [axis]: clampSplit(ratio) }));
    if (persist) this.persist();
  }

  private persist(): void {
    if (this.splitMode() !== 'remembered') return;
    try {
      localStorage.setItem(SPLIT_STORAGE_KEY, JSON.stringify(this.splits()));
    } catch {
      /* storage unavailable: the split lasts for this visit only */
    }
  }

  // ---- panel ------------------------------------------------------------

  protected toggleDir(path: string): void {
    this.expanded.update((set) => {
      const next = new Set(set);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }

  protected openFile(path: string): void {
    this.selected.set(path);
    this.reveal(path);
    this.surface.set('viewer');
  }

  protected submitGoto(event: Event): void {
    event.preventDefault();
    const path = normalizeRepoPath(this.goto());
    const node = this.index.get(path);
    if (!node) {
      this.gotoError.set(`not in ${this.repoName}: ${path || '(empty)'}`);
      return;
    }
    this.gotoError.set(null);
    if (node.kind === 'file') {
      this.openFile(path);
    } else {
      this.reveal(path);
      this.expanded.update((set) => new Set(set).add(path));
      this.surface.set('browser');
    }
  }

  protected onGotoInput(event: Event): void {
    this.goto.set((event.target as HTMLInputElement).value);
    this.gotoError.set(null);
  }

  private reveal(path: string): void {
    const parts = path.split('/');
    this.expanded.update((set) => {
      const next = new Set(set);
      for (let i = 1; i < parts.length; i++) next.add(parts.slice(0, i).join('/'));
      return next;
    });
  }
}
