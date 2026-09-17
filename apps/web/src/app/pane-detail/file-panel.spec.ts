import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import type { Pane, RepoStatusEntry } from '@kanhrd/schema';
import { COPY, fill } from '../shared/copy';
import {
  RepoFilesService,
  type RepoFilesCapability,
  type RepoFilesResult,
} from '../state/repo-files.service';
import { FilePanel, gitByPath, normalizeRepoPath } from './file-panel';

/**
 * Real panes are not the mock's fixture. Every test below is one of the
 * ways real data is NOT perfect — no repository, a host whose files are on
 * another machine, a bridge with no file methods, a binary file, a file over
 * the cap, a directory the bridge stopped listing, a path that vanished —
 * and each one asserts the panel STATES it rather than rendering an empty
 * box (docs/UX-GUIDELINES.md, "Reliability states tell the truth").
 */

const CAPABILITY: RepoFilesCapability = {
  statusPollIntervalMs: 2000,
  fileReadMaxBytes: 1_048_576,
  diffMaxBytes: 262_144,
  treeMaxEntries: 1000,
  statusMaxEntries: 1000,
};

function ok<T>(data: T): RepoFilesResult<T> {
  return { ok: true, data };
}
function err<T>(code: string, message = 'because'): RepoFilesResult<T> {
  return { ok: false, code: code as never, message };
}

function project(files_local?: boolean): NonNullable<Pane['project']> {
  return {
    repo_name: 'kanhrd',
    checkout_path: '/home/op/src/kanhrd',
    is_linked_worktree: false,
    ...(files_local === undefined ? {} : { files_local }),
  };
}

/** A stub with the same shape as the service, so no socket is involved. */
class FakeRepoFiles {
  capabilityValue: RepoFilesCapability | null = CAPABILITY;
  statusResult: RepoFilesResult<unknown> = ok({
    checkout_path: '/home/op/src/kanhrd',
    branch: 'agent/lane-c',
    head: 'abc1234',
    entries: [] as RepoStatusEntry[],
    truncated: false,
  });
  treeResults = new Map<string, RepoFilesResult<unknown>>();
  readResult: RepoFilesResult<unknown> = ok({
    path: 'a.ts',
    size: 10,
    mtime_ms: 0,
    binary: false,
    encoding: 'utf-8',
    content: 'one\ntwo',
  });
  diffResult: RepoFilesResult<unknown> = ok({
    path: 'a.ts',
    change: 'unchanged',
    binary: false,
    diff: '',
    truncated: false,
  });
  readonly treeCalls: string[] = [];
  statusCalls = 0;

  capability(): RepoFilesCapability | null {
    return this.capabilityValue;
  }
  async status(): Promise<RepoFilesResult<unknown>> {
    this.statusCalls++;
    return this.statusResult;
  }
  async tree(_host: string, _pane: string, path?: string): Promise<RepoFilesResult<unknown>> {
    this.treeCalls.push(path ?? '');
    return (
      this.treeResults.get(path ?? '') ?? ok({ path: path ?? '', entries: [], truncated: false })
    );
  }
  async read(): Promise<RepoFilesResult<unknown>> {
    return this.readResult;
  }
  async diff(): Promise<RepoFilesResult<unknown>> {
    return this.diffResult;
  }
}

function entry(name: string, type: 'file' | 'directory', ignored = false) {
  return { name, path: name, type, ignored, ...(type === 'file' ? { size: 1 } : {}) };
}

describe('pane-detail/file-panel', () => {
  let fake: FakeRepoFiles;
  let fixture: ComponentFixture<FilePanel>;

  async function mount(paneProject: Pane['project'] | null, paused = false) {
    fixture = TestBed.createComponent(FilePanel);
    fixture.componentRef.setInput('host', 'laptop');
    fixture.componentRef.setInput('paneId', 'p1');
    fixture.componentRef.setInput('project', paneProject);
    fixture.componentRef.setInput('paused', paused);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  function text(el: HTMLElement): string {
    return el.textContent ?? '';
  }

  beforeEach(() => {
    fake = new FakeRepoFiles();
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection(), { provide: RepoFilesService, useValue: fake }],
    });
  });

  // --- the states real data forces --------------------------------------

  it('states that a pane with no repository has none, and asks the bridge nothing', async () => {
    const el = await mount(null);

    expect(text(el)).toContain(COPY.files.noRepo);
    expect(text(el)).toContain(COPY.files.noRepoBody);
    expect(el.querySelector('app-file-tree')).toBeNull();
    expect(fake.treeCalls.length).toBe(0);
    expect(fake.statusCalls).toBe(0);
  });

  it('names the host when the files are on another machine, and reads nothing', async () => {
    const el = await mount(project(undefined));

    expect(text(el)).toContain(COPY.files.notLocal);
    expect(text(el)).toContain(fill(COPY.files.notLocalBody, { host: 'laptop' }));
    expect(text(el)).toContain('laptop');
    expect(fake.treeCalls.length).toBe(0);
  });

  it('falls back to not-local when the bridge refuses mid-session', async () => {
    fake.treeResults.set('', err('files_not_local', 'host files: false'));
    const el = await mount(project(true));

    expect(text(el)).toContain(COPY.files.notLocal);
  });

  it('states a checkout that stopped being a repository, with a retry', async () => {
    fake.treeResults.set('', err('not_a_repository'));
    const el = await mount(project(true));

    expect(text(el)).toContain(COPY.files.notARepo);
    expect(el.querySelector('button.retry')).not.toBeNull();
  });

  it('states a bridge machine with no git', async () => {
    fake.treeResults.set('', err('git_unavailable'));
    expect(text(await mount(project(true)))).toContain(COPY.files.gitMissing);
  });

  it('states a pane the bridge no longer knows', async () => {
    fake.treeResults.set('', err('pane_not_found'));
    expect(text(await mount(project(true)))).toContain(COPY.files.checkoutGone);
  });

  it('never swallows an error it has no state of its own for', async () => {
    fake.statusResult = err('git_failed', 'fatal: bad object HEAD');
    const el = await mount(project(true));

    expect(text(el)).toContain('fatal: bad object HEAD');
    expect(el.querySelector('[role="alert"]')).not.toBeNull();
    expect(el.querySelector('button.retry')).not.toBeNull();
  });

  // --- the tree ----------------------------------------------------------

  it('asks for the root only, and for a directory only when it is expanded', async () => {
    fake.treeResults.set(
      '',
      ok({
        path: '',
        entries: [entry('src', 'directory'), entry('a.ts', 'file')],
        truncated: false,
      })
    );
    fake.treeResults.set(
      'src',
      ok({ path: 'src', entries: [entry('b.ts', 'file')], truncated: false })
    );
    const el = await mount(project(true));

    expect(fake.treeCalls).toEqual(['']);
    el.querySelector<HTMLButtonElement>('[data-path="src"]')?.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fake.treeCalls).toEqual(['', 'src']);
  });

  it('says so when the bridge stopped listing a directory', async () => {
    fake.treeResults.set('', ok({ path: '', entries: [entry('a.ts', 'file')], truncated: true }));
    expect(text(await mount(project(true)))).toContain(COPY.files.treeTruncated);
  });

  it('marks an ignored entry in words, not only in colour', async () => {
    fake.treeResults.set(
      '',
      ok({ path: '', entries: [entry('node_modules', 'directory', true)], truncated: false })
    );
    const el = await mount(project(true));

    expect(text(el)).toContain(COPY.files.ignored);
    // Listed, never walked: one entry, one request.
    expect(fake.treeCalls).toEqual(['']);
  });

  // --- a file the bridge will not send -----------------------------------

  it('states a binary file and its size rather than an empty source view', async () => {
    fake.treeResults.set(
      '',
      ok({ path: '', entries: [entry('logo.png', 'file')], truncated: false })
    );
    fake.readResult = ok({ path: 'logo.png', size: 2048, mtime_ms: 0, binary: true });
    const el = await mount(project(true));

    el.querySelector<HTMLButtonElement>('[data-path="logo.png"]')?.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(text(el)).toContain(COPY.files.binary);
  });

  it("states an oversized file in the bridge's own words", async () => {
    fake.treeResults.set(
      '',
      ok({ path: '', entries: [entry('big.log', 'file')], truncated: false })
    );
    fake.readResult = err('file_too_large', '4194304 bytes exceeds the 1048576 byte cap');
    const el = await mount(project(true));

    el.querySelector<HTMLButtonElement>('[data-path="big.log"]')?.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(text(el)).toContain(COPY.files.tooLarge);
    expect(text(el)).toContain('1048576');
  });

  it('states a path that vanished while the panel was open, and keeps the tree usable', async () => {
    fake.treeResults.set('', ok({ path: '', entries: [entry('a.ts', 'file')], truncated: false }));
    fake.readResult = err('not_found');
    fake.diffResult = err('not_found');
    const el = await mount(project(true));

    el.querySelector<HTMLButtonElement>('[data-path="a.ts"]')?.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(text(el)).toContain(COPY.files.pathGone);

    // At panel widths below the side-by-side threshold the viewer replaced
    // the tree, so "still usable" means the way back is still there and the
    // tree is intact behind it — not that both are on screen at once.
    const back = el.querySelector<HTMLButtonElement>('[data-surface="browser"]');
    expect(back).not.toBeNull();
    back!.click();
    fixture.detectChanges();

    expect(el.querySelector('[data-path="a.ts"]')).not.toBeNull();
  });

  // --- the repo changing under the panel ---------------------------------

  it('keeps the last good status and marks it, rather than blanking it', async () => {
    const el = await mount(project(true));
    expect(text(el)).toContain('agent/lane-c');

    fake.statusResult = err('git_failed', 'index.lock exists');
    await (fixture.componentInstance as unknown as { retry(): void }).retry();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(text(el)).toContain('agent/lane-c');
    expect(text(el)).toContain(COPY.files.statusStale);
  });

  it('polls nothing while the pane is paused', async () => {
    await mount(project(true), true);
    const after = fake.statusCalls;
    jasmine.clock().install();
    jasmine.clock().tick(CAPABILITY.statusPollIntervalMs * 3);
    jasmine.clock().uninstall();
    expect(fake.statusCalls).toBe(after);
  });
});

// --- pure helpers --------------------------------------------------------

describe('pane-detail/file-panel path handling', () => {
  it('normalizes what the operator pastes to a checkout-relative path', () => {
    expect(normalizeRepoPath('  ./src/app.ts  ')).toBe('src/app.ts');
    expect(normalizeRepoPath('/src/app.ts')).toBe('src/app.ts');
    expect(normalizeRepoPath('src/app/')).toBe('src/app');
    expect(normalizeRepoPath('')).toBe('');
  });

  it('marks a changed file and every directory above it', () => {
    const map = gitByPath([
      { path: 'apps/web/src/a.ts', kind: 'changed', index: '.', worktree: 'M' },
      { path: 'new.md', kind: 'untracked', index: '?', worktree: '?' },
    ]);

    expect(map.get('apps/web/src/a.ts')).toBe('modified');
    expect(map.get('apps')).toBe('modified');
    expect(map.get('apps/web')).toBe('modified');
    expect(map.get('new.md')).toBe('untracked');
    expect(map.get('untouched')).toBeUndefined();
  });

  it("drops git's trailing slash on an untracked directory", () => {
    const map = gitByPath([{ path: 'scratch/', kind: 'untracked', index: '?', worktree: '?' }]);
    expect(map.get('scratch')).toBe('untracked');
  });
});
