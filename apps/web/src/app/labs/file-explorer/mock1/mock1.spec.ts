import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { FileBrowser } from './file-browser';
import { FileViewer } from './file-viewer';
import { FIXTURE_TREE, indexTree, normalizeRepoPath } from './fixture';
import { LabFrame } from '../../lab-frame';
import { DEFAULT_SPLIT, FileExplorerMock1, SPLIT_STORAGE_KEY, loadSplit } from './mock1';

const HEX = /#[0-9a-fA-F]{3,8}\b/g;

describe('labs/file-explorer/mock1', () => {
  let fixture: ComponentFixture<FileExplorerMock1>;
  let el: HTMLElement;

  async function settle(): Promise<void> {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  beforeEach(async () => {
    localStorage.removeItem(SPLIT_STORAGE_KEY);
    TestBed.configureTestingModule({
      imports: [FileExplorerMock1],
      providers: [provideZonelessChangeDetection(), provideRouter([])],
    });
    fixture = TestBed.createComponent(FileExplorerMock1);
    el = fixture.nativeElement as HTMLElement;
    await settle();
  });

  afterEach(() => localStorage.removeItem(SPLIT_STORAGE_KEY));

  it('says it is a lab, and which one', () => {
    const band = el.querySelector('[data-lab-marker]');
    expect(band?.textContent).toContain('lab');
    expect(band?.textContent).toContain('file-explorer/mock1');
    expect(band?.textContent).toContain('not the product');
  });

  it('starts with the panel collapsed and a visible toggle on the repo name', () => {
    const toggle = el.querySelector<HTMLButtonElement>('[data-panel-toggle]')!;
    expect(toggle).not.toBeNull();
    expect(toggle.closest('.repo')?.querySelector('.repo-name')).not.toBeNull();
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(el.querySelector('#file-panel')).toBeNull();
  });

  it('opens the panel: goto bar, body, status line', async () => {
    el.querySelector<HTMLButtonElement>('[data-panel-toggle]')!.click();
    await settle();
    const panel = el.querySelector('#file-panel')!;
    expect(panel).not.toBeNull();
    expect(panel.querySelector('.goto input')).not.toBeNull();
    expect(panel.querySelector('.panel-body')).not.toBeNull();
    expect(panel.querySelector('[data-status-line]')).not.toBeNull();
    expect(el.querySelector('[data-splitter]')).not.toBeNull();
  });

  it('opens a pasted path in the viewer and describes it in the status line', async () => {
    el.querySelector<HTMLButtonElement>('[data-panel-toggle]')!.click();
    await settle();
    const input = el.querySelector<HTMLInputElement>('.goto input')!;
    input.value = './docs/how-to/file-panel.md';
    input.dispatchEvent(new Event('input'));
    el.querySelector<HTMLFormElement>('.goto')!.dispatchEvent(new Event('submit'));
    await settle();

    expect(el.querySelector('app-file-viewer .path')?.textContent).toContain(
      'docs/how-to/file-panel.md'
    );
    const status = el.querySelector('[data-status-line]')!.textContent!;
    expect(status).toContain('untracked');
    expect(status).toContain('markdown');
  });

  it('keeps a bad path in the goto bar and says so', async () => {
    el.querySelector<HTMLButtonElement>('[data-panel-toggle]')!.click();
    await settle();
    const input = el.querySelector<HTMLInputElement>('.goto input')!;
    input.value = 'nope/missing.ts';
    input.dispatchEvent(new Event('input'));
    el.querySelector<HTMLFormElement>('.goto')!.dispatchEvent(new Event('submit'));
    await settle();
    expect(el.querySelector('.goto-error')?.textContent).toContain('nope/missing.ts');
    expect(el.querySelector<HTMLInputElement>('.goto input')!.value).toBe('nope/missing.ts');
  });

  it('offers both answers to both questions as visible controls', () => {
    const q1 = [...el.querySelectorAll('[data-question="key-bar"] [role="radio"]')].map((b) =>
      b.getAttribute('data-value')
    );
    const q2 = [...el.querySelectorAll('[data-question="split"] [role="radio"]')].map((b) =>
      b.getAttribute('data-value')
    );
    expect(q1).toEqual(['keep', 'auto-collapse']);
    expect(q2).toEqual(['remembered', 'fixed']);
    expect(el.querySelector('[data-readout="ratio"]')?.textContent).toContain('%');
  });

  it('auto-collapse folds the key bar while the panel has focus, keep does not', async () => {
    const bar = () => el.querySelector('app-key-bar .strip')!;
    // Start expanded regardless of the test browser's pointer.
    if (bar().getAttribute('aria-expanded') !== 'true') {
      (bar() as HTMLButtonElement).click();
      await settle();
    }
    el.querySelector<HTMLButtonElement>('[data-panel-toggle]')!.click();
    await settle();

    el.querySelector('#file-panel')!.dispatchEvent(new Event('pointerdown'));
    await settle();
    expect(bar().getAttribute('aria-expanded')).withContext('keep').toBe('true');

    el.querySelector<HTMLButtonElement>('[data-value="auto-collapse"]')!.click();
    await settle();
    expect(bar().getAttribute('aria-expanded'))
      .withContext('auto-collapse, panel focused')
      .toBe('false');

    el.querySelector('.terminal-wrap')!.dispatchEvent(new Event('pointerdown'));
    await settle();
    expect(bar().getAttribute('aria-expanded'))
      .withContext('auto-collapse, terminal focused')
      .toBe('true');
  });

  it('remembers a split in remembered mode and ignores storage in fixed mode', () => {
    localStorage.setItem(SPLIT_STORAGE_KEY, JSON.stringify({ hbox: 0.7, vbox: 0.3 }));
    expect(loadSplit()).toEqual({ hbox: 0.7, vbox: 0.3 });
    localStorage.setItem(SPLIT_STORAGE_KEY, JSON.stringify({ hbox: 5, vbox: 'x' }));
    expect(loadSplit()).toEqual({ hbox: 0.8, vbox: DEFAULT_SPLIT.vbox });
    localStorage.setItem(SPLIT_STORAGE_KEY, '{broken');
    expect(loadSplit()).toEqual({ ...DEFAULT_SPLIT });
  });

  it('offers rendered only for a type that has one', () => {
    const index = indexTree(FIXTURE_TREE);
    const render = (path: string) => {
      const viewer = TestBed.createComponent(FileViewer);
      viewer.componentRef.setInput('path', path);
      viewer.componentRef.setInput('file', index.get(path));
      viewer.componentRef.setInput('mode', 'source');
      viewer.detectChanges();
      return [...(viewer.nativeElement as HTMLElement).querySelectorAll('[data-mode]')]
        .filter((n) => n.tagName === 'BUTTON')
        .map((b) => b.getAttribute('data-mode'));
    };
    expect(render('apps/web/src/app/pane-detail/pane-detail.ts')).toEqual(['source', 'diff']);
    expect(render('README.md')).toEqual(['source', 'diff', 'rendered']);
  });

  it('has the fixture the layout needs to be judged against', () => {
    const nodes = [...indexTree(FIXTURE_TREE).entries()];
    const ts = nodes.find(
      ([p, n]) => p.endsWith('.ts') && n.kind === 'file' && n.git === 'modified'
    );
    expect(ts && ts[1].kind === 'file' && ts[1].diff.length).toBeGreaterThan(0);
    expect(nodes.some(([, n]) => n.kind === 'file' && n.renderable)).toBeTrue();
    expect(nodes.some(([, n]) => n.kind === 'dir' && n.git === 'untracked')).toBeTrue();
    expect(Math.max(...nodes.map(([p]) => p.split('/').length))).toBeGreaterThanOrEqual(5);
  });

  it('normalizes paths the way agents print them', () => {
    expect(normalizeRepoPath('  ./apps/web/src/main.ts:12:4 ')).toBe('apps/web/src/main.ts');
    expect(normalizeRepoPath('"/docs/"')).toBe('docs');
  });

  it('carries no raw hex in any lab stylesheet (tokens are not exempt)', () => {
    const offenders: string[] = [];
    for (const component of [LabFrame, FileExplorerMock1, FileBrowser, FileViewer]) {
      const styles = (component as unknown as { ɵcmp: { styles?: string[] } }).ɵcmp.styles ?? [];
      expect(styles.length).withContext(component.name).toBeGreaterThan(0);
      for (const sheet of styles)
        for (const m of sheet.match(HEX) ?? []) offenders.push(`${component.name}: ${m}`);
    }
    expect(offenders).toEqual([]);
  });
});
