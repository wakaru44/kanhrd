import type { HerdrTabInfo, HerdrWorkspaceInfo } from "@kanhrd/schema";
import type { HerdrClient } from "./client.js";

/**
 * Per-host workspace/tab id → name lookup. herdr's `PaneInfo` only carries
 * `workspace_id`/`tab_id`; the bridge joins against `workspace.list` /
 * `tab.list` to project `Pane.workspace.name` / `Pane.tab.name`.
 *
 * Refreshed on connect/reconnect only — tier-1's subscribed event kinds
 * don't include renames, so this can go stale on rename (accepted gap, see
 * CONTRACT.md section 8).
 */
export class WorkspaceTabNameCache {
  private workspaces = new Map<string, string>();
  private tabs = new Map<string, string>();

  async refresh(client: HerdrClient): Promise<void> {
    const [workspaceResult, tabResult] = await Promise.all([
      client.request<{ workspaces: HerdrWorkspaceInfo[] }>("workspace.list"),
      client.request<{ tabs: HerdrTabInfo[] }>("tab.list"),
    ]);
    this.workspaces = new Map(workspaceResult.workspaces.map((w) => [w.workspace_id, w.label]));
    this.tabs = new Map(tabResult.tabs.map((t) => [t.tab_id, t.label]));
  }

  /** Test/manual seeding hook — also used internally by `refresh`. */
  setWorkspace(id: string, name: string): void {
    this.workspaces.set(id, name);
  }

  setTab(id: string, name: string): void {
    this.tabs.set(id, name);
  }

  workspaceName(id: string): string {
    return this.workspaces.get(id) ?? id;
  }

  tabName(id: string): string {
    return this.tabs.get(id) ?? id;
  }
}
