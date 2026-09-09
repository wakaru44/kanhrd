import type { HerdrPaneInfo, Pane } from "@kanhrd/schema";
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
