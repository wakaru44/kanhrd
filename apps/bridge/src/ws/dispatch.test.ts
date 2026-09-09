import { describe, expect, it, vi } from "vitest";
import type { EventKind, Pane, WsRequest } from "@kanhrd/schema";
import { dispatch, type DispatchContext, type DispatchHost, type DispatchHostSource } from "./dispatch.js";
import { HostUnavailableError } from "../herdr/hosts.js";

const SAMPLE_PANE: Pane = {
  id: "pane-1",
  host: "local",
  workspace: { id: "ws-1", name: "Inbox" },
  tab: { id: "tab-1", name: "Main" },
  agent_status: "idle",
};

function noopHost(overrides: Partial<DispatchHost> = {}): DispatchHost {
  return {
    listPanes: () => Promise.resolve([]),
    paneRead: () =>
      Promise.resolve({ content: "", revision: 0, truncated: false, format: "ansi", source: "recent" }),
    paneSendKeys: () => Promise.resolve(),
    paneSendText: () => Promise.resolve(),
    ...overrides,
  };
}

function hostsWith(panes: Pane[]): DispatchHostSource {
  const host = noopHost({ listPanes: () => Promise.resolve(panes) });
  return { get: (name) => (name === "local" ? host : undefined) };
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

    const response = await dispatch(request, baseCtx({ hosts: { get: () => host } }));

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
        tier: 2,
        terminal: true,
        paneResize: false,
        paneGraphics: false,
        outputPollIntervalMs: 150,
      },
    });
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
    const response = await dispatch(request, baseCtx({ hosts: { get: () => host } }));

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
    const response = await dispatch(request, baseCtx({ hosts: { get: () => host } }));

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
    const response = await dispatch(request, baseCtx({ hosts: { get: () => host } }));

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
});
