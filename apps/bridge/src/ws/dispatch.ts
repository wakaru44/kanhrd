import type { BridgeMethod, EventKind, Pane, WsRequest, WsResponse } from "@kanhrd/schema";
import { HostUnavailableError } from "../herdr/hosts.js";

/** Just enough of `HostRuntime` for dispatch to route `pane.list`. */
export interface DispatchHost {
  listPanes(): Promise<Pane[]>;
}

export interface DispatchHostSource {
  get(host: string): DispatchHost | undefined;
}

export interface DispatchContext {
  hosts: DispatchHostSource;
  /** Mints a subscription id and records the (host, kinds) subscription. */
  onSubscribe: (host: string, kinds: EventKind[]) => string;
}

/**
 * Routes one `WsRequest` to the matching herdr call and returns the
 * `WsResponse` to send back. Pure with respect to the WebSocket connection —
 * `ws/server.ts` owns the socket and event fan-out; this only decides what a
 * single request/response pair looks like.
 */
export async function dispatch(request: WsRequest, ctx: DispatchContext): Promise<WsResponse> {
  const { id, host, method } = request;

  const runtime = ctx.hosts.get(host);
  if (!runtime) {
    return { id, host, ok: false, error: { code: "unknown_host", message: `unknown host "${host}"` } };
  }

  try {
    switch (method as BridgeMethod) {
      case "pane.list": {
        const panes = await runtime.listPanes();
        return { id, host, ok: true, data: { panes } };
      }
      case "events.subscribe": {
        const kinds = (request.params as { kinds?: EventKind[] } | undefined)?.kinds ?? [];
        const subscriptionId = ctx.onSubscribe(host, kinds);
        return { id, host, ok: true, data: { subscription_id: subscriptionId } };
      }
      default:
        return {
          id,
          host,
          ok: false,
          error: { code: "unknown_method", message: `unknown method "${String(method)}"` },
        };
    }
  } catch (err) {
    if (err instanceof HostUnavailableError) {
      return { id, host, ok: false, error: { code: err.code, message: err.message } };
    }
    return {
      id,
      host,
      ok: false,
      error: { code: "internal_error", message: err instanceof Error ? err.message : String(err) },
    };
  }
}
