import { Component, computed, effect, inject, signal, untracked } from "@angular/core";
import { KeyValuePipe } from "@angular/common";
import { Router } from "@angular/router";
import { LucidePencil, LucideX } from "@lucide/angular";
import type { TabSummary, WorkspaceSummary } from "@kanhrd/schema";
import { isWorkspaceGroupCloseRequiredError, paneKey, PanesStore } from "../state/panes.store";
import { ConfirmModal } from "../shared/confirm-modal";

interface WorkspaceGroup {
  workspace: WorkspaceSummary;
  tabs: TabSummary[];
}

/**
 * Rail = navigator (decision locked): per host, a workspace list, each
 * workspace listing its tabs. Hovering a workspace/tab reveals rename
 * (pencil) and close (×) actions, gated on `workspaceCrud`/`tabCrud`.
 * Clicking a workspace or tab NAVIGATES to `/workspace/:workspaceId` or
 * `/workspace/:workspaceId/tab/:tabId` — it does not write
 * `PanesStore.scopeSignal` directly; `Board`'s route-sync effect derives
 * that from the URL. Clicking the already-active workspace/tab navigates
 * back to `/` (unscoped).
 */
@Component({
  selector: "app-rail",
  imports: [ConfirmModal, KeyValuePipe, LucidePencil, LucideX],
  templateUrl: "./rail.html",
  styleUrl: "./rail.scss",
})
export class Rail {
  protected readonly store = inject(PanesStore);
  private readonly router = inject(Router);

  protected readonly hostGroups = computed(() => {
    const workspaces = this.store.workspacesSignal();
    const tabs = this.store.tabsSignal();
    const byHost = new Map<string, WorkspaceGroup[]>();
    for (const workspace of workspaces.values()) {
      const list = byHost.get(workspace.host) ?? [];
      list.push({ workspace, tabs: [] });
      byHost.set(workspace.host, list);
    }
    for (const tab of tabs.values()) {
      const group = byHost.get(tab.host)?.find((g) => g.workspace.id === tab.workspace.id);
      group?.tabs.push(tab);
    }
    return byHost;
  });

  protected readonly tabFilter = this.store.tabFilterSignal;

  protected workspaceCrudAvailable(host: string): boolean {
    return this.store.capabilitiesSignal().get(host)?.workspaceCrud === true;
  }

  protected tabCrudAvailable(host: string): boolean {
    return this.store.capabilitiesSignal().get(host)?.tabCrud === true;
  }

  // --- inline rename -------------------------------------------------

  protected readonly editing = signal<{ kind: "workspace" | "tab"; host: string; id: string } | null>(null);
  protected readonly editingValue = signal("");

  protected isEditing(kind: "workspace" | "tab", host: string, id: string): boolean {
    const e = this.editing();
    return e !== null && e.kind === kind && e.host === host && e.id === id;
  }

  protected startRenameWorkspace(workspace: WorkspaceSummary, event: Event): void {
    event.stopPropagation();
    this.editing.set({ kind: "workspace", host: workspace.host, id: workspace.id });
    this.editingValue.set(workspace.name);
  }

  protected startRenameTab(tab: TabSummary, event: Event): void {
    event.stopPropagation();
    this.editing.set({ kind: "tab", host: tab.host, id: tab.id });
    this.editingValue.set(tab.name);
  }

  protected cancelRename(): void {
    this.editing.set(null);
  }

  protected confirmRename(): void {
    const target = this.editing();
    const value = this.editingValue().trim();
    this.editing.set(null);
    if (!target || !value) {
      return;
    }
    if (target.kind === "workspace") {
      void this.store.renameWorkspace(target.host, target.id, value);
    } else {
      void this.store.renameTab(target.host, target.id, value);
    }
  }

  protected onEditKeydown(event: KeyboardEvent): void {
    if (event.key === "Enter") {
      event.preventDefault();
      this.confirmRename();
    } else if (event.key === "Escape") {
      event.preventDefault();
      this.cancelRename();
    }
  }

  constructor() {
    // "New tab"/"New workspace" (header `+` menu) create-then-rename rather
    // than prompting up front. Once the newly created item shows up here
    // (via its `*.created` event landing in the store), auto-open its
    // inline rename field.
    effect(() => {
      const pending = this.store.pendingRenameSignal();
      if (!pending) {
        return;
      }
      const key = paneKey(pending.host, pending.id);
      const workspace = pending.kind === "workspace" ? this.store.workspacesSignal().get(key) : undefined;
      const tab = pending.kind === "tab" ? this.store.tabsSignal().get(key) : undefined;
      if (!workspace && !tab) {
        return;
      }
      untracked(() => {
        if (workspace) {
          this.editing.set({ kind: "workspace", host: workspace.host, id: workspace.id });
          this.editingValue.set(workspace.name);
        } else if (tab) {
          this.editing.set({ kind: "tab", host: tab.host, id: tab.id });
          this.editingValue.set(tab.name);
        }
        this.store.consumePendingRename();
      });
    });

    // `KeyboardService`'s `prefix+&` ("close current tab") has no direct
    // reference to this component's `ConfirmModal` — it requests a close via
    // the store instead, mirroring the `pendingRenameSignal` handoff above.
    effect(() => {
      const pending = this.store.pendingCloseTabSignal();
      if (!pending) {
        return;
      }
      const tab = this.store.tabsSignal().get(paneKey(pending.host, pending.id));
      untracked(() => {
        if (tab) {
          this.requestCloseTab(tab);
        }
        this.store.consumePendingCloseTab();
      });
    });
  }

  // --- navigation (rail = navigator) ------------------------------------

  protected isTabFilterActive(host: string, tabId: string): boolean {
    const filter = this.tabFilter();
    return filter !== null && filter.host === host && filter.tabId === tabId;
  }

  protected isWorkspaceScopeActive(workspaceId: string): boolean {
    const scope = this.store.scopeSignal();
    return scope !== null && scope.workspaceId === workspaceId && scope.tabId === null;
  }

  protected onTabClick(tab: TabSummary): void {
    if (this.isTabFilterActive(tab.host, tab.id)) {
      void this.router.navigate(["/"]);
    } else {
      void this.router.navigate(["/workspace", tab.workspace.id, "tab", tab.id]);
    }
  }

  protected onWorkspaceClick(workspace: WorkspaceSummary): void {
    if (this.isWorkspaceScopeActive(workspace.id)) {
      void this.router.navigate(["/"]);
    } else {
      void this.router.navigate(["/workspace", workspace.id]);
    }
  }

  // --- close: workspace --------------------------------------------------

  protected readonly closeWorkspaceTarget = signal<WorkspaceSummary | null>(null);
  protected readonly closeWorkspaceGroupRequired = signal(false);

  protected readonly closeWorkspaceRefusalReason = computed(() => {
    const target = this.closeWorkspaceTarget();
    if (!target) {
      return null;
    }
    return this.store.workspaceCountForHost(target.host) <= 1
      ? "This is the only open workspace on this host. Closing it would leave you with zero open workspaces — close or open another workspace first."
      : null;
  });

  protected requestCloseWorkspace(workspace: WorkspaceSummary, event: Event): void {
    event.stopPropagation();
    this.closeWorkspaceGroupRequired.set(false);
    this.closeWorkspaceTarget.set(workspace);
  }

  protected cancelCloseWorkspace(): void {
    this.closeWorkspaceTarget.set(null);
    this.closeWorkspaceGroupRequired.set(false);
  }

  protected async confirmCloseWorkspace(): Promise<void> {
    const target = this.closeWorkspaceTarget();
    if (!target) {
      return;
    }
    try {
      await this.store.closeWorkspace(target.host, target.id, this.closeWorkspaceGroupRequired());
      this.closeWorkspaceTarget.set(null);
      this.closeWorkspaceGroupRequired.set(false);
    } catch (err) {
      if (isWorkspaceGroupCloseRequiredError(err) && !this.closeWorkspaceGroupRequired()) {
        // Distinct second confirmation, per CONTRACT-TIER3.md section 6 —
        // not the same modal content as the generic destructive-op confirm.
        this.closeWorkspaceGroupRequired.set(true);
        return;
      }
      // Any other error is a client-local outcome (bridge unreachable,
      // stale id, etc.) — close the modal rather than leaving it stuck.
      this.closeWorkspaceTarget.set(null);
      this.closeWorkspaceGroupRequired.set(false);
    }
  }

  // --- close: tab ----------------------------------------------------

  protected readonly closeTabTarget = signal<TabSummary | null>(null);

  protected readonly closeTabIsLastInWorkspace = computed(() => {
    const target = this.closeTabTarget();
    if (!target) {
      return false;
    }
    return this.store.tabCountForWorkspace(target.host, target.workspace.id) <= 1;
  });

  protected requestCloseTab(tab: TabSummary, event?: Event): void {
    event?.stopPropagation();
    this.closeTabTarget.set(tab);
  }

  protected cancelCloseTab(): void {
    this.closeTabTarget.set(null);
  }

  protected confirmCloseTab(): void {
    const target = this.closeTabTarget();
    this.closeTabTarget.set(null);
    if (!target) {
      return;
    }
    void this.store.closeTab(target.host, target.id);
  }
}
