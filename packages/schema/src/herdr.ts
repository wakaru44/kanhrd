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
export type EventKind = "pane.created" | "pane.closed" | "pane.agent_status_changed";

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
