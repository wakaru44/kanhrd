import type { HerdrTabInfo, HerdrWorkspaceDetail, HerdrWorkspaceWorktreeInfo } from "@kanhrd/schema";
import type { HerdrClient } from "./client.js";

/** A pane's current (workspace, tab) location, tracked so nested cache purges know what to drop. */
export interface PanePlacement {
  workspace_id: string;
  tab_id: string;
}

/**
 * Per-host workspace/tab id → name lookup. herdr's `PaneInfo` only carries
 * `workspace_id`/`tab_id`; the bridge joins against `workspace.list` /
 * `tab.list` to project `Pane.workspace.name` / `Pane.tab.name`.
 *
 * Refreshed on connect/reconnect (`refresh()`). Tier-3 (lane LC3) keeps it
 * warm afterward too: `setWorkspace`/`setTab` are called again on
 * `workspace.renamed`/`tab.renamed`/`*.created` so no full refetch is
 * needed on rename (see CONTRACT-TIER3.md section 6 — this closes the gap
 * tier-1 originally left).
 *
 * Also tracks tab→workspace and pane→(workspace,tab) parentage, purely so
 * `purgeWorkspace`/`purgeTab` can find every nested tab/pane cache entry to
 * drop. herdr's cascading closes are event-lossy (CONTRACT-TIER3.md section
 * 5.6) — a `workspace.closed` may be the ONLY event a client ever gets for
 * everything that was inside it, so the bridge must locally infer and purge
 * the rest rather than wait for child `*.closed` events that will never
 * arrive.
 */
/** What the cache keeps per workspace: the display label, plus herdr's optional git provenance. */
interface WorkspaceEntry {
  label: string;
  worktree?: HerdrWorkspaceWorktreeInfo;
}

export class WorkspaceTabNameCache {
  private workspaces = new Map<string, WorkspaceEntry>();
  private tabs = new Map<string, string>();
  private tabWorkspace = new Map<string, string>();
  private panePlacements = new Map<string, PanePlacement>();

  async refresh(client: HerdrClient): Promise<void> {
    const [workspaceResult, tabResult] = await Promise.all([
      // Typed as the RICH `HerdrWorkspaceDetail` — herdr's `workspace.list`
      // has always returned whole `WorkspaceInfo` objects (`worktree` and
      // `tokens` included); the trim to `HerdrWorkspaceInfo` was ours, at
      // the type and at this Map's value. No new request is made.
      client.request<{ workspaces: HerdrWorkspaceDetail[] }>("workspace.list"),
      client.request<{ tabs: HerdrTabInfo[] }>("tab.list"),
    ]);
    this.workspaces = new Map(
      workspaceResult.workspaces.map((w) => [
        w.workspace_id,
        w.worktree === undefined ? { label: w.label } : { label: w.label, worktree: w.worktree },
      ]),
    );
    this.tabs = new Map(tabResult.tabs.map((t) => [t.tab_id, t.label]));
    this.tabWorkspace = new Map(tabResult.tabs.map((t) => [t.tab_id, t.workspace_id]));
    // Pane placement is seeded separately by the caller (`HostRuntime`) via
    // `setPanePlacement`, from the same `pane.list` call it already makes.
  }

  /**
   * Test/manual seeding hook — also used internally by `refresh` and by
   * tier-3 create/rename handling.
   *
   * `worktree` is only written when supplied: `workspace.renamed` carries
   * just `{ workspace_id, label }`, so a rename must NOT discard provenance
   * the cache already holds. Callers with a full `HerdrWorkspaceDetail`
   * (`workspace.created`, `workspace.create`) pass it and set both.
   */
  setWorkspace(id: string, name: string, worktree?: HerdrWorkspaceWorktreeInfo): void {
    const entry: WorkspaceEntry = { label: name };
    const stored = worktree ?? this.workspaces.get(id)?.worktree;
    if (stored !== undefined) entry.worktree = stored;
    this.workspaces.set(id, entry);
  }

  setTab(id: string, name: string, workspaceId?: string): void {
    this.tabs.set(id, name);
    if (workspaceId !== undefined) this.tabWorkspace.set(id, workspaceId);
  }

  setPanePlacement(id: string, workspaceId: string, tabId: string): void {
    this.panePlacements.set(id, { workspace_id: workspaceId, tab_id: tabId });
  }

  removePane(id: string): void {
    this.panePlacements.delete(id);
  }

  workspaceName(id: string): string {
    return this.workspaces.get(id)?.label ?? id;
  }

  /** herdr's git provenance for a workspace, or `undefined` when it has none (or is unknown). */
  workspaceWorktree(id: string): HerdrWorkspaceWorktreeInfo | undefined {
    return this.workspaces.get(id)?.worktree;
  }

  tabName(id: string): string {
    return this.tabs.get(id) ?? id;
  }

  panePlacement(id: string): PanePlacement | undefined {
    return this.panePlacements.get(id);
  }

  /**
   * Removes the workspace entry plus every tab and pane cache entry nested
   * under it. Returns the removed tab/pane ids so the caller (`HostRuntime`)
   * can also drop them from its own subscription-relevant pane id set and
   * trigger a resubscribe if needed.
   */
  purgeWorkspace(workspaceId: string): { tabIds: string[]; paneIds: string[] } {
    this.workspaces.delete(workspaceId);
    const tabIds: string[] = [];
    for (const [tabId, tabWorkspaceId] of this.tabWorkspace) {
      if (tabWorkspaceId === workspaceId) tabIds.push(tabId);
    }
    const paneIds: string[] = [];
    for (const tabId of tabIds) {
      paneIds.push(...this.purgeTab(tabId).paneIds);
    }
    return { tabIds, paneIds };
  }

  /** Removes the tab entry plus every pane cache entry nested under it. */
  purgeTab(tabId: string): { paneIds: string[] } {
    this.tabs.delete(tabId);
    this.tabWorkspace.delete(tabId);
    const paneIds: string[] = [];
    for (const [paneId, placement] of this.panePlacements) {
      if (placement.tab_id === tabId) paneIds.push(paneId);
    }
    for (const paneId of paneIds) this.panePlacements.delete(paneId);
    return { paneIds };
  }
}
