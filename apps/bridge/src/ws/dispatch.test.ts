import { describe, expect, it, vi } from "vitest";
import type { EventKind, Pane, WsRequest } from "@kanhrd/schema";
import { dispatch, type DispatchHost, type DispatchHostSource } from "./dispatch.js";
import { HostUnavailableError } from "../herdr/hosts.js";

const SAMPLE_PANE: Pane = {
  id: "pane-1",
  host: "local",
  workspace: { id: "ws-1", name: "Inbox" },
  tab: { id: "tab-1", name: "Main" },
  agent_status: "idle",
};

function hostsWith(panes: Pane[]): DispatchHostSource {
  const host: DispatchHost = { listPanes: () => Promise.resolve(panes) };
  return { get: (name) => (name === "local" ? host : undefined) };
}

describe("dispatch", () => {
  it("routes pane.list to the host and returns projected panes", async () => {
    const request: WsRequest = { id: "1", host: "local", method: "pane.list", params: {} };
    const response = await dispatch(request, {
      hosts: hostsWith([SAMPLE_PANE]),
      onSubscribe: () => "unused",
    });

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

    const response = await dispatch(request, { hosts: hostsWith([]), onSubscribe });

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
    const response = await dispatch(request, { hosts: hostsWith([]), onSubscribe: () => "x" });

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
    const response = await dispatch(request, { hosts: hostsWith([]), onSubscribe: () => "x" });

    expect(response.ok).toBe(false);
    if (!response.ok) expect(response.error.code).toBe("unknown_method");
  });

  it("translates HostUnavailableError into a host_unavailable error response", async () => {
    const host: DispatchHost = {
      listPanes: () => Promise.reject(new HostUnavailableError("local")),
    };
    const request: WsRequest = { id: "5", host: "local", method: "pane.list", params: {} };

    const response = await dispatch(request, {
      hosts: { get: () => host },
      onSubscribe: () => "x",
    });

    expect(response.ok).toBe(false);
    if (!response.ok) expect(response.error.code).toBe("host_unavailable");
  });
});
