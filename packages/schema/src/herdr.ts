/**
 * herdr.ts — manually mirrored from the herdr Rust source (sibling repo:
 * github.com/others/herdr, read-only reference). This file is NOT
 * generated; when herdr's JSON API schema changes, re-read the cited
 * files/lines and update this file by hand.
 *
 * Tier-1 scope only (kanban board). Field lists are trimmed to what the
 * bridge actually needs to build a `Pane` card — see CONTRACT.md's mapping
 * table for the full source-line references.
 *
 * Primary sources:
 *   - src/api/schema/common.rs   (AgentStatus, ~line 160)
 *   - src/api/schema/panes.rs    (PaneInfo ~line 527, PaneListParams ~line 315)
 *   - src/api/schema/workspaces.rs (WorkspaceInfo ~line 62)
 *   - src/api/schema/tabs.rs     (TabInfo ~line 40)
 *   - src/api/schema/events.rs   (EventKind ~line 194, EventData ~line 422)
 *   - src/api/schema/response.rs (ResponseResult::PaneList ~line 120,
 *     ResponseResult::SubscriptionStarted ~line 214)
 *   - src/api/schema.rs          (Method::PaneList, Method::EventsSubscribe,
 *     Method::EventsWait, ~lines 176-236)
 */

/**
 * herdr's `AgentStatus` enum, `#[serde(rename_all = "snake_case")]`.
 * Source: src/api/schema/common.rs:160-166. This is the wire value used
 * verbatim by every layer (herdr, bridge, browser) — no projection needed.
 */
export type AgentStatus = "idle" | "working" | "blocked" | "done" | "unknown";

/**
 * herdr's `EventKind` enum (src/api/schema/events.rs:194-221), narrowed to
 * the three kinds tier-1 kanban subscribes to. herdr serializes these via
 * `EventKind::dot_name()` (events.rs:224-253) as the exact strings below.
 *
 * NOTE: the grill brief guessed a `pane.destroyed` event; herdr's actual
 * name is `pane.closed` (events.rs:53, :212, :243). Deviation recorded in
 * CONTRACT.md.
 */
export type EventKind =
  | "pane.created"
  | "pane.closed"
  | "pane.agent_status_changed"
  | "pane.output"
  | "pane.graphics_frame";

/**
 * `pane.output` and `pane.graphics_frame` are BRIDGE-SYNTHESIZED and have no
 * matching herdr `EventKind`/`Subscription` variant — the browser subscribes
 * to them via `pane.subscribe_output` / `pane.graphics.stream`, not via
 * `events.subscribe`.
 *
 * herdr does define `EventKind::PaneOutputChanged` (events.rs:216,
 * `"pane.output_changed"`) and `EventData::PaneOutputChanged { pane_id,
 * min_revision }` (events.rs:173-177), but it has NO corresponding
 * `Subscription` variant (events.rs:16-85) — it cannot be requested through
 * the public `events.subscribe` method, only used internally. The nearest
 * requestable primitive is `Subscription::PaneOutputMatched` (events.rs:65-74),
 * which fires once per matched line against a caller-supplied regex/pattern
 * (`OutputMatch`, events.rs:109+) — a one-shot "wait for this text" trigger,
 * not a continuous output-delta stream. Neither is suitable as a general
 * "tell me whenever this pane's content changes" push primitive, so the
 * bridge implements `pane.output` by polling `pane.read` per subscribed
 * pane instead. See CONTRACT-TIER2.md section 5.
 */
export type Tier2SynthesizedEventKind = "pane.output" | "pane.graphics_frame";

/**
 * Raw `PaneInfo` fields the bridge reads off herdr, trimmed to what feeds a
 * kanban card. Source: src/api/schema/panes.rs:527-560.
 *
 * herdr does NOT include workspace/tab names here — only ids. The bridge
 * must resolve names by joining against `HerdrWorkspaceInfo.label` /
 * `HerdrTabInfo.label` (from `workspace.list` / `tab.list`, or from the
 * `WorkspaceInfo`/`TabInfo` payloads carried on pane lifecycle events).
 */
export interface HerdrPaneInfo {
  pane_id: string;
  workspace_id: string;
  tab_id: string;
  label?: string;
  agent?: string;
  title?: string;
  display_agent?: string;
  agent_status: AgentStatus;
  revision: number;
}

/**
 * Raw `WorkspaceInfo` fields needed to resolve a workspace name.
 * Source: src/api/schema/workspaces.rs:62-76. `label` is the display name.
 */
export interface HerdrWorkspaceInfo {
  workspace_id: string;
  label: string;
}

/**
 * Raw `TabInfo` fields needed to resolve a tab name.
 * Source: src/api/schema/tabs.rs:40-48. `label` is the display name.
 */
export interface HerdrTabInfo {
  tab_id: string;
  workspace_id: string;
  label: string;
}

/**
 * `Method::PaneList` params. Source: src/api/schema/panes.rs:314-318.
 * Tier-1 bridge always omits `workspace_id` (fetches all hosts' panes).
 */
export interface HerdrPaneListParams {
  workspace_id?: string;
}

/**
 * `ResponseResult::PaneList` result shape. Source:
 * src/api/schema/response.rs:120-122.
 */
export interface HerdrPaneListResult {
  panes: HerdrPaneInfo[];
}

/**
 * `Method::EventsSubscribe` params. Source: src/api/schema/events.rs:12-14.
 * herdr's `Subscription` enum (events.rs:18-85) is tagged `{ "type": ... }`;
 * tier-1 only ever sends the three unparameterized kinds below.
 */
export interface HerdrEventsSubscribeParams {
  subscriptions: Array<{ type: EventKind }>;
}

/**
 * `ResponseResult::SubscriptionStarted` — an EMPTY ack. Source:
 * src/api/schema/response.rs:214. herdr does NOT return a subscription id;
 * once subscribed, matching `EventEnvelope`s stream on the same connection.
 * This differs from the bridge's browser-facing `events.subscribe` result
 * (see wire.ts / CONTRACT.md), which does invent a `subscription_id` for
 * browser-side bookkeeping across multiple hosts on one WebSocket.
 */
export type HerdrSubscriptionStarted = Record<string, never>;

/**
 * `EventEnvelope` pushed by herdr after subscribing. Source:
 * src/api/schema/events.rs:362-365 (envelope) and :422-556 (`EventData`,
 * tagged `{ "type": ... }`), trimmed to the three tier-1 event payloads.
 */
export type HerdrEventEnvelope =
  | { event: "pane.created"; data: { type: "pane_created"; pane: HerdrPaneInfo } }
  | { event: "pane.closed"; data: { type: "pane_closed"; pane_id: string; workspace_id: string } }
  | {
      event: "pane.agent_status_changed";
      data: {
        type: "pane_agent_status_changed";
        pane_id: string;
        workspace_id: string;
        agent_status: AgentStatus;
        agent?: string;
        title?: string;
        display_agent?: string;
      };
    };

/**
 * Bridge-projected pane, one per kanban card. This is NOT a herdr wire
 * type — it's what the bridge builds by joining `HerdrPaneInfo` with the
 * resolved workspace/tab names and stamping on the `host` it read the pane
 * from. See CONTRACT.md's mapping table for the field-by-field source.
 */
export interface Pane {
  id: string;
  /** Bridge-injected; not present in herdr's own `PaneInfo`. */
  host: string;
  workspace: { id: string; name: string };
  tab: { id: string; name: string };
  title?: string;
  agent?: { name: string };
  agent_status: AgentStatus;
  /**
   * Not derivable from `pane.list` or the tier-1 event payloads above —
   * herdr only exposes output via a separate `pane.read` call
   * (src/api/schema/panes.rs:355-367), which tier-1 does not call per pane.
   * Left optional; a later tier can populate it once the bridge adds a
   * `pane.read` fan-out.
   */
  last_output_snippet?: string;
}

/** One entry in the bridge's REST `GET /api/hosts` response. */
export interface HostSummary {
  name: string;
  connected: boolean;
  last_error?: string;
}

// ============================================================================
// Tier-2 (terminal detail view) — added by lane LC2. Tier-1 types above are
// UNCHANGED. Primary new sources:
//   - src/api/schema.rs            (`Method` enum, ~lines 141-266)
//   - src/api/schema/panes.rs      (`PaneReadParams` :355-367, `PaneReadResult`
//     :755-764, `PaneSendTextParams` :334-337, `PaneSendKeysParams` :339-343,
//     `PaneResizeParams` :237-243, `PaneGraphicsStreamParams` :436-445)
//   - src/api/schema/common.rs     (`ReadSource` :77-84, `ReadFormat` :93-101)
//   - src/api/schema/response.rs   (`ResponseResult::PaneRead` :162-164,
//     `ResponseResult::PaneGraphicsInfo` :188-209, `ResponseResult::Ok` :304)
//   - src/api/schema/events.rs     (`EventKind::PaneOutputChanged` :216,
//     `Subscription` :16-85, `SubscriptionEventKind`/`Data` :367-419)
//   - src/api/server/pane_graphics_stream.rs (`FrameHeader` :36-51, direction
//     of the stream, timeouts :21-27)
// ============================================================================

/**
 * herdr's `ReadSource` enum, `#[serde(rename_all = "snake_case")]`.
 * Source: src/api/schema/common.rs:77-84.
 *
 * - `visible`: exactly the on-screen viewport (cols x rows), cheapest.
 * - `recent` / `recent_unwrapped`: viewport + scrollback, wrapped/unwrapped
 *   to the terminal's current width.
 * - `detection`: the narrow buffer herdr's own agent-status detector reads;
 *   not meant for human display, listed here only for completeness.
 */
export type ReadSource = "visible" | "recent" | "recent_unwrapped" | "detection";

/**
 * herdr's `ReadFormat` enum, `#[serde(rename_all = "snake_case")]`.
 * Source: src/api/schema/common.rs:93-101. Default is `text`.
 */
export type ReadFormat = "text" | "ansi";

/**
 * `Method::PaneRead` params. Source: src/api/schema/panes.rs:355-367.
 * herdr also carries a private `intent: ReadIntent` field
 * (`#[serde(skip)]`, common.rs:86-91) — not part of the public wire shape,
 * omitted here.
 */
export interface HerdrPaneReadParams {
  pane_id: string;
  source: ReadSource;
  lines?: number;
  format?: ReadFormat;
  strip_ansi?: boolean;
}

/**
 * `ResponseResult::PaneRead` → `PaneReadResult`. Source:
 * src/api/schema/panes.rs:755-764 and response.rs:162-164.
 */
export interface HerdrPaneReadResult {
  pane_id: string;
  workspace_id: string;
  tab_id: string;
  source: ReadSource;
  format: ReadFormat;
  text: string;
  revision: number;
  truncated: boolean;
}

/**
 * `Method::PaneSendText` params. Source: src/api/schema/panes.rs:334-337.
 */
export interface HerdrPaneSendTextParams {
  pane_id: string;
  text: string;
}

/**
 * `Method::PaneSendKeys` params. Source: src/api/schema/panes.rs:339-343.
 * NOTE: `keys` is a `Vec<String>` of herdr key-name tokens (e.g.
 * `["ctrl+c"]`, `["Enter"]`), not a single string. The original tier-2 brief
 * assumed `keys: string`; corrected here to match herdr's real shape. See
 * CONTRACT-TIER2.md section 2.
 */
export interface HerdrPaneSendKeysParams {
  pane_id: string;
  keys: string[];
}

/**
 * `Method::PaneResize` params. Source: src/api/schema/panes.rs:237-243.
 *
 * IMPORTANT: despite the name, this is NOT "set this pane's PTY to N cols
 * by M rows." It resizes a pane's split geometry within herdr's layout
 * tree (`direction` + `amount`, tmux-`resize-pane`-style) — the same
 * concept as dragging a split divider. herdr's `PaneInfo` (panes.rs:527-560)
 * carries no cols/rows fields at all, and PTY geometry is driven by the
 * primary TUI client's real terminal window
 * (`src/client/terminal_geometry.rs`, part of the private
 * same-install client/activation protocol, not the public JSON API).
 * There is currently no public herdr method that lets an external client
 * set or read a pane's PTY dimensions. See CONTRACT-TIER2.md section 5.
 */
export interface HerdrPaneResizeParams {
  pane_id?: string;
  direction: "up" | "down" | "left" | "right";
  amount?: number;
}

/**
 * `Method::PaneGraphicsInfo` result. Source: src/api/schema/response.rs:188-209.
 *
 * This is capability/config metadata for the graphics-overlay *write* path
 * (cell pixel size, which image formats and transports the server accepts,
 * size limits) — NOT a list of images currently drawn on the pane, and NOT
 * a way to read out a kitty-graphics/sixel escape sequence an agent process
 * emitted into the PTY. See CONTRACT-TIER2.md section 5 for why this means
 * tier-2's "view an agent's rendered graphics" goal is not achievable
 * through this method.
 */
export interface HerdrPaneGraphicsInfoResult {
  cell_width_px: number;
  cell_height_px: number;
  pane_visible: boolean;
  file_frame_directory?: string;
  file_frame_formats: string[];
  file_frame_max_bytes?: number;
  file_frame_direct_max_bytes?: number;
  file_frame_damage: boolean;
  max_layers_per_pane: number;
  pixel_mouse: boolean;
  file_frame_transport?: string;
}

/**
 * herdr's `PaneGraphicsFormat` enum. Source: src/api/schema/panes.rs:369-376.
 */
export type PaneGraphicsFormat = "png" | "rgb" | "rgba" | "bgra";

/**
 * herdr's private (non-schema, hand-parsed) `FrameHeader` JSON line that a
 * `pane.graphics.stream` client sends immediately before each binary frame
 * body. Source: src/api/server/pane_graphics_stream.rs:36-51.
 *
 * DIRECTION: `pane.graphics.stream` is a client → herdr PUSH — the caller
 * opens a dedicated connection, sends a `PaneGraphicsStreamParams` open
 * request, then repeatedly sends `{FrameHeader JSON}\n{binary body}` to
 * DRAW an image onto the pane's overlay layer (server methods
 * `PaneGraphicsStreamSet`/`...Direct`, both `#[serde(skip)]` / TUI-private
 * and unreachable from outside this framing). It is not a channel herdr
 * uses to push a pane's own rendered graphics content OUT to a viewer.
 * See CONTRACT-TIER2.md section 5.
 */
export interface HerdrGraphicsFrameHeader {
  format: PaneGraphicsFormat;
  image_width: number;
  image_height: number;
  data_length?: number;
  file?: { path: string };
  sequence?: number;
  revision?: number;
  placement?: {
    viewport_col?: number;
    viewport_row?: number;
    grid_cols?: number;
    grid_rows?: number;
  };
}

/** Alias kept for wire.ts import ergonomics; identical shape to {@link HerdrGraphicsFrameHeader}. */
export type GraphicsFrameHeader = HerdrGraphicsFrameHeader;

/** Alias kept for wire.ts import ergonomics; identical shape to {@link HerdrPaneGraphicsInfoResult}. */
export type PaneGraphicsInfoData = HerdrPaneGraphicsInfoResult;
