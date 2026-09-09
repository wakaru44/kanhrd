import { randomUUID } from "node:crypto";
import websocketPlugin from "@fastify/websocket";
import type { FastifyInstance } from "fastify";
import type { EventKind, WsEvent, WsRequest } from "@kanhrd/schema";
import type { HostRegistry, HostRuntime } from "../herdr/hosts.js";
import { dispatch } from "./dispatch.js";

interface Subscription {
  kinds: Set<EventKind>;
  listener: (event: WsEvent) => void;
}

/**
 * Registers the single `/ws` endpoint. Each browser connection tracks its
 * own subscriptions (host -> kinds); a `bridge-event` listener is attached
 * lazily on first subscribe per host and torn down on close.
 */
export async function registerWebSocket(app: FastifyInstance, hosts: HostRegistry): Promise<void> {
  await app.register(websocketPlugin);

  app.get("/ws", { websocket: true }, (socket) => {
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
        });

        send(response);
      })();
    });

    socket.on("close", () => {
      for (const [host, sub] of subscriptions) {
        hosts.get(host)?.off("bridge-event", sub.listener);
      }
      subscriptions.clear();
    });
  });
}
