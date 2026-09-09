import { describe, expect, it } from "vitest";
import type { HerdrPaneInfo } from "@kanhrd/schema";
import { WorkspaceTabNameCache } from "./names.js";
import { projectPane } from "./project.js";

function pane(overrides: Partial<HerdrPaneInfo> = {}): HerdrPaneInfo {
  return {
    pane_id: "pane-1",
    workspace_id: "ws-1",
    tab_id: "tab-1",
    agent_status: "working",
    revision: 1,
    ...overrides,
  };
}

describe("projectPane", () => {
  it("joins workspace/tab names from the cache and stamps host", () => {
    const names = new WorkspaceTabNameCache();
    names.setWorkspace("ws-1", "Inbox");
    names.setTab("tab-1", "Main");

    const result = projectPane("local", pane(), names);

    expect(result).toEqual({
      id: "pane-1",
      host: "local",
      workspace: { id: "ws-1", name: "Inbox" },
      tab: { id: "tab-1", name: "Main" },
      agent_status: "working",
    });
  });

  it("falls back to the raw id when a name is missing from the cache", () => {
    const names = new WorkspaceTabNameCache();

    const result = projectPane("local", pane(), names);

    expect(result.workspace).toEqual({ id: "ws-1", name: "ws-1" });
    expect(result.tab).toEqual({ id: "tab-1", name: "tab-1" });
  });

  it("prefers display_agent over agent, and omits agent/title when both absent", () => {
    const names = new WorkspaceTabNameCache();

    const withBoth = projectPane("local", pane({ agent: "claude", display_agent: "Claude" }), names);
    expect(withBoth.agent).toEqual({ name: "Claude" });

    const agentOnly = projectPane("local", pane({ agent: "claude" }), names);
    expect(agentOnly.agent).toEqual({ name: "claude" });

    const neither = projectPane("local", pane(), names);
    expect(neither.agent).toBeUndefined();
    expect(neither.title).toBeUndefined();
  });

  it("carries through title when present", () => {
    const names = new WorkspaceTabNameCache();
    const result = projectPane("local", pane({ title: "fix the bug" }), names);
    expect(result.title).toBe("fix the bug");
  });
});
