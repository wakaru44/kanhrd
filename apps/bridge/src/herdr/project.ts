import type {
  HerdrPaneInfo,
  HerdrTabDetail,
  HerdrWorkspaceDetail,
  Pane,
  TabSummary,
  WorkspaceSummary,
} from "@kanhrd/schema";
import type { WorkspaceTabNameCache } from "./names.js";

/**
 * Assemble a bridge-projected `Pane` from herdr's raw `PaneInfo`, the
 * per-host name cache, and the configured host name (herdr doesn't know
 * about hosts — that's a kanhrd concept). See CONTRACT.md section 4 for the
 * field-by-field mapping this implements.
 */
export function projectPane(host: string, pane: HerdrPaneInfo, names: WorkspaceTabNameCache): Pane {
  const agentName = pane.display_agent ?? pane.agent;

  const projected: Pane = {
    id: pane.pane_id,
    host,
    workspace: { id: pane.workspace_id, name: names.workspaceName(pane.workspace_id) },
    tab: { id: pane.tab_id, name: names.tabName(pane.tab_id) },
    agent_status: pane.agent_status,
  };

  if (pane.title !== undefined) projected.title = pane.title;
  if (agentName !== undefined) projected.agent = { name: agentName };

  return projected;
}

/**
 * Tier-3: project herdr's `HerdrWorkspaceDetail` into the bridge-invented
 * `WorkspaceSummary` shape (same "inject host, drop the rest" trimming
 * `projectPane` already does for panes) — see CONTRACT-TIER3.md section 3.
 */
export function projectWorkspace(host: string, workspace: HerdrWorkspaceDetail): WorkspaceSummary {
  return { id: workspace.workspace_id, host, name: workspace.label };
}

/** Tier-3: project herdr's `HerdrTabDetail` into the bridge-invented `TabSummary` shape. */
export function projectTab(host: string, tab: HerdrTabDetail): TabSummary {
  return { id: tab.tab_id, host, workspace: { id: tab.workspace_id }, name: tab.label };
}
