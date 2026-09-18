import type {
  HerdrPaneInfo,
  HerdrTabDetail,
  HerdrWorkspaceDetail,
  Pane,
  TabSummary,
  WorkspaceSummary,
} from '@kanhrd/schema';
import type { WorkspaceTabNameCache } from './names.js';
import { filesLocalHint } from '../files/gate.js';
import { resolveRepo } from './repo.js';

/**
 * Assemble a bridge-projected `Pane` from herdr's raw `PaneInfo`, the
 * per-host name cache, and the configured host name (herdr doesn't know
 * about hosts — that's a kanhrd concept). See CONTRACT.md section 4 for the
 * field-by-field mapping this implements.
 *
 * `statusSince` is the caller's (i.e. `HostRuntime`'s) observation time for
 * this pane's current `agent_status`, in epoch ms. Pass `undefined` — and the
 * field is omitted entirely — whenever the bridge has not watched this pane
 * enter its status; see `Pane.status_since`.
 *
 * `filesEnabled` is the host's `files` config; `false` (the default here)
 * never sets `project.files_local`.
 */
export function projectPane(
  host: string,
  pane: HerdrPaneInfo,
  names: WorkspaceTabNameCache,
  statusSince?: number,
  filesEnabled = false
): Pane {
  const agentName = pane.display_agent ?? pane.agent;

  const projected: Pane = {
    id: pane.pane_id,
    host,
    workspace: { id: pane.workspace_id, name: names.workspaceName(pane.workspace_id) },
    tab: { id: pane.tab_id, name: names.tabName(pane.tab_id) },
    agent_status: pane.agent_status,
  };

  // `label` is herdr's user-authored pane name. It already arrives on every
  // `pane.list` response; the field is set only when it is a non-empty
  // string, so a cleared label (`null`) and an empty one both read as
  // "absent" downstream rather than as a name that renders as nothing.
  if (typeof pane.label === 'string' && pane.label !== '') projected.label = pane.label;
  if (pane.title !== undefined) projected.title = pane.title;
  if (agentName !== undefined) projected.agent = { name: agentName };
  if (statusSince !== undefined) projected.status_since = statusSince;

  // Git provenance is derived PER PANE, from the pane's own working
  // directory. One herdr workspace routinely holds panes in several
  // repositories, so the workspace grain this used to use could never split
  // them — every card landed in one band when grouping the board by
  // repository.
  //
  // `cwd`, never `foreground_cwd`: `foreground_cwd` follows whatever the
  // foreground process cd'd into, so a card derived from it would hop bands
  // mid-command. `cwd` is the pane's stable home.
  //
  // The workspace's own `worktree` stays as a FALLBACK for a herdr that
  // sends it but no `cwd` (this build sends the opposite). `repo_key` /
  // `repo_root` are dropped — nothing renders them.
  const fromCwd = pane.cwd === undefined ? undefined : resolveRepo(pane.cwd);
  if (fromCwd !== undefined) {
    // A copy: `resolveRepo` hands back its cached object, shared by every
    // pane in that directory on every host, and `files_local` below is
    // per host.
    projected.project = { ...fromCwd };
  } else {
    const worktree = names.workspaceWorktree(pane.workspace_id);
    if (worktree !== undefined) {
      projected.project = {
        repo_name: worktree.repo_name,
        checkout_path: worktree.checkout_path,
        is_linked_worktree: worktree.is_linked_worktree,
      };
    }
  }

  if (
    projected.project !== undefined &&
    filesLocalHint({
      host,
      filesEnabled,
      cwd: pane.cwd,
      checkoutPath: projected.project.checkout_path,
    })
  ) {
    projected.project.files_local = true;
  }

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
