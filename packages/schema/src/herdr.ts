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
export type AgentStatus = 'idle' | 'working' | 'blocked' | 'done' | 'unknown';

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
  | 'pane.created'
  | 'pane.closed'
  | 'pane.agent_status_changed'
  | 'pane.output'
  | 'pane.graphics_frame'
  | 'workspace.created'
  | 'workspace.closed'
  | 'workspace.renamed'
  | 'tab.created'
  | 'tab.closed'
  | 'tab.renamed'
  | 'tab.moved'
  | 'pane.moved'
  | 'pane.updated';

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
export type Tier2SynthesizedEventKind = 'pane.output' | 'pane.graphics_frame';

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
  | { event: 'pane.created'; data: { type: 'pane_created'; pane: HerdrPaneInfo } }
  | { event: 'pane.closed'; data: { type: 'pane_closed'; pane_id: string; workspace_id: string } }
  | {
      event: 'pane.agent_status_changed';
      data: {
        type: 'pane_agent_status_changed';
        pane_id: string;
        workspace_id: string;
        agent_status: AgentStatus;
        agent?: string;
        title?: string;
        display_agent?: string;
      };
    }
  // --- Tier-3 lifecycle events, added by lane LC3. See the tier-3 section
  // near the bottom of this file for source citations. `data.type` values
  // are herdr's `EventData` variants under `#[serde(tag = "type", rename_all
  // = "snake_case")]` (src/api/schema/events.rs:420-421), matching the
  // tier-1/tier-2 convention above exactly.
  | {
      event: 'workspace.created';
      data: { type: 'workspace_created'; workspace: HerdrWorkspaceDetail };
    }
  | {
      event: 'workspace.closed';
      data: { type: 'workspace_closed'; workspace_id: string; workspace?: HerdrWorkspaceDetail };
    }
  | {
      event: 'workspace.renamed';
      data: { type: 'workspace_renamed'; workspace_id: string; label: string };
    }
  | { event: 'tab.created'; data: { type: 'tab_created'; tab: HerdrTabDetail } }
  | { event: 'tab.closed'; data: { type: 'tab_closed'; tab_id: string; workspace_id: string } }
  | {
      event: 'tab.renamed';
      data: { type: 'tab_renamed'; tab_id: string; workspace_id: string; label: string };
    }
  | {
      event: 'tab.moved';
      data: {
        type: 'tab_moved';
        tab_id: string;
        workspace_id: string;
        insert_index: number;
        tabs: HerdrTabDetail[];
      };
    }
  | {
      event: 'pane.moved';
      data: {
        type: 'pane_moved';
        previous_pane_id: string;
        previous_workspace_id: string;
        previous_tab_id: string;
        pane: HerdrPaneInfo;
        created_workspace?: HerdrWorkspaceDetail;
        created_tab?: HerdrTabDetail;
        closed_workspace_id?: string;
        closed_tab_id?: string;
      };
    }
  /**
   * `EventData::PaneUpdated` — carries the WHOLE `PaneInfo`, not a delta, so
   * a rename made in herdr's own interface (or by any other client) reaches
   * the board without a refetch. `Subscription::PaneUpdated` is global (no
   * `pane_id`), which is why the bridge's fixed subscription spec set stays
   * fixed. See the `pane.rename` round trip in
   * `openspec/changes/add-pane-workdir-and-task-title/design.md`.
   */
  | { event: 'pane.updated'; data: { type: 'pane_updated'; pane: HerdrPaneInfo } };

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
  /**
   * herdr's user-authored pane name, set by `pane.rename` and cleared by
   * `pane.rename` with `label: null`. The only name on a pane the operator
   * wrote themselves, which is why it outranks agent identity and `title`
   * in the card's title precedence. Absent (never `null`/`""`) when unset.
   */
  label?: string;
  title?: string;
  agent?: { name: string };
  /**
   * Git provenance of the pane's OWNING WORKSPACE, joined by the bridge from
   * `HerdrWorkspaceDetail.worktree`. Absent when the workspace resolves
   * outside any repository. `repo_key`/`repo_root` are deliberately not
   * projected — nothing renders them.
   */
  project?: {
    repo_name: string;
    checkout_path: string;
    is_linked_worktree: boolean;
  };
  agent_status: AgentStatus;
  /**
   * Epoch milliseconds, on the BRIDGE's clock, at which this bridge first
   * observed the pane holding its current `agent_status`. Bridge-injected;
   * herdr's `PaneInfo` carries no time field of any kind, so there is
   * nothing authoritative to mirror here.
   *
   * Three properties a reader must not overstate:
   *   - It is the bridge's OBSERVATION, never herdr's record.
   *   - It resets when the bridge restarts or reconnects to its host: a
   *     bridge that finds a pane already `working` does not know when that
   *     began, and omits the field rather than guessing.
   *   - Its resolution is one `AGENT_STATUS_POLL_INTERVAL_MS`, not the
   *     millisecond it happens to be expressed in.
   *
   * Absent means "the bridge cannot vouch" — including panes seen for the
   * first time at connect, and any bridge predating this field. It is never
   * `0`, `null` or "now"; consumers render no duration rather than a zero.
   */
  status_since?: number;
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
export type ReadSource = 'visible' | 'recent' | 'recent_unwrapped' | 'detection';

/**
 * herdr's `ReadFormat` enum, `#[serde(rename_all = "snake_case")]`.
 * Source: src/api/schema/common.rs:93-101. Default is `text`.
 */
export type ReadFormat = 'text' | 'ansi';

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
  direction: 'up' | 'down' | 'left' | 'right';
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
export type PaneGraphicsFormat = 'png' | 'rgb' | 'rgba' | 'bgra';

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

// ============================================================================
// Tier-3 (pane, tab, workspace lifecycle) — added by lane LC3. Tier-1/tier-2
// types above are UNCHANGED; no existing field, variant, or type was
// renamed or removed. Primary new sources:
//   - src/api/schema.rs             (`Method` enum: `WorkspaceCreate` :77,
//     `WorkspaceRename` :85, `WorkspaceClose` :93, `TabCreate` :103,
//     `TabRename` :111, `TabMove` :113, `TabClose` :115, `PaneSplit` :141,
//     `PaneMove` :145, `PaneClose` :230)
//   - src/api/schema/panes.rs       (`PaneSplitParams` :27-43, `PaneMoveParams`
//     :84-89, `PaneMoveDestination` :93-114, `PaneMoveResult` :618-638,
//     `PaneMoveReason` :641-645)
//   - src/api/schema/tabs.rs        (full file: `TabCreateParams` :8-19,
//     `TabRenameParams` :28-31, `TabMoveParams` :34-37, `TabInfo` :40-48)
//   - src/api/schema/workspaces.rs  (`WorkspaceCreateParams` :8-20,
//     `WorkspaceCloseParams` :23-27, `WorkspaceRenameParams` :30-33,
//     `WorkspaceInfo` :62-76, `WorkspaceWorktreeInfo` :79-85)
//   - src/api/schema/common.rs      (`SplitDirection` :72-75, `WorkspaceTarget`
//     :29-31, `TabTarget` :50-52, `PaneTarget` :34-36)
//   - src/api/schema/events.rs      (`Subscription` :17-88, `EventKind` :194-221,
//     `EventData` :422-520, `dot_name()` :224-254)
//   - src/api/schema/response.rs    (`ResponseResult` variants :44-131,
//     `Ok {}` :304)
//
// NOT included (out of scope for tier-3 lifecycle; see CONTRACT-TIER3.md
// section 5 for the reasoning): `pane.swap` (position swap, not create/close/
// move), `workspace.move` / `workspace.move_block` / `workspace.reordered`
// (workspace reordering — a board-layout concern, not lifecycle), `pane.zoom`,
// `layout.*` (tier-4). `pane.close` has no dedicated `pane.kill` — herdr
// uses `pane.close` uniformly for pane termination.
// ============================================================================

/**
 * herdr's `SplitDirection` enum, `#[serde(rename_all = "snake_case")]`.
 * Source: src/api/schema/common.rs:72-75. Only two variants exist — a split
 * always inserts the new pane to the right or below the target, never left
 * or above (contrast with the four-way `PaneDirection` used by `pane.swap`/
 * navigation, which is NOT the direction type `pane.split` takes).
 */
export type SplitDirection = 'right' | 'down';

/**
 * `Method::PaneSplit` params. Source: src/api/schema/panes.rs:27-43.
 * `right_click: PaneRightClickTarget` (a UI-click-origin disambiguator for
 * herdr's own TUI context menu, panes.rs:20-24) is herdr-TUI-private
 * input-origin metadata, not meaningful from an external client — omitted
 * here, same trimming rationale as `PaneReadParams.intent` in the tier-2
 * section above.
 */
export interface HerdrPaneSplitParams {
  workspace_id?: string;
  target_pane_id?: string;
  direction: SplitDirection;
  ratio?: number;
  cwd?: string;
  focus?: boolean;
  env?: Record<string, string>;
}

/**
 * `PaneMoveDestination`, herdr's reparent-target enum. Source:
 * src/api/schema/panes.rs:93-114, tagged `{ "type": ... }` snake_case.
 * `pane.move` is a DISTINCT operation from `tab.move`/`workspace.move`:
 * this one reparents a pane into a different tab/new tab/new workspace,
 * the latter two just reorder an existing list by `insert_index`. Do not
 * conflate the two when consuming this contract.
 */
export type HerdrPaneMoveDestination =
  | { type: 'tab'; tab_id: string; target_pane_id?: string; split: SplitDirection; ratio?: number }
  | { type: 'new_tab'; workspace_id?: string; label?: string }
  | { type: 'new_workspace'; label?: string; tab_label?: string };

/** `Method::PaneMove` params. Source: src/api/schema/panes.rs:84-89. */
export interface HerdrPaneMoveParams {
  pane_id: string;
  destination: HerdrPaneMoveDestination;
  focus?: boolean;
}

/**
 * herdr's `PaneMoveReason` enum, `#[serde(rename_all = "snake_case")]`.
 * Source: src/api/schema/panes.rs:641-645. Present (as `reason`) only when
 * `changed: false` — the move was a no-op (already in that tab, or the
 * source tab is zoomed and can't be torn down mid-move).
 */
export type HerdrPaneMoveReason = 'same_tab' | 'zoomed_tab';

/**
 * `ResponseResult::PaneMove` → `PaneMoveResult`. Source:
 * src/api/schema/panes.rs:618-638 and response.rs (`PaneMove { move_result
 * }`). `source_layout`/`target_layout` (`Box<PaneLayoutSnapshot>`,
 * split-tree geometry) are OMITTED here — same trimming rationale as the
 * rest of this file: the bridge does not need split-tree geometry to
 * reflect a pane move in a lifecycle UI. `created_workspace`/`created_tab`
 * document that moving the LAST pane out of a tab/workspace can itself
 * create the destination tab/workspace as a side effect; `closed_workspace_id`/
 * `closed_tab_id` document the symmetric case — moving the last pane OUT of
 * a tab/workspace closes it. Both pairs are independently optional.
 */
export interface HerdrPaneMoveResult {
  changed: boolean;
  reason?: HerdrPaneMoveReason;
  previous_pane_id: string;
  previous_workspace_id: string;
  previous_tab_id: string;
  pane: HerdrPaneInfo;
  created_workspace?: HerdrWorkspaceDetail;
  created_tab?: HerdrTabDetail;
  closed_workspace_id?: string;
  closed_tab_id?: string;
  focused_pane_id: string;
}

/**
 * `Method::TabCreate` params. Source: src/api/schema/tabs.rs:8-19.
 */
export interface HerdrTabCreateParams {
  workspace_id?: string;
  cwd?: string;
  focus?: boolean;
  label?: string;
  env?: Record<string, string>;
}

/**
 * `Method::PaneRename` params. Source: herdr's `PaneRenameParams` —
 * `label: ["string","null"]`, `pane_id: "string"`, `required: ["pane_id"]`.
 * Unlike `HerdrTabRenameParams`/`HerdrWorkspaceRenameParams` below, the
 * label IS optional and nullable here: `null` is herdr's first-class unset
 * form (`herdr pane rename <pane_id> --clear`).
 */
export interface HerdrPaneRenameParams {
  pane_id: string;
  label?: string | null;
}

/** `Method::TabRename` params. Source: src/api/schema/tabs.rs:28-31. Both fields required — there is no "unset label" form. */
export interface HerdrTabRenameParams {
  tab_id: string;
  label: string;
}

/**
 * `Method::TabMove` params. Source: src/api/schema/tabs.rs:34-37. Reorders
 * an existing tab within its workspace's tab list by index — NOT a
 * reparent (see `HerdrPaneMoveDestination` doc above for that operation).
 */
export interface HerdrTabMoveParams {
  tab_id: string;
  insert_index: number;
}

/**
 * Full `TabInfo` fields (source: src/api/schema/tabs.rs:40-48), additive
 * alongside the tier-1 `HerdrTabInfo` (which trims to `tab_id`/
 * `workspace_id`/`label`, exactly what a kanban card join needs).
 * `HerdrTabInfo` is UNCHANGED; this is a separate, richer type for tier-3
 * lifecycle results/events that need `number`/`focused`/`pane_count`/
 * `agent_status` too.
 */
export interface HerdrTabDetail {
  tab_id: string;
  workspace_id: string;
  number: number;
  label: string;
  focused: boolean;
  pane_count: number;
  agent_status: AgentStatus;
}

/** `Method::WorkspaceCreate` params. Source: src/api/schema/workspaces.rs:8-20. */
export interface HerdrWorkspaceCreateParams {
  /** Workspace whose focused pane supplies the `follow` cwd policy. */
  source_workspace_id?: string;
  cwd?: string;
  focus?: boolean;
  label?: string;
  env?: Record<string, string>;
}

/**
 * `Method::WorkspaceClose` params. Source: src/api/schema/workspaces.rs:23-27.
 *
 * IMPORTANT: `close_group` is NOT a generic "confirm destructive op" flag —
 * it has one specific meaning. herdr groups workspaces that share a linked
 * git worktree; closing ONE member of a >=2-member linked-worktree group
 * without `close_group: true` is REJECTED with error code
 * `workspace_group_close_required` (verified at
 * src/app/api/workspaces.rs:311-329, gate built from
 * src/app/actions.rs:951-969's `workspace_close_indices()`). Passing
 * `close_group: true` closes every workspace in that group, not just the
 * target. For a workspace with no linked-worktree siblings this field has
 * no effect and should stay `false`/omitted. See CONTRACT-TIER3.md section 5.
 */
export interface HerdrWorkspaceCloseParams {
  workspace_id: string;
  close_group?: boolean;
}

/** `Method::WorkspaceRename` params. Source: src/api/schema/workspaces.rs:30-33. Both fields required. */
export interface HerdrWorkspaceRenameParams {
  workspace_id: string;
  label: string;
}

/** `WorkspaceWorktreeInfo`. Source: src/api/schema/workspaces.rs:79-85. */
export interface HerdrWorkspaceWorktreeInfo {
  repo_key: string;
  repo_name: string;
  repo_root: string;
  checkout_path: string;
  is_linked_worktree: boolean;
}

/**
 * Full `WorkspaceInfo` fields (source: src/api/schema/workspaces.rs:62-76),
 * additive alongside tier-1's `HerdrWorkspaceInfo` (which trims to
 * `workspace_id`/`label` for kanban card name resolution).
 * `HerdrWorkspaceInfo` is UNCHANGED; this is a separate, richer type for
 * tier-3 lifecycle results/events.
 */
export interface HerdrWorkspaceDetail {
  workspace_id: string;
  number: number;
  label: string;
  focused: boolean;
  pane_count: number;
  tab_count: number;
  active_tab_id: string;
  agent_status: AgentStatus;
  /** Optional: herdr's `WorkspaceInfo.required` list omits both `tokens` and `worktree`. */
  tokens?: Record<string, string>;
  worktree?: HerdrWorkspaceWorktreeInfo;
}

/**
 * Bridge-projected workspace, mirroring the tier-1 `Pane` type's shape
 * (`host` injected, `name` resolved). NOT a herdr wire type. Used in
 * tier-3 method results and events wherever the browser needs to display a
 * workspace without a follow-up `workspace.list` round trip.
 */
export interface WorkspaceSummary {
  id: string;
  host: string;
  name: string;
}

/** Bridge-projected tab, same rationale as {@link WorkspaceSummary}. */
export interface TabSummary {
  id: string;
  host: string;
  workspace: { id: string };
  name: string;
}

/** `ResponseResult::WorkspaceCreated`. Source: src/api/schema/response.rs:57-61. */
export interface HerdrWorkspaceCreateResult {
  workspace: HerdrWorkspaceDetail;
  tab: HerdrTabDetail;
  root_pane: HerdrPaneInfo;
}

/** `ResponseResult::WorkspaceInfo` (used by `workspace.rename`'s result). Source: src/api/schema/response.rs:54-56. */
export interface HerdrWorkspaceRenameResult {
  workspace: HerdrWorkspaceDetail;
}

/** `ResponseResult::TabCreated`. Source: src/api/schema/response.rs:90-93. */
export interface HerdrTabCreateResult {
  tab: HerdrTabDetail;
  root_pane: HerdrPaneInfo;
}

/** `ResponseResult::TabInfo` (used by `tab.rename`'s result). Source: src/api/schema/response.rs:87-89. */
export interface HerdrTabRenameResult {
  tab: HerdrTabDetail;
}

/** `ResponseResult::TabList` (used by `tab.move`'s result — the whole reordered list). Source: src/api/schema/response.rs:94-96. */
export interface HerdrTabMoveResult {
  tabs: HerdrTabDetail[];
}

/**
 * `ResponseResult::Ok`. Source: src/api/schema/response.rs:304. Shared empty
 * success shape for `pane.close`, `tab.close`, and `workspace.close` — none
 * of the three return the closed resource back (it's gone); the browser
 * relies on the matching `*.closed` event (already in flight on the same
 * connection) for confirmation of what was actually torn down. See
 * CONTRACT-TIER3.md section 6 for the cascading-close event-ordering caveat.
 */
export type HerdrOkResult = Record<string, never>;
