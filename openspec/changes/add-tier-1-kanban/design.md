## Context

See proposal.md - Why. herdr already exposes a per-host JSON API over a
local Unix/named-pipe socket (`src/api/client.rs`, newline-delimited
JSON), with `pane.list`, `events.subscribe`, and ~120 other methods this
change deliberately ignores. That API has no concept of "multiple hosts"
or "browser client" — it's one connection per herdr instance, speaking
raw JSON-RPC-like frames with no `host` field and no subscription id.
kanhrd's bridge is the thing that turns N per-host socket connections
into one multi-host WebSocket the browser can hold open.

## Goals / Non-Goals

**Goals:**
- Freeze a wire shape L2 (bridge) and L3 (web) can build against in
  parallel without a shared runtime to test against yet.
- Make the herdr-schema mismatches (no subscription id, no
  workspace/tab names on `PaneInfo`, no `pane.destroyed`) explicit and
  documented once, instead of each lane rediscovering them independently.

**Non-Goals:**
- Implementing the bridge or the web app (later lanes).
- Designing tiers beyond kanban (terminal view, pane lifecycle actions,
  layouts, plugins) — out of scope per proposal.md.
- Solving workspace/tab rename staleness — accepted tier-1 gap, noted in
  CONTRACT.md section 8.

## Decisions

**Bridge event names mirror herdr's `EventKind.dot_name()` 1:1** (
`pane.created`, `pane.closed`, `pane.agent_status_changed`) rather than
inventing bridge-specific names. Alternative considered: a renamed,
browser-friendlier event vocabulary — rejected because it adds a
translation table for zero behavioral benefit and makes cross-referencing
herdr's own docs harder for whoever debugs this later.

**`subscription_id` is bridge-minted, not herdr-sourced.** herdr's
`events.subscribe` returns an empty ack; subscribing is a property of the
socket connection, not a revocable handle. The bridge mints one id per
(host, browser-subscribe-call) so the browser has something to reference
if it ever wants to unsubscribe from just one host without closing the
whole WebSocket. Alternative considered: no id at all, unsubscribe by
closing the WebSocket — rejected because a multi-host board needs
per-host granularity (a user might only care about 2 of their 5 hosts at
a time).

**`Pane.workspace`/`Pane.tab` are bridge-resolved `{id, name}` pairs, not
raw ids.** herdr's `PaneInfo` only has `workspace_id`/`tab_id`. Requiring
L3 to also fetch `workspace.list`/`tab.list` and join client-side would
leak a herdr implementation detail into the browser and duplicate the
join logic in two places. The bridge does the join once, server-side.

**`last_output_snippet` is optional and unpopulated in tier-1.** Getting
it means an extra `pane.read` call per pane per board refresh — real cost
with no current requirement asking for it. Modeled as optional now so a
later tier can add it without a breaking field-shape change, per the
stable-endpoint-contract instinct even though this repo predates any
released client.

**Bridge method/event names are typed as literal unions in `wire.ts`**
(`BridgeMethod`, `EventKind`) instead of bare `string`, tightening the
brief's stated shape. Alternative: keep them as plain `string` exactly as
specified — rejected because the stricter type is a strict supertype at
the value level (every literal is still a `string`) and catches a whole
class of L2/L3 typos at compile time for free.

## Risks / Trade-offs

- [Workspace/tab rename events aren't in tier-1's subscribed set] → the
  bridge's name cache can go stale until the browser refetches via
  `pane.list`. Mitigation: documented as an accepted gap in CONTRACT.md;
  revisit if L3 UAT shows stale names are actually noticed by users.
- [Two independent wire protocols in one process (herdr socket ↔ bridge,
  bridge ↔ browser WebSocket)] → risk of L2 conflating the two `Request`/
  `Response` shapes since both use the words "request"/"response".
  Mitigation: `herdr.ts` types are prefixed `Herdr*` for the raw wire,
  `wire.ts` types are unprefixed for the bridge-browser wire; CONTRACT.md
  section 8 calls this out explicitly.
- [No running bridge or web app yet to validate this contract against] →
  the contract is frozen from reading Rust source, not from an integration
  test. Mitigation: this is real, but bounded — it's a text-derived
  contract by design (freeze before fan-out); L2 should raise a follow-up
  contract change immediately if implementation reveals a wrong
  assumption rather than silently drifting from `wire.ts`/`herdr.ts`.

## Migration Plan

N/A — this is the first contract in a zero-commit repo; nothing to
migrate from.
