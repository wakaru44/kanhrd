import { randomUUID } from "node:crypto";
import websocketPlugin from "@fastify/websocket";
import type { FastifyInstance } from "fastify";
import type { EventKind, WsEvent, WsRequest } from "@kanhrd/schema";
import type { HostRegistry, HostRuntime } from "../herdr/hosts.js";
import { OutputPoller } from "../output/poller.js";
import { dispatch, OUTPUT_POLL_INTERVAL_MS } from "./dispatch.js";

interface Subscription {
  kinds: Set<EventKind>;
  listener: (event: WsEvent) => void;
}

/**
 * Registers the single `/ws` endpoint. Each browser connection tracks its
 * own subscriptions (host -> kinds); a `bridge-event` listener is attached
 * lazily on first subscribe per host and torn down on close.
 *
 * One `OutputPoller` is shared across every connection so two browser tabs
 * subscribing to the same `(host, pane_id)` share one underlying poll loop
 * (CONTRACT-TIER2.md section 5.1) instead of doubling herdr's poll load.
 */
export async function registerWebSocket(app: FastifyInstance, hosts: HostRegistry): Promise<void> {
  await app.register(websocketPlugin);

  const poller = new OutputPoller(hosts, OUTPUT_POLL_INTERVAL_MS);

  app.get("/ws", { websocket: true }, (socket) => {
    const connectionId = randomUUID();
    const subscriptions = new Map<string, Subscription>();

    const send = (message: unknown): void => {
      if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(message));
    };

    const ensureSubscription = (runtime: HostRuntime, host: string): Subscription => {
      let sub = subscriptions.get(host);
      if (!sub) {
        const kinds = new Set<EventKind>();
        const listener = (event: WsEvent): void => {
          if (kinds.has(event.event)) send(event);
        };
        sub = { kinds, listener };
        runtime.on("bridge-event", listener);
        subscriptions.set(host, sub);
      }
      return sub;
    };

    socket.on("message", (raw: Buffer | string) => {
      void (async () => {
        let request: WsRequest;
        try {
          request = JSON.parse(raw.toString()) as WsRequest;
        } catch {
          return; // not valid JSON — nothing sane to reply with, drop it
        }

        const response = await dispatch(request, {
          hosts,
          onSubscribe: (host, kinds) => {
            const runtime = hosts.get(host);
            if (runtime) {
              const sub = ensureSubscription(runtime, host);
              for (const kind of kinds) sub.kinds.add(kind);
            }
            return randomUUID();
          },
          subscribeOutput: (host, params) =>
            poller.subscribe(host, params.pane_id, params.source, params.format, connectionId, send),
          unsubscribeOutput: (subscriptionId) => poller.unsubscribe(subscriptionId),
        });

        send(response);
      })();
    });

    socket.on("close", () => {
      for (const [host, sub] of subscriptions) {
        hosts.get(host)?.off("bridge-event", sub.listener);
      }
      subscriptions.clear();
      poller.dropConnection(connectionId);
    });
  });
}
