import type { Pane } from "@kanhrd/schema";
import { paneSecondaryIdentity, paneTitle, paneTitleIsIdPrefix } from "./pane-title";

function pane(overrides: Partial<Pane> = {}): Pane {
  return {
    id: "pane-12345678",
    host: "laptop",
    workspace: { id: "w1", name: "kanhrd" },
    tab: { id: "t1", name: "main" },
    agent_status: "working",
    ...overrides,
  };
}

describe("paneTitle", () => {
  it("prefers the operator's own label over everything else", () => {
    expect(
      paneTitle(pane({ label: "fix the backlog storm", agent: { name: "claude" }, title: "hook title" })),
    ).toBe("fix the backlog storm");
  });

  it("falls back to agent identity when there is no label", () => {
    expect(paneTitle(pane({ agent: { name: "codex" }, title: "hook title" }))).toBe("codex");
  });

  it("keeps herdr's TTL-bearing hook title below agent identity", () => {
    expect(paneTitle(pane({ title: "migration run" }))).toBe("migration run");
  });

  it("falls back to the first 8 characters of the pane id when nothing names the pane", () => {
    expect(paneTitle(pane())).toBe("pane-123");
  });

  it("reports when the title is only an id prefix, so a caller can render it in mono", () => {
    expect(paneTitleIsIdPrefix(pane())).toBe(true);
    expect(paneTitleIsIdPrefix(pane({ title: "migration run" }))).toBe(false);
    expect(paneTitleIsIdPrefix(pane({ agent: { name: "claude" } }))).toBe(false);
    expect(paneTitleIsIdPrefix(pane({ label: "named" }))).toBe(false);
  });
});

describe("paneSecondaryIdentity", () => {
  it("surfaces the agent identity the label displaced", () => {
    expect(paneSecondaryIdentity(pane({ label: "fix the storm", agent: { name: "claude" } }))).toBe(
      "claude",
    );
  });

  it("is null when no label displaced anything", () => {
    expect(paneSecondaryIdentity(pane({ agent: { name: "claude" } }))).toBeNull();
  });

  it("is null when a labelled pane has no agent to show", () => {
    expect(paneSecondaryIdentity(pane({ label: "fix the storm" }))).toBeNull();
  });
});
