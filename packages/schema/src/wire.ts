/**
 * wire.ts — authored here (not mirrored). This is the WebSocket envelope
 * contract between the browser and the bridge, frozen for tier-1 kanban.
 *
 * The bridge speaks a DIFFERENT protocol to herdr itself (newline-delimited
 * JSON over `~/.config/herdr/herdr.sock`, see src/api/client.rs and
 * src/api/mod.rs:98 in the herdr repo, mirrored in herdr.ts). The bridge's
 * job is to translate herdr's per-host socket protocol into this single
 * multi-host WebSocket protocol for the browser. Method names below
 * (`pane.list`, `events.subscribe`) intentionally match herdr's own method
 * names one-for-one so the mapping is obvious, but the envelope shape
 * (`host`, `id`, `ok`) is bridge-invented, not herdr's.
 */

import type { EventKind, HostSummary, Pane } from "./herdr.js";

/** Every wire message — either direction — carries the host it concerns. */
interface WithHost {
  host: string;
}

/**
 * Client → server request. `id` is client-generated and echoed back on the
 * matching response so multiple in-flight requests can be correlated.
 */
export interface WsRequest<M extends BridgeMethod = BridgeMethod> extends WithHost {
  id: string;
  method: M;
  params?: BridgeMethodParams[M];
}

/** Server → client success response. */
export interface WsResponseSuccess<M extends BridgeMethod = BridgeMethod> extends WithHost {
  id: string;
  ok: true;
  data?: BridgeMethodResult[M];
}

/** Server → client error response. */
export interface WsResponseError extends WithHost {
  id: string;
  ok: false;
  error: WsErrorBody;
}

export interface WsErrorBody {
  code: string;
  message: string;
}

export type WsResponse<M extends BridgeMethod = BridgeMethod> =
  | WsResponseSuccess<M>
  | WsResponseError;

/**
 * Server → client event frame. Unlike responses, events are unsolicited and
 * carry no `id` — they arrive after a successful `events.subscribe` for
 * that host, one frame per herdr `EventEnvelope` the bridge received.
 */
export interface WsEvent<K extends EventKind = EventKind> extends WithHost {
  event: K;
  payload: BridgeEventPayload[K];
}

/** Any frame the bridge may push over the WebSocket, unprompted or not. */
export type WsServerMessage = WsResponse | WsEvent;

/** Tier-1 methods the bridge exposes to the browser over this WebSocket. */
export type BridgeMethod = "pane.list" | "events.subscribe";

/** Per-method params, keyed the same way as `BridgeMethod`. */
export interface BridgeMethodParams {
  "pane.list": Record<string, never>;
  "events.subscribe": { kinds: EventKind[] };
}

/** Per-method success `data`, keyed the same way as `BridgeMethod`. */
export interface BridgeMethodResult {
  "pane.list": { panes: Pane[] };
  "events.subscribe": { subscription_id: string };
}

/**
 * Per-event `payload`, keyed the same way as `EventKind`. All three tier-1
 * events carry enough for the browser to patch its board without a refetch.
 */
export interface BridgeEventPayload {
  "pane.created": { pane: Pane };
  "pane.closed": { id: string; host: string; workspace: { id: string } };
  "pane.agent_status_changed": { id: string; host: string; agent_status: Pane["agent_status"] };
}

// --- REST fallback (same contract, different transport) ---------------

/** `GET /api/hosts` */
export interface GetHostsResponse {
  hosts: HostSummary[];
}

/** `GET /api/hosts/:host/panes` */
export interface GetHostPanesResponse {
  panes: Pane[];
}
