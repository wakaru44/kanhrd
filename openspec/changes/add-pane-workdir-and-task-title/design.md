## Direction

Two identity layers per card, kept strictly separate by authorship.
herdr owns the pane's location and its own label; the operator owns the
task title. Neither layer overwrites the other, and the layer the user
authored never travels to herdr.

## Q1 — does herdr expose a pane's working directory?

**Yes.** Verified against the installed herdr 0.8.2 without contacting
the operator's running session: read-only inspection of the binary's
embedded API JSON schema and its changelog.

### Evidence

- `/opt/homebrew/Cellar/herdr/0.8.2/bin/herdr` embeds its own request /
  event JSON schema. The `PaneInfo` definition there declares, among its
  19 properties:

  ```text
  "cwd":            { "type": ["string", "null"] }
  "foreground_cwd": { "type": ["string", "null"] }
  ```

  Neither appears in the `required` list
  (`pane_id`, `terminal_id`, `workspace_id`, `tab_id`, `focused`,
  `agent_status`, `revision`), so both are nullable and may be absent.

- The same binary's serde field table for `struct PaneInfo with 19
  elements` lists, in declaration order: `pane_id`, `terminal_id`,
  `workspace_id`, `tab_id`, `label`, `focused`, `cwd`,
  `foreground_cwd`, `title`, `terminal_title`,
  `terminal_title_stripped`, `agent`, `display_agent`, `agent_status`,
  `agent_session`, `state_labels`, `tokens`, `scroll`, `revision`.

- `/opt/homebrew/Cellar/herdr/0.8.2/CHANGELOG.md:514` (release
  `0.6.5`, 2026-05-29): "Added `foreground_cwd` to pane and agent
  API/CLI responses so integrations can inspect the active foreground
  process directory **without changing the existing pane/workspace
  `cwd` semantics**." — i.e. `cwd` predates `0.6.5`; `foreground_cwd`
  was added beside it.

### Why our schema showed no `cwd`

`packages/schema/src/herdr.ts:84` is a deliberately trimmed projection
("Raw `PaneInfo` fields the bridge reads off herdr, trimmed to what
feeds a kanban card"). It models 9 of herdr's 19 `PaneInfo` fields and
omits `cwd` / `foreground_cwd` along with `terminal_id`, `focused`,
`terminal_title`, `state_labels`, `tokens` and `scroll`. The upstream
brief's claim was right about herdr and wrong about our projection; the
disproof of "our schema has no cwd" was also right. Both are true.

`apps/bridge/src/herdr/hosts.ts:145` and `:461` request
`pane.list` with no field selection and receive whole `PaneInfo`
objects, so `cwd` is **already arriving on the wire today** — it is
discarded at `apps/bridge/src/herdr/project.ts:20-31`, where
`projectPane` builds the outbound `Pane` from a fixed field list. The
change is therefore purely additive: model two fields, forward one.

### Which of the two to display

`cwd` is the pane's directory; `foreground_cwd` is wherever the current
foreground process happens to be, which moves as the agent runs
subprocesses. The stable one is the right card identity, so the bridge
projects `cwd ?? foreground_cwd` into a single wire field. This mirrors
`projectPane`'s existing `display_agent ?? agent` precedence rather
than inventing a second convention, and keeps the web app from having
to know herdr's two-directory model. Both raw fields stay typed in
`HerdrPaneInfo` so a later lane can distinguish them without a schema
change.

## Q2 — where does the task title live?

**Decision: browser `localStorage`, key `kanhrd.task-titles`.**

Value shape — nested by pen, so no delimiter can collide with a
host name from `kanhrd.config.yaml`:

```text
{ "<host>": { "<pane_id>": "<task title>" } }
```

Read and written through a signals-based
`apps/web/src/app/state/task-title.service.ts`, modelled on the
existing `apps/web/src/app/state/theme.service.ts`
(`const STORAGE_KEY = "kanhrd.theme"`). The `kanhrd.` prefix means the
key is already covered by the settings service's local-data wipe
(`KANHRD_STORAGE_PREFIX` in `apps/web/src/app/state/settings.service.ts:46`);
no new clear-data path is needed.

### Alternatives considered

#### Bridge-persistent (SQLite or a JSON file)

Rejected for now. It is the only option that gives cross-device titles,
and it is the migration target if that is ever asked for. Against it
today: the bridge has no storage layer at all — `apps/bridge/src` is
config, herdr clients, HTTP and WS, and nothing else — so this would
introduce a durable-state subsystem, a file/DB path to configure, a
write-durability question, a multi-client conflict question, and a
backup story, all for one string per card. It also makes the bridge
stateful, which the current architecture deliberately avoids.

#### herdr-side

Rejected on authorship grounds, not capability grounds — herdr does have
two surfaces:

- `pane.rename` (`PaneRenameParams { pane_id, label }`) writes the very
  `label` this change is required to preserve. Using it would collapse
  the two identity layers into one and destroy herdr's own name.
- `pane.report_metadata` (`PaneReportMetadataParams`, 13 fields
  including `title`, `display_agent`, `state_labels`, `tokens`,
  `applies_to_source`, `clear_title`, `ttl_ms`) is the **agent
  authority** channel: agent integrations report their own title with a
  TTL and an explicit clear. A user title written there would race with
  the agent's own reporting and could expire on its own.

Neither is a user-metadata store. Asking herdr upstream for a
third, user-owned `user_label` field is the clean long-term answer and is
worth filing, but it is not a dependency this change can take.

### Tradeoffs accepted

- Titles are per-device and per-browser. A second machine sees the
  herdr name only.
- Clearing site data loses titles. They are labels, not records.
- Private-window and storage-blocked contexts must degrade to
  "no titles", never to an error — every read and write is wrapped.

### What would force a migration

A request for titles that follow the operator across devices, or for
the title to be visible to anything other than this SPA (a second
client, a CLI, a notification). At that point the store moves to the
bridge and `kanhrd.task-titles` becomes a one-time import source: the
key shape `(host, pane_id) → string` is chosen so it maps to a bridge
row without reshaping.

## Rendering decisions

- **Card title slot** is `--font-ui` weight `500` per the binding family
  table at `docs/DESIGN-SYSTEM.md` § Typography, which lists "Agent card
  title → `--font-ui` at weight `500`", and per `docs/BRAND.md:64-68`
  reserving the display serif for rare surfaces. The upstream brief's
  "task title as `--font-display`" is superseded.
- **Truncation is computed, not CSS-tricked.** The location line's
  displayed value is derived in TypeScript as the last two path
  segments, prefixed `…/` when earlier segments were dropped. This is
  deterministic and unit-testable, and avoids the `direction: rtl`
  bidi hazard of eliding a path's head in CSS.
- **The full path is reachable without hover.** Per
  `docs/UX-GUIDELINES.md:297-300`, the full value is on the card's
  detail route and on keyboard focus, with `title` as a convenience for
  pointer users — never as the only route.
- **Absent values render nothing.** No `unknown`, no dash, no skeleton.

## Delivery order

Subfeature 1 (schema → bridge → web) and subfeature 2 (service → modal
→ card / pane detail) touch disjoint code apart from the card template,
and are sequenced so either can land alone. Subfeature 1 has no
dependency on `add-l-brand-neo-shepherd-redesign`; subfeature 2 needs
that change's overflow menu and `copy.ts`.
