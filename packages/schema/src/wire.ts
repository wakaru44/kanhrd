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

import type {
  EventKind,
  GraphicsFrameHeader,
  HostSummary,
  Pane,
  PaneGraphicsInfoData,
  ReadFormat,
  ReadSource,
} from "./herdr.js";

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

/**
 * Bridge methods the browser may call over this WebSocket. Tier-1's two
 * methods are unchanged; everything below `"bridge.capabilities"` is new in
 * tier-2 (terminal detail view). See CONTRACT-TIER2.md for the full method
 * table and herdr source cross-references.
 *
 * `"pane.resize"`, `"pane.graphics.info"`, and `"pane.graphics.stream"` are
 * OPTIONAL capabilities — a tier-2 bridge may legitimately answer them with
 * an error (`unsupported_operation` / `unavailable`) rather than a success.
 * Probe `"bridge.capabilities"` before assuming any of the three works.
 */
export type BridgeMethod =
  | "pane.list"
  | "events.subscribe"
  | "bridge.capabilities"
  | "pane.read"
  | "pane.subscribe_output"
  | "pane.unsubscribe_output"
  | "pane.send_keys"
  | "pane.send_text"
  | "pane.resize"
  | "pane.graphics.info"
  | "pane.graphics.stream";

/**
 * Per-method params, keyed the same way as `BridgeMethod`. `host` is never
 * repeated inside params — it's already on the enclosing `WsRequest`
 * envelope (`WithHost`), matching the tier-1 convention (`pane.list` has no
 * `host` field in its params either). The tier-2 brief's per-method shapes
 * that listed `host` inline are folded into the envelope the same way.
 */
export interface BridgeMethodParams {
  "pane.list": Record<string, never>;
  "events.subscribe": { kinds: EventKind[] };
  /** No params; returns what this bridge build supports. See `BridgeCapabilities`. */
  "bridge.capabilities": Record<string, never>;
  "pane.read": {
    pane_id: string;
    /** Default `"recent"` — see `BridgeMethodResult["pane.read"]` doc for why. */
    source?: ReadSource;
    /** Default `"ansi"` — preserves color/style for the xterm.js renderer. */
    format?: ReadFormat;
    lines?: number;
    /** Default `false`; only meaningful for `format: "text"`. */
    strip_ansi?: boolean;
  };
  /**
   * Starts bridge-side polling of `pane_id` and pushes `pane.output` events
   * on change. Defaults to `source: "visible"` (bounded to the terminal's
   * current viewport size) so each poll/push is cheap — pass `"recent"` to
   * also pick up scrollback on first push, at higher per-poll cost.
   */
  "pane.subscribe_output": {
    pane_id: string;
    source?: ReadSource;
    format?: ReadFormat;
  };
  "pane.unsubscribe_output": { subscription_id: string };
  "pane.send_keys": { pane_id: string; keys: string[] };
  "pane.send_text": { pane_id: string; text: string };
  /**
   * OPTIONAL / currently always rejected. herdr has no public API to set a
   * pane's PTY dimensions from an external client — see
   * CONTRACT-TIER2.md section 5. Shape kept so L2/L3 can compile against it
   * and flip it on without a wire change if herdr ever adds the primitive.
   */
  "pane.resize": { pane_id: string; cols: number; rows: number };
  /** OPTIONAL. Config/capability metadata for the graphics-overlay path — not pane content. */
  "pane.graphics.info": { pane_id: string };
  /**
   * OPTIONAL. Starts forwarding this pane's graphics-overlay layer state as
   * `pane.graphics_frame` events. NOT a way to view an agent's own
   * kitty-graphics/sixel output — see CONTRACT-TIER2.md section 5.
   */
  "pane.graphics.stream": { pane_id: string; layer_id?: string; z_index?: number };
}

/** Bridge-reported feature set. Result of `"bridge.capabilities"`. */
export interface BridgeCapabilities {
  /** Highest tier this bridge build implements. A tier-1-only bridge never answers this method at all. */
  tier: 1 | 2;
  /** Always required once `tier >= 2`: `pane.read` + `pane.subscribe_output` + `pane.send_keys` / `pane.send_text`. */
  terminal: boolean;
  /** Whether `pane.resize` can succeed. Always `false` today — see CONTRACT-TIER2.md section 5. */
  paneResize: boolean;
  /** Whether `pane.graphics.info` / `pane.graphics.stream` are wired up. Safe to omit UI for this when `false`. */
  paneGraphics: boolean;
  /** Bridge-side `pane.subscribe_output` polling cadence, for UI that wants to set expectations on live-ness. */
  outputPollIntervalMs: number;
}

/** Per-method success `data`, keyed the same way as `BridgeMethod`. */
export interface BridgeMethodResult {
  "pane.list": { panes: Pane[] };
  "events.subscribe": { subscription_id: string };
  "bridge.capabilities": BridgeCapabilities;
  /**
   * `content`/`revision`/`truncated`/`format`/`source` are herdr's
   * `PaneReadResult` (see `HerdrPaneReadResult` in herdr.ts) with `pane_id`/
   * `workspace_id`/`tab_id` dropped (redundant with the request/`Pane`
   * already known to the browser) and `text` renamed `content` for
   * consistency with `pane.output`'s payload below.
   */
  "pane.read": {
    content: string;
    revision: number;
    truncated: boolean;
    format: ReadFormat;
    source: ReadSource;
  };
  "pane.subscribe_output": { subscription_id: string };
  "pane.unsubscribe_output": Record<string, never>;
  "pane.send_keys": Record<string, never>;
  "pane.send_text": Record<string, never>;
  /** Never resolves successfully in the current tier-2 bridge — see `BridgeMethodParams["pane.resize"]`. */
  "pane.resize": Record<string, never>;
  "pane.graphics.info": PaneGraphicsInfoData;
  "pane.graphics.stream": { subscription_id: string };
}

/**
 * Per-event `payload`, keyed the same way as `EventKind`. Tier-1's three
 * events are unchanged.
 */
export interface BridgeEventPayload {
  "pane.created": { pane: Pane };
  "pane.closed": { id: string; host: string; workspace: { id: string } };
  "pane.agent_status_changed": { id: string; host: string; agent_status: Pane["agent_status"] };
  /**
   * Pushed by the bridge after `pane.subscribe_output` whenever a poll of
   * `pane_id` observes a new `revision`. `content` is a FULL snapshot at the
   * subscribed `source`/`format` — NOT an incremental byte chunk. herdr's
   * `pane.read` returns a rendered text/ANSI snapshot from its terminal-grid
   * state (via libghostty-vt), not a raw PTY byte tap, so there is no
   * incremental "chunk" to forward; the bridge cannot fabricate one without
   * re-deriving terminal semantics itself. The tier-2 brief's payload sketch
   * used a `chunk` field name assuming byte-level streaming was available —
   * deviation recorded in CONTRACT-TIER2.md section 5. Client-side, the
   * simplest correct handling is `term.reset(); term.write(content)` on
   * every event; a smarter diff-and-patch is a bridge-local optimization
   * that doesn't change this wire shape.
   */
  "pane.output": {
    subscription_id: string;
    pane_id: string;
    revision: number;
    content: string;
    format: ReadFormat;
    truncated: boolean;
  };
  /**
   * OPTIONAL. Announces a graphics-overlay frame on a JSON control frame;
   * the raw image bytes for `body_seq` follow as the NEXT binary WebSocket
   * frame on the same connection (no interleaving — the browser must fully
   * consume the binary frame before another JSON frame for the same
   * subscription is sent). See CONTRACT-TIER2.md section 5 for the full
   * correlation protocol and the base64 fallback shape.
   */
  "pane.graphics_frame": {
    subscription_id: string;
    pane_id: string;
    layer_id?: string;
    body_seq: number;
    header: GraphicsFrameHeader;
  };
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
