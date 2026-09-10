import { describe, expect, it } from 'vitest';
import { WorkspaceTabNameCache } from './names.js';

/**
 * Tier-3 (lane LC3) cache invalidation tests. Per CONTRACT-TIER3.md section
 * 6, herdr's cascading closes are event-lossy (section 5.6) — a
 * `workspace.closed`/`tab.closed` may be the ONLY event a client ever
 * receives for everything torn down underneath it. These tests feed the
 * cache synthetic events the way `HostRuntime.handlePushedEvent` would and
 * assert nested tab/pane entries are purged even without a matching child
 * `*.closed` event ever arriving — this does not exercise real herdr.
 */
describe('WorkspaceTabNameCache — tier-3 cache invalidation', () => {
  it('updates a workspace label in place on workspace.renamed without touching tabs/panes', () => {
    const names = new WorkspaceTabNameCache();
    names.setWorkspace('ws-1', 'Inbox');
    names.setTab('tab-1', 'Main', 'ws-1');
    names.setPanePlacement('pane-1', 'ws-1', 'tab-1');

    names.setWorkspace('ws-1', 'Renamed Inbox');

    expect(names.workspaceName('ws-1')).toBe('Renamed Inbox');
    expect(names.tabName('tab-1')).toBe('Main');
    expect(names.panePlacement('pane-1')).toEqual({ workspace_id: 'ws-1', tab_id: 'tab-1' });
  });

  it('updates a tab label in place on tab.renamed', () => {
    const names = new WorkspaceTabNameCache();
    names.setTab('tab-1', 'Main', 'ws-1');

    names.setTab('tab-1', 'Renamed Tab', 'ws-1');

    expect(names.tabName('tab-1')).toBe('Renamed Tab');
  });

  it('inserts new workspace/tab entries on workspace.created/tab.created', () => {
    const names = new WorkspaceTabNameCache();

    names.setWorkspace('ws-2', 'New Workspace');
    names.setTab('tab-2', 'New Tab', 'ws-2');

    expect(names.workspaceName('ws-2')).toBe('New Workspace');
    expect(names.tabName('tab-2')).toBe('New Tab');
  });

  it("purges a closed workspace's own entry", () => {
    const names = new WorkspaceTabNameCache();
    names.setWorkspace('ws-1', 'Inbox');

    const purged = names.purgeWorkspace('ws-1');

    expect(names.workspaceName('ws-1')).toBe('ws-1'); // falls back to raw id — entry gone
    expect(purged.tabIds).toEqual([]);
    expect(purged.paneIds).toEqual([]);
  });

  it('purges every tab AND pane nested under a closed workspace, even with no per-child close event', () => {
    const names = new WorkspaceTabNameCache();
    names.setWorkspace('ws-1', 'Inbox');
    names.setTab('tab-1', 'Main', 'ws-1');
    names.setTab('tab-2', 'Side', 'ws-1');
    names.setTab('tab-other', 'Unrelated', 'ws-other'); // different workspace — must survive
    names.setPanePlacement('pane-1', 'ws-1', 'tab-1');
    names.setPanePlacement('pane-2', 'ws-1', 'tab-2');
    names.setPanePlacement('pane-3', 'ws-other', 'tab-other');

    // Simulates handling a bare `workspace.closed` event: no `tab.closed`/
    // `pane.closed` ever arrived for tab-1/tab-2/pane-1/pane-2.
    const purged = names.purgeWorkspace('ws-1');

    expect(purged.tabIds.sort()).toEqual(['tab-1', 'tab-2']);
    expect(purged.paneIds.sort()).toEqual(['pane-1', 'pane-2']);
    expect(names.tabName('tab-1')).toBe('tab-1'); // fell back to raw id — gone from cache
    expect(names.tabName('tab-2')).toBe('tab-2');
    expect(names.panePlacement('pane-1')).toBeUndefined();
    expect(names.panePlacement('pane-2')).toBeUndefined();
    // Unrelated workspace's tab/pane are untouched.
    expect(names.tabName('tab-other')).toBe('Unrelated');
    expect(names.panePlacement('pane-3')).toEqual({
      workspace_id: 'ws-other',
      tab_id: 'tab-other',
    });
  });

  it('purges every pane nested under a closed tab, even with no per-pane close event', () => {
    const names = new WorkspaceTabNameCache();
    names.setTab('tab-1', 'Main', 'ws-1');
    names.setPanePlacement('pane-1', 'ws-1', 'tab-1');
    names.setPanePlacement('pane-2', 'ws-1', 'tab-1'); // split tab — more than one pane
    names.setPanePlacement('pane-3', 'ws-1', 'tab-2'); // different tab — must survive

    const purged = names.purgeTab('tab-1');

    expect(purged.paneIds.sort()).toEqual(['pane-1', 'pane-2']);
    expect(names.panePlacement('pane-1')).toBeUndefined();
    expect(names.panePlacement('pane-2')).toBeUndefined();
    expect(names.panePlacement('pane-3')).toEqual({ workspace_id: 'ws-1', tab_id: 'tab-2' });
  });

  it("moves a pane's cache entry to its new workspace/tab on pane.moved", () => {
    const names = new WorkspaceTabNameCache();
    names.setWorkspace('ws-1', 'Inbox');
    names.setWorkspace('ws-2', 'Archive');
    names.setTab('tab-1', 'Main', 'ws-1');
    names.setTab('tab-2', 'Other', 'ws-2');
    names.setPanePlacement('pane-1', 'ws-1', 'tab-1');

    // Simulates the bridge applying a `pane.moved` event.
    names.setPanePlacement('pane-1', 'ws-2', 'tab-2');

    expect(names.panePlacement('pane-1')).toEqual({ workspace_id: 'ws-2', tab_id: 'tab-2' });
  });

  // --- git provenance (worktree) ------------------------------------------
  //
  // `worktree` already arrives on the same `workspace.list` call `refresh()`
  // makes; these assert the cache stops discarding it, and — critically —
  // that a label-only update (`workspace.renamed`, which carries no
  // worktree) does not wipe it.

  const WORKTREE = {
    repo_key: 'gh:wakaru44/kanhrd',
    repo_name: 'kanhrd',
    repo_root: '/home/op/src/kanhrd',
    checkout_path: '/home/op/src/kanhrd',
    is_linked_worktree: false,
  };

  it("caches a workspace's worktree alongside its label", () => {
    const names = new WorkspaceTabNameCache();
    names.setWorkspace('ws-1', 'Inbox', WORKTREE);

    expect(names.workspaceWorktree('ws-1')).toEqual(WORKTREE);
    expect(names.workspaceName('ws-1')).toBe('Inbox');
  });

  it('returns undefined for a workspace outside any repository', () => {
    const names = new WorkspaceTabNameCache();
    names.setWorkspace('ws-1', 'Inbox');

    expect(names.workspaceWorktree('ws-1')).toBeUndefined();
    expect(names.workspaceName('ws-1')).toBe('Inbox');
  });

  it('preserves a cached worktree across a label-only update (workspace.renamed)', () => {
    const names = new WorkspaceTabNameCache();
    names.setWorkspace('ws-1', 'Inbox', WORKTREE);

    names.setWorkspace('ws-1', 'Renamed Inbox');

    expect(names.workspaceName('ws-1')).toBe('Renamed Inbox');
    expect(names.workspaceWorktree('ws-1')).toEqual(WORKTREE);
  });

  it('returns undefined for a workspace id the cache has never seen', () => {
    const names = new WorkspaceTabNameCache();

    expect(names.workspaceWorktree('ws-never')).toBeUndefined();
  });

  it('removes a pane from placement tracking on removePane (pane.closed)', () => {
    const names = new WorkspaceTabNameCache();
    names.setPanePlacement('pane-1', 'ws-1', 'tab-1');

    names.removePane('pane-1');

    expect(names.panePlacement('pane-1')).toBeUndefined();
  });
});
