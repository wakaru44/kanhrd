import { describe, expect, it } from 'vitest';
import type { HerdrPaneInfo } from '@kanhrd/schema';
import { WorkspaceTabNameCache } from './names.js';
import { projectPane } from './project.js';

function pane(overrides: Partial<HerdrPaneInfo> = {}): HerdrPaneInfo {
  return {
    pane_id: 'pane-1',
    workspace_id: 'ws-1',
    tab_id: 'tab-1',
    agent_status: 'working',
    revision: 1,
    ...overrides,
  };
}

describe('projectPane', () => {
  it('joins workspace/tab names from the cache and stamps host', () => {
    const names = new WorkspaceTabNameCache();
    names.setWorkspace('ws-1', 'Inbox');
    names.setTab('tab-1', 'Main');

    const result = projectPane('local', pane(), names);

    expect(result).toEqual({
      id: 'pane-1',
      host: 'local',
      workspace: { id: 'ws-1', name: 'Inbox' },
      tab: { id: 'tab-1', name: 'Main' },
      agent_status: 'working',
    });
  });

  it('falls back to the raw id when a name is missing from the cache', () => {
    const names = new WorkspaceTabNameCache();

    const result = projectPane('local', pane(), names);

    expect(result.workspace).toEqual({ id: 'ws-1', name: 'ws-1' });
    expect(result.tab).toEqual({ id: 'tab-1', name: 'tab-1' });
  });

  it('prefers display_agent over agent, and omits agent/title when both absent', () => {
    const names = new WorkspaceTabNameCache();

    const withBoth = projectPane(
      'local',
      pane({ agent: 'claude', display_agent: 'Claude' }),
      names
    );
    expect(withBoth.agent).toEqual({ name: 'Claude' });

    const agentOnly = projectPane('local', pane({ agent: 'claude' }), names);
    expect(agentOnly.agent).toEqual({ name: 'claude' });

    const neither = projectPane('local', pane(), names);
    expect(neither.agent).toBeUndefined();
    expect(neither.title).toBeUndefined();
  });

  it('carries through title when present', () => {
    const names = new WorkspaceTabNameCache();
    const result = projectPane('local', pane({ title: 'fix the bug' }), names);
    expect(result.title).toBe('fix the bug');
  });

  // --- herdr's user-authored pane label ------------------------------------

  it('forwards a non-empty label', () => {
    const names = new WorkspaceTabNameCache();
    const result = projectPane('local', pane({ label: 'fix the backlog storm' }), names);
    expect(result.label).toBe('fix the backlog storm');
  });

  it('omits the label entirely when herdr reports null, absent or empty', () => {
    const names = new WorkspaceTabNameCache();

    // `null` is herdr's cleared form; the projection must not emit `null`.
    const cleared = projectPane('local', pane({ label: null as unknown as string }), names);
    expect('label' in cleared).toBe(false);

    const absent = projectPane('local', pane(), names);
    expect('label' in absent).toBe(false);

    const empty = projectPane('local', pane({ label: '' }), names);
    expect('label' in empty).toBe(false);
  });

  // --- git provenance joined from the owning workspace ---------------------

  it("joins project provenance from the owning workspace's worktree, dropping repo_key/repo_root", () => {
    const names = new WorkspaceTabNameCache();
    names.setWorkspace('ws-1', 'Inbox', {
      repo_key: 'gh:wakaru44/kanhrd',
      repo_name: 'kanhrd',
      repo_root: '/home/op/src/kanhrd',
      checkout_path: '/home/op/src/kanhrd',
      is_linked_worktree: false,
    });

    const result = projectPane('local', pane(), names);

    expect(result.project).toEqual({
      repo_name: 'kanhrd',
      checkout_path: '/home/op/src/kanhrd',
      is_linked_worktree: false,
    });
  });

  it('carries is_linked_worktree for a linked worktree', () => {
    const names = new WorkspaceTabNameCache();
    names.setWorkspace('ws-1', 'Inbox', {
      repo_key: 'gh:wakaru44/kanhrd',
      repo_name: 'kanhrd',
      repo_root: '/home/op/src/kanhrd',
      checkout_path: '/home/op/worktrees/lane-a',
      is_linked_worktree: true,
    });

    expect(projectPane('local', pane(), names).project?.is_linked_worktree).toBe(true);
  });

  it('omits project when the owning workspace has no worktree', () => {
    const names = new WorkspaceTabNameCache();
    names.setWorkspace('ws-1', 'Inbox');

    const result = projectPane('local', pane(), names);

    expect('project' in result).toBe(false);
  });

  it('carries status_since when the caller observed the transition, and omits the key otherwise', () => {
    const names = new WorkspaceTabNameCache();
    names.setWorkspace('ws-1', 'Inbox');

    expect(projectPane('local', pane(), names, 1_700_000_000_000).status_since).toBe(
      1_700_000_000_000
    );
    // No observation -> no key. Not `0`, not `null`, not the current time:
    // the card renders nothing rather than a fabricated duration.
    expect('status_since' in projectPane('local', pane(), names)).toBe(false);
    expect('status_since' in projectPane('local', pane(), names, undefined)).toBe(false);
  });
});
