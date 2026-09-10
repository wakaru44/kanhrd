import type { AgentStatus, HostSummary, Pane } from "@kanhrd/schema";

/**
 * Six-hundred-pane synthetic dataset for the viewport/state matrix
 * (task 17.10 of `add-l-brand-neo-shepherd-redesign`). Distributes 600
 * panes across a realistic set of hosts, workspaces, tabs, statuses and
 * agents so first-shell paint, contrast and keyboard probes exercise a
 * dense — but not degenerate — board.
 *
 * Kept intentionally deterministic (no `Math.random`) so recorded timings
 * are reproducible across runs.
 *
 *   hosts   × workspaces × tabs × panes/tab
 *     3     ×      4     ×  5   ×   10       =  600
 */

export const HOSTS = ["local", "remote-a", "remote-b"] as const;
export type FixtureHost = (typeof HOSTS)[number];

const WORKSPACES_PER_HOST = 4;
const TABS_PER_WORKSPACE = 5;
const PANES_PER_TAB = 10;

/** Realistic status mix. `working` first so the busiest column loads first. */
const STATUS_CYCLE: AgentStatus[] = [
  "working",
  "working",
  "idle",
  "idle",
  "blocked",
  "done",
  "done",
  "unknown",
  "working",
  "idle",
];

/** Agents kanhrd surfaces today; `undefined` slots produce agent-less panes. */
const AGENT_CYCLE: (string | undefined)[] = ["claude", "codex", "gemini", undefined];

const TAB_NAMES = ["main", "review", "spike", "hotfix", "docs"];

export function buildHostSummaries(): HostSummary[] {
  return HOSTS.map((name) => ({ name, connected: true }));
}

/**
 * Builds 600 `Pane` records. The list is stable across calls (same order,
 * same ids), so a test can compare renders across viewports.
 */
export function buildSixHundredPanes(): Pane[] {
  const panes: Pane[] = [];
  let i = 0;
  for (const host of HOSTS) {
    for (let w = 0; w < WORKSPACES_PER_HOST; w++) {
      const workspaceId = `${host}-ws${w + 1}`;
      const workspaceName = `workspace ${w + 1}`;
      for (let t = 0; t < TABS_PER_WORKSPACE; t++) {
        const tabId = `${workspaceId}-tab${t + 1}`;
        const tabName = TAB_NAMES[t]!;
        for (let p = 0; p < PANES_PER_TAB; p++) {
          const agent = AGENT_CYCLE[i % AGENT_CYCLE.length];
          const status = STATUS_CYCLE[i % STATUS_CYCLE.length]!;
          const paneId = `${tabId}-p${p + 1}`;
          const pane: Pane = {
            id: paneId,
            host,
            workspace: { id: workspaceId, name: workspaceName },
            tab: { id: tabId, name: tabName },
            title: `pane ${i + 1}`,
            agent_status: status,
          };
          if (agent) {
            pane.agent = { name: agent };
          }
          panes.push(pane);
          i++;
        }
      }
    }
  }
  return panes;
}

/** Small realistic slice — one workspace, one tab. Used for the populated-small state. */
export function buildPopulatedSmall(): Pane[] {
  return buildSixHundredPanes().slice(0, 6);
}

/** All panes owned by the given host — useful to reply to a scoped `pane.list`. */
export function panesForHost(all: Pane[], host: string): Pane[] {
  return all.filter((p) => p.host === host);
}
