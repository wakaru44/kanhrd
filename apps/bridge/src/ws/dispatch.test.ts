import { describe, expect, it, vi } from "vitest";
import type { EventKind, Pane, TabSummary, WorkspaceSummary, WsRequest } from "@kanhrd/schema";
import { dispatch, type DispatchContext, type DispatchHost, type DispatchHostSource } from "./dispatch.js";
import { HerdrRequestError } from "../herdr/client.js";
import { HostUnavailableError } from "../herdr/hosts.js";

const SAMPLE_PANE: Pane = {
  id: "pane-1",
  host: "local",
  workspace: { id: "ws-1", name: "Inbox" },
  tab: { id: "tab-1", name: "Main" },
  agent_status: "idle",
};

const SAMPLE_TAB: TabSummary = { id: "tab-1", host: "local", workspace: { id: "ws-1" }, name: "Main" };
const SAMPLE_WORKSPACE: WorkspaceSummary = { id: "ws-1", host: "local", name: "Inbox" };

function noopHost(overrides: Partial<DispatchHost> = {}): DispatchHost {
  return {
    listPanes: () => Promise.resolve([]),
    paneRead: () =>
      Promise.resolve({ content: "", revision: 0, truncated: false, format: "ansi", source: "recent" }),
    paneSendKeys: () => Promise.resolve(),
    paneSendText: () => Promise.resolve(),
    paneSplit: () => Promise.resolve({ pane: SAMPLE_PANE }),
    paneClose: () => Promise.resolve(),
    paneRename: () => Promise.resolve({ pane: SAMPLE_PANE }),
    paneMove: () =>
      Promise.resolve({
        changed: true,
        pane: SAMPLE_PANE,
        previous_workspace_id: "ws-1",
        previous_tab_id: "tab-0",
      }),
    tabCreate: () => Promise.resolve({ tab: SAMPLE_TAB, pane: SAMPLE_PANE }),
    tabRename: () => Promise.resolve({ tab: SAMPLE_TAB }),
    tabClose: () => Promise.resolve(),
    tabMove: () => Promise.resolve({ tabs: [SAMPLE_TAB] }),
    workspaceCreate: () => Promise.resolve({ workspace: SAMPLE_WORKSPACE, tab: SAMPLE_TAB, pane: SAMPLE_PANE }),
    workspaceRename: () => Promise.resolve({ workspace: SAMPLE_WORKSPACE }),
    workspaceClose: () => Promise.resolve(),
    getHostKeybinds: () => ({ prefix: "Ctrl+B", source: "default" }),
    ...overrides,
  };
}

function hostsWith(panes: Pane[]): DispatchHostSource {
  const host = noopHost({ listPanes: () => Promise.resolve(panes) });
  return { get: (name) => (name === "local" ? host : undefined), list: () => [host] };
}

function baseCtx(overrides: Partial<DispatchContext> = {}): DispatchContext {
  return {
    hosts: hostsWith([]),
    onSubscribe: () => "unused",
    subscribeOutput: () => "unused-sub",
    unsubscribeOutput: () => {},
    ...overrides,
  };
}

describe("dispatch", () => {
  it("routes pane.list to the host and returns projected panes", async () => {
    const request: WsRequest = { id: "1", host: "local", method: "pane.list", params: {} };
    const response = await dispatch(request, baseCtx({ hosts: hostsWith([SAMPLE_PANE]) }));

    expect(response).toEqual({ id: "1", host: "local", ok: true, data: { panes: [SAMPLE_PANE] } });
  });

  it("mints a subscription id via onSubscribe for events.subscribe", async () => {
    const onSubscribe = vi.fn((_host: string, _kinds: EventKind[]) => "sub-123");
    const request: WsRequest = {
      id: "2",
      host: "local",
      method: "events.subscribe",
      params: { kinds: ["pane.created"] },
    };

    const response = await dispatch(request, baseCtx({ onSubscribe }));

    expect(onSubscribe).toHaveBeenCalledWith("local", ["pane.created"]);
    expect(response).toEqual({
      id: "2",
      host: "local",
      ok: true,
      data: { subscription_id: "sub-123" },
    });
  });

  it("returns unknown_host for an unconfigured host", async () => {
    const request: WsRequest = { id: "3", host: "ghost", method: "pane.list", params: {} };
    const response = await dispatch(request, baseCtx());

    expect(response).toEqual({
      id: "3",
      host: "ghost",
      ok: false,
      error: { code: "unknown_host", message: 'unknown host "ghost"' },
    });
  });

  it("returns unknown_method for an unrecognized method", async () => {
    const request = {
      id: "4",
      host: "local",
      method: "pane.destroy",
      params: {},
    } as unknown as WsRequest;
    const response = await dispatch(request, baseCtx());

    expect(response.ok).toBe(false);
    if (!response.ok) expect(response.error.code).toBe("unknown_method");
  });

  it("translates HostUnavailableError into a host_unavailable error response", async () => {
    const host = noopHost({ listPanes: () => Promise.reject(new HostUnavailableError("local")) });
    const request: WsRequest = { id: "5", host: "local", method: "pane.list", params: {} };

    const response = await dispatch(request, baseCtx({ hosts: { get: () => host, list: () => [host] } }));

    expect(response.ok).toBe(false);
    if (!response.ok) expect(response.error.code).toBe("host_unavailable");
  });

  it("answers bridge.capabilities without requiring a configured host", async () => {
    const request: WsRequest = { id: "6", host: "ghost", method: "bridge.capabilities", params: {} };
    const response = await dispatch(request, baseCtx());

    expect(response).toEqual({
      id: "6",
      host: "ghost",
      ok: true,
      data: {
        tier: 3,
        terminal: true,
        paneResize: false,
        paneGraphics: false,
        outputPollIntervalMs: 150,
        paneCreate: true,
        paneClose: true,
        paneMove: true,
        paneRename: true,
        tabCrud: true,
        workspaceCrud: true,
        hostKeybinds: { prefix: "Ctrl+B", source: "default" },
      },
    });
  });

  it("bridge.capabilities populates hostKeybinds from the primary (first-listed) host, regardless of the requested host", async () => {
    const request: WsRequest = { id: "6b", host: "ghost", method: "bridge.capabilities", params: {} };
    const primary = noopHost({ getHostKeybinds: () => ({ prefix: "Ctrl+Space", source: "config-file" }) });
    const response = await dispatch(request, baseCtx({ hosts: { get: () => undefined, list: () => [primary] } }));

    expect(response.ok).toBe(true);
    if (response.ok) {
      expect((response.data as { hostKeybinds?: unknown }).hostKeybinds).toEqual({
        prefix: "Ctrl+Space",
        source: "config-file",
      });
    }
  });

  it("bridge.capabilities omits hostKeybinds when there is no configured host at all", async () => {
    const request: WsRequest = { id: "6c", host: "ghost", method: "bridge.capabilities", params: {} };
    const response = await dispatch(request, baseCtx({ hosts: { get: () => undefined, list: () => [] } }));

    expect(response.ok).toBe(true);
    if (response.ok) {
      expect((response.data as { hostKeybinds?: unknown }).hostKeybinds).toBeUndefined();
    }
  });

  it("proxies pane.read to the host and returns its projected result", async () => {
    const host = noopHost({
      paneRead: (params) => {
        expect(params).toEqual({ pane_id: "p1" });
        return Promise.resolve({
          content: "hello",
          revision: 3,
          truncated: false,
          format: "ansi" as const,
          source: "recent" as const,
        });
      },
    });
    const request: WsRequest = {
      id: "7",
      host: "local",
      method: "pane.read",
      params: { pane_id: "p1" },
    };
    const response = await dispatch(request, baseCtx({ hosts: { get: () => host, list: () => [host] } }));

    expect(response).toEqual({
      id: "7",
      host: "local",
      ok: true,
      data: { content: "hello", revision: 3, truncated: false, format: "ansi", source: "recent" },
    });
  });

  it("rejects pane.read without a pane_id", async () => {
    const request: WsRequest = { id: "8", host: "local", method: "pane.read", params: {} as never };
    const response = await dispatch(request, baseCtx());

    expect(response.ok).toBe(false);
    if (!response.ok) expect(response.error.code).toBe("invalid_params");
  });

  it("delegates pane.subscribe_output to ctx.subscribeOutput and returns its subscription id", async () => {
    const subscribeOutput = vi.fn(() => "sub-abc");
    const request: WsRequest = {
      id: "9",
      host: "local",
      method: "pane.subscribe_output",
      params: { pane_id: "p1" },
    };
    const response = await dispatch(request, baseCtx({ subscribeOutput }));

    expect(subscribeOutput).toHaveBeenCalledWith("local", { pane_id: "p1" });
    expect(response).toEqual({ id: "9", host: "local", ok: true, data: { subscription_id: "sub-abc" } });
  });

  it("delegates pane.unsubscribe_output to ctx.unsubscribeOutput", async () => {
    const unsubscribeOutput = vi.fn();
    const request: WsRequest = {
      id: "10",
      host: "local",
      method: "pane.unsubscribe_output",
      params: { subscription_id: "sub-abc" },
    };
    const response = await dispatch(request, baseCtx({ unsubscribeOutput }));

    expect(unsubscribeOutput).toHaveBeenCalledWith("sub-abc");
    expect(response).toEqual({ id: "10", host: "local", ok: true, data: {} });
  });

  it("proxies pane.send_keys to the host", async () => {
    const paneSendKeys = vi.fn(() => Promise.resolve());
    const host = noopHost({ paneSendKeys });
    const request: WsRequest = {
      id: "11",
      host: "local",
      method: "pane.send_keys",
      params: { pane_id: "p1", keys: ["ctrl+c"] },
    };
    const response = await dispatch(request, baseCtx({ hosts: { get: () => host, list: () => [host] } }));

    expect(paneSendKeys).toHaveBeenCalledWith({ pane_id: "p1", keys: ["ctrl+c"] });
    expect(response).toEqual({ id: "11", host: "local", ok: true, data: {} });
  });

  it("proxies pane.send_text to the host", async () => {
    const paneSendText = vi.fn(() => Promise.resolve());
    const host = noopHost({ paneSendText });
    const request: WsRequest = {
      id: "12",
      host: "local",
      method: "pane.send_text",
      params: { pane_id: "p1", text: "hi" },
    };
    const response = await dispatch(request, baseCtx({ hosts: { get: () => host, list: () => [host] } }));

    expect(paneSendText).toHaveBeenCalledWith({ pane_id: "p1", text: "hi" });
    expect(response).toEqual({ id: "12", host: "local", ok: true, data: {} });
  });

  it("rejects pane.resize with not_supported", async () => {
    const request: WsRequest = {
      id: "13",
      host: "local",
      method: "pane.resize",
      params: { pane_id: "p1", cols: 80, rows: 24 },
    };
    const response = await dispatch(request, baseCtx());

    expect(response).toEqual({
      id: "13",
      host: "local",
      ok: false,
      error: {
        code: "not_supported",
        message: "herdr has no public PTY-resize API in this version",
      },
    });
  });

  it("rejects pane.graphics.info and pane.graphics.stream with not_supported", async () => {
    const infoRequest: WsRequest = {
      id: "14",
      host: "local",
      method: "pane.graphics.info",
      params: { pane_id: "p1" },
    };
    const streamRequest: WsRequest = {
      id: "15",
      host: "local",
      method: "pane.graphics.stream",
      params: { pane_id: "p1" },
    };

    const infoResponse = await dispatch(infoRequest, baseCtx());
    const streamResponse = await dispatch(streamRequest, baseCtx());

    expect(infoResponse.ok).toBe(false);
    expect(streamResponse.ok).toBe(false);
    if (!infoResponse.ok) expect(infoResponse.error.code).toBe("not_supported");
    if (!streamResponse.ok) expect(streamResponse.error.code).toBe("not_supported");
  });

  // --- Tier-3 (pane/tab/workspace lifecycle) ------------------------------

  it("proxies pane.split to the host and returns the projected pane", async () => {
    const paneSplit = vi.fn(() => Promise.resolve({ pane: SAMPLE_PANE }));
    const host = noopHost({ paneSplit });
    const request: WsRequest = {
      id: "16",
      host: "local",
      method: "pane.split",
      params: { direction: "right", target_pane_id: "pane-1" },
    };
    const response = await dispatch(request, baseCtx({ hosts: { get: () => host, list: () => [host] } }));

    expect(paneSplit).toHaveBeenCalledWith({ direction: "right", target_pane_id: "pane-1" });
    expect(response).toEqual({ id: "16", host: "local", ok: true, data: { pane: SAMPLE_PANE } });
  });

  it("rejects pane.split without a direction", async () => {
    const request: WsRequest = { id: "17", host: "local", method: "pane.split", params: {} as never };
    const response = await dispatch(request, baseCtx());

    expect(response.ok).toBe(false);
    if (!response.ok) expect(response.error.code).toBe("invalid_params");
  });

  it("proxies pane.close to the host", async () => {
    const paneClose = vi.fn(() => Promise.resolve());
    const host = noopHost({ paneClose });
    const request: WsRequest = { id: "18", host: "local", method: "pane.close", params: { pane_id: "pane-1" } };
    const response = await dispatch(request, baseCtx({ hosts: { get: () => host, list: () => [host] } }));

    expect(paneClose).toHaveBeenCalledWith({ pane_id: "pane-1" });
    expect(response).toEqual({ id: "18", host: "local", ok: true, data: {} });
  });

  it("proxies pane.move to the host and returns the cascading-side-effect fields", async () => {
    const paneMove = vi.fn(() =>
      Promise.resolve({
        changed: true,
        pane: SAMPLE_PANE,
        previous_workspace_id: "ws-1",
        previous_tab_id: "tab-0",
        created_tab: SAMPLE_TAB,
      }),
    );
    const host = noopHost({ paneMove });
    const request: WsRequest = {
      id: "19",
      host: "local",
      method: "pane.move",
      params: { pane_id: "pane-1", destination: { type: "new_tab" } },
    };
    const response = await dispatch(request, baseCtx({ hosts: { get: () => host, list: () => [host] } }));

    expect(paneMove).toHaveBeenCalledWith({ pane_id: "pane-1", destination: { type: "new_tab" } });
    expect(response).toEqual({
      id: "19",
      host: "local",
      ok: true,
      data: {
        changed: true,
        pane: SAMPLE_PANE,
        previous_workspace_id: "ws-1",
        previous_tab_id: "tab-0",
        created_tab: SAMPLE_TAB,
      },
    });
  });

  it("rejects pane.move without a destination", async () => {
    const request: WsRequest = {
      id: "20",
      host: "local",
      method: "pane.move",
      params: { pane_id: "pane-1" } as never,
    };
    const response = await dispatch(request, baseCtx());

    expect(response.ok).toBe(false);
    if (!response.ok) expect(response.error.code).toBe("invalid_params");
  });

  it("proxies tab.create to the host, defaulting missing params to {}", async () => {
    const tabCreate = vi.fn(() => Promise.resolve({ tab: SAMPLE_TAB, pane: SAMPLE_PANE }));
    const host = noopHost({ tabCreate });
    const request: WsRequest = { id: "21", host: "local", method: "tab.create" };
    const response = await dispatch(request, baseCtx({ hosts: { get: () => host, list: () => [host] } }));

    expect(tabCreate).toHaveBeenCalledWith({});
    expect(response).toEqual({ id: "21", host: "local", ok: true, data: { tab: SAMPLE_TAB, pane: SAMPLE_PANE } });
  });

  // --- pane.rename (herdr's user-authored pane label) ---------------------

  it("proxies pane.rename to the host and returns the updated pane", async () => {
    const renamed: Pane = { ...SAMPLE_PANE, label: "fix the backlog storm" };
    const paneRename = vi.fn(() => Promise.resolve({ pane: renamed }));
    const host = noopHost({ paneRename });
    const request: WsRequest = {
      id: "22a",
      host: "local",
      method: "pane.rename",
      params: { pane_id: "pane-1", label: "fix the backlog storm" },
    };
    const response = await dispatch(request, baseCtx({ hosts: { get: () => host, list: () => [host] } }));

    expect(paneRename).toHaveBeenCalledWith({ pane_id: "pane-1", label: "fix the backlog storm" });
    expect(response).toEqual({ id: "22a", host: "local", ok: true, data: { pane: renamed } });
  });

  it("forwards a null label verbatim — herdr's explicit clear form", async () => {
    const paneRename = vi.fn(() => Promise.resolve({ pane: SAMPLE_PANE }));
    const host = noopHost({ paneRename });
    const request: WsRequest = {
      id: "22b",
      host: "local",
      method: "pane.rename",
      params: { pane_id: "pane-1", label: null },
    };
    const response = await dispatch(request, baseCtx({ hosts: { get: () => host, list: () => [host] } }));

    expect(paneRename).toHaveBeenCalledWith({ pane_id: "pane-1", label: null });
    expect(response.ok).toBe(true);
    if (response.ok) expect((response.data as { pane: Pane }).pane.label).toBeUndefined();
  });

  it("rejects pane.rename without a pane_id", async () => {
    const request: WsRequest = { id: "22c", host: "local", method: "pane.rename", params: {} as never };
    const response = await dispatch(request, baseCtx());

    expect(response.ok).toBe(false);
    if (!response.ok) expect(response.error.code).toBe("invalid_params");
  });

  it("surfaces a herdr error from pane.rename instead of pretending it succeeded", async () => {
    const host = noopHost({
      paneRename: () => Promise.reject(new HerdrRequestError("pane_not_found", "no such pane")),
    });
    const request: WsRequest = {
      id: "22d",
      host: "local",
      method: "pane.rename",
      params: { pane_id: "gone", label: "x" },
    };
    const response = await dispatch(request, baseCtx({ hosts: { get: () => host, list: () => [host] } }));

    expect(response.ok).toBe(false);
    if (!response.ok) {
      expect(response.error.code).toBe("pane_not_found");
      expect(response.error.message).toContain("no such pane");
    }
  });

  it("proxies tab.rename to the host", async () => {
    const tabRename = vi.fn(() => Promise.resolve({ tab: SAMPLE_TAB }));
    const host = noopHost({ tabRename });
    const request: WsRequest = {
      id: "22",
      host: "local",
      method: "tab.rename",
      params: { tab_id: "tab-1", label: "Renamed" },
    };
    const response = await dispatch(request, baseCtx({ hosts: { get: () => host, list: () => [host] } }));

    expect(tabRename).toHaveBeenCalledWith({ tab_id: "tab-1", label: "Renamed" });
    expect(response).toEqual({ id: "22", host: "local", ok: true, data: { tab: SAMPLE_TAB } });
  });

  it("rejects tab.rename without a label", async () => {
    const request: WsRequest = {
      id: "23",
      host: "local",
      method: "tab.rename",
      params: { tab_id: "tab-1" } as never,
    };
    const response = await dispatch(request, baseCtx());

    expect(response.ok).toBe(false);
    if (!response.ok) expect(response.error.code).toBe("invalid_params");
  });

  it("proxies tab.close to the host", async () => {
    const tabClose = vi.fn(() => Promise.resolve());
    const host = noopHost({ tabClose });
    const request: WsRequest = { id: "24", host: "local", method: "tab.close", params: { tab_id: "tab-1" } };
    const response = await dispatch(request, baseCtx({ hosts: { get: () => host, list: () => [host] } }));

    expect(tabClose).toHaveBeenCalledWith({ tab_id: "tab-1" });
    expect(response).toEqual({ id: "24", host: "local", ok: true, data: {} });
  });

  it("proxies tab.move to the host and returns the whole reordered list", async () => {
    const tabMove = vi.fn(() => Promise.resolve({ tabs: [SAMPLE_TAB] }));
    const host = noopHost({ tabMove });
    const request: WsRequest = {
      id: "25",
      host: "local",
      method: "tab.move",
      params: { tab_id: "tab-1", insert_index: 0 },
    };
    const response = await dispatch(request, baseCtx({ hosts: { get: () => host, list: () => [host] } }));

    expect(tabMove).toHaveBeenCalledWith({ tab_id: "tab-1", insert_index: 0 });
    expect(response).toEqual({ id: "25", host: "local", ok: true, data: { tabs: [SAMPLE_TAB] } });
  });

  it("proxies workspace.create to the host, defaulting missing params to {}", async () => {
    const workspaceCreate = vi.fn(() =>
      Promise.resolve({ workspace: SAMPLE_WORKSPACE, tab: SAMPLE_TAB, pane: SAMPLE_PANE }),
    );
    const host = noopHost({ workspaceCreate });
    const request: WsRequest = { id: "26", host: "local", method: "workspace.create" };
    const response = await dispatch(request, baseCtx({ hosts: { get: () => host, list: () => [host] } }));

    expect(workspaceCreate).toHaveBeenCalledWith({});
    expect(response).toEqual({
      id: "26",
      host: "local",
      ok: true,
      data: { workspace: SAMPLE_WORKSPACE, tab: SAMPLE_TAB, pane: SAMPLE_PANE },
    });
  });

  it("proxies workspace.rename to the host", async () => {
    const workspaceRename = vi.fn(() => Promise.resolve({ workspace: SAMPLE_WORKSPACE }));
    const host = noopHost({ workspaceRename });
    const request: WsRequest = {
      id: "27",
      host: "local",
      method: "workspace.rename",
      params: { workspace_id: "ws-1", label: "Renamed" },
    };
    const response = await dispatch(request, baseCtx({ hosts: { get: () => host, list: () => [host] } }));

    expect(workspaceRename).toHaveBeenCalledWith({ workspace_id: "ws-1", label: "Renamed" });
    expect(response).toEqual({ id: "27", host: "local", ok: true, data: { workspace: SAMPLE_WORKSPACE } });
  });

  it("proxies workspace.close to the host, passing close_group through verbatim", async () => {
    const workspaceClose = vi.fn(() => Promise.resolve());
    const host = noopHost({ workspaceClose });
    const request: WsRequest = {
      id: "28",
      host: "local",
      method: "workspace.close",
      params: { workspace_id: "ws-1", close_group: true },
    };
    const response = await dispatch(request, baseCtx({ hosts: { get: () => host, list: () => [host] } }));

    expect(workspaceClose).toHaveBeenCalledWith({ workspace_id: "ws-1", close_group: true });
    expect(response).toEqual({ id: "28", host: "local", ok: true, data: {} });
  });

  it("rejects workspace.close without a workspace_id", async () => {
    const request: WsRequest = {
      id: "29",
      host: "local",
      method: "workspace.close",
      params: {} as never,
    };
    const response = await dispatch(request, baseCtx());

    expect(response.ok).toBe(false);
    if (!response.ok) expect(response.error.code).toBe("invalid_params");
  });

  it("propagates workspace_group_close_required from a HerdrRequestError verbatim", async () => {
    const workspaceClose = vi.fn(() =>
      Promise.reject(
        new HerdrRequestError(
          "workspace_group_close_required",
          "workspace has linked worktree workspaces; use close_group=true",
        ),
      ),
    );
    const host = noopHost({ workspaceClose });
    const request: WsRequest = {
      id: "30",
      host: "local",
      method: "workspace.close",
      params: { workspace_id: "ws-1" },
    };
    const response = await dispatch(request, baseCtx({ hosts: { get: () => host, list: () => [host] } }));

    expect(response.ok).toBe(false);
    if (!response.ok) {
      expect(response.error.code).toBe("workspace_group_close_required");
      expect(response.error.message).toMatch(/close_group/);
    }
  });
});
