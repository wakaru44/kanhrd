import type { Pane } from "@kanhrd/schema";
import {
  applyEvent,
  applyPaneAgentStatusChanged,
  applyPaneClosed,
  applyPaneCreated,
  defaultFilters,
  groupByStatus,
  paneKey,
  type PaneMap,
} from "./panes.store";

function pane(overrides: Partial<Pane> = {}): Pane {
  return {
    id: "p1",
    host: "laptop",
    workspace: { id: "w1", name: "workspace-1" },
    tab: { id: "t1", name: "tab-1" },
    agent_status: "idle",
    ...overrides,
  };
}

describe("panes.store reducers", () => {
  it("applyPaneCreated adds a pane keyed by host:id", () => {
    const empty: PaneMap = new Map();
    const p = pane();
    const next = applyPaneCreated(empty, p);
    expect(next.get(paneKey(p.host, p.id))).toEqual(p);
    expect(empty.size).toBe(0); // pure: original untouched
  });

  it("applyPaneCreated overwrites an existing pane with the same key", () => {
    const p = pane();
    const withPane = applyPaneCreated(new Map(), p);
    const updated = pane({ agent_status: "working" });
    const next = applyPaneCreated(withPane, updated);
    expect(next.get(paneKey(p.host, p.id))?.agent_status).toBe("working");
    expect(next.size).toBe(1);
  });

  it("applyPaneClosed removes a pane by id/host", () => {
    const p = pane();
    const withPane = applyPaneCreated(new Map(), p);
    const next = applyPaneClosed(withPane, { id: p.id, host: p.host });
    expect(next.has(paneKey(p.host, p.id))).toBe(false);
  });

  it("applyPaneClosed on an unknown pane is a no-op", () => {
    const empty: PaneMap = new Map();
    const next = applyPaneClosed(empty, { id: "missing", host: "laptop" });
    expect(next).toBe(empty);
  });

  it("applyPaneAgentStatusChanged updates only agent_status", () => {
    const p = pane({ title: "kept" });
    const withPane = applyPaneCreated(new Map(), p);
    const next = applyPaneAgentStatusChanged(withPane, {
      id: p.id,
      host: p.host,
      agent_status: "blocked",
    });
    const updated = next.get(paneKey(p.host, p.id));
    expect(updated?.agent_status).toBe("blocked");
    expect(updated?.title).toBe("kept");
  });

  it("applyPaneAgentStatusChanged on an unknown pane is a no-op", () => {
    const empty: PaneMap = new Map();
    const next = applyPaneAgentStatusChanged(empty, {
      id: "missing",
      host: "laptop",
      agent_status: "done",
    });
    expect(next).toBe(empty);
  });

  it("applyEvent dispatches pane.created/pane.closed/pane.agent_status_changed", () => {
    const p = pane();
    let panes: PaneMap = new Map();
    panes = applyEvent(panes, { host: p.host, event: "pane.created", payload: { pane: p } });
    expect(panes.size).toBe(1);

    panes = applyEvent(panes, {
      host: p.host,
      event: "pane.agent_status_changed",
      payload: { id: p.id, host: p.host, agent_status: "done" },
    });
    expect(panes.get(paneKey(p.host, p.id))?.agent_status).toBe("done");

    panes = applyEvent(panes, {
      host: p.host,
      event: "pane.closed",
      payload: { id: p.id, host: p.host, workspace: { id: p.workspace.id } },
    });
    expect(panes.size).toBe(0);
  });
});

describe("groupByStatus", () => {
  it("buckets panes by agent_status", () => {
    const panes = [
      pane({ id: "a", agent_status: "working" }),
      pane({ id: "b", agent_status: "idle" }),
      pane({ id: "c", agent_status: "working" }),
    ];
    const groups = groupByStatus(panes, defaultFilters());
    expect(groups.working.map((p) => p.id)).toEqual(["a", "c"]);
    expect(groups.idle.map((p) => p.id)).toEqual(["b"]);
    expect(groups.blocked).toEqual([]);
  });

  it("excludes panes from hidden hosts", () => {
    const panes = [pane({ id: "a", host: "laptop" }), pane({ id: "b", host: "desktop" })];
    const groups = groupByStatus(panes, {
      excludedHosts: new Set(["desktop"]),
      hiddenStatuses: new Set(),
    });
    expect(groups.idle.map((p) => p.id)).toEqual(["a"]);
  });

  it("excludes panes from hidden status columns", () => {
    const panes = [pane({ id: "a", agent_status: "working" })];
    const groups = groupByStatus(panes, {
      excludedHosts: new Set(),
      hiddenStatuses: new Set(["working"]),
    });
    expect(groups.working).toEqual([]);
  });
});
