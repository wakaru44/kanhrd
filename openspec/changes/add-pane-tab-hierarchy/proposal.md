## Why

herdr's model is host → workspace → **tab** → **pane**, and its TUI draws
both of the bottom two levels at once: a tab row across the top
(`SVC | GPT | term2 | do-herdr | +`), and the panes of the selected tab as
titled windows below it.

kanhrd's pane view draws one level, in the other one's slot. The strip
under the title lists `siblings` — `pane-detail.ts` derives them as panes
with the same host AND the same `tab.id` — so it is a **pane** strip
sitting where herdr puts **tabs**. From a terminal there is no way to
reach another tab at all: you go back to the board first.

The keyboard has the mirror-image gap. `prefix + n` / `prefix + p` are
bound and they do fire on the pane route, but `cycleTab` calls
`store.setScope(...)`, which moves the **board's** scope. Nothing visible
happens to the terminal you are looking at; the keys are silent. Meanwhile
`prefix + o` (next pane in this tab) works there and has a visible control
beside it. So the pane view has pane-level keys with no tab-level keys,
and the board has tab-level keys with no pane-level ones.

## What Changes

### The bar carries both levels, in herdr's order

```text
← back to the board   kanhrd / SVC   Kanhrd Service ✎      [local]
 SVC │ GPT │ term2 │ do-herdr                                        ← tabs
 ● Kanhrd Service   ○ Kanhrd Term                                    ← panes in this tab
```

The tab strip lists the tabs of the route pane's **workspace** on that
host, derived client-side from `PanesStore.tabsSignal` exactly the way the
pane strip already derives its siblings: no wire call, no schema change,
no new capability. Each entry is a **link** to a pane detail route, so the
URL stays the state and a shared link reproduces the view; selecting a tab
opens that tab's first pane.

The existing card switcher keeps its contract unchanged and becomes the
second level, marked as subordinate by type scale and indent rather than
by a second kind of chrome.

### `prefix + n` / `prefix + p` move what you are looking at

Pane detail registers a tab navigator with `KeyboardService`, in the same
seam `registerCardSwitcher` already uses, so "which tab is next" has one
implementation shared by the keys and the strip. On the pane route the
keys navigate to the next/previous tab's pane; on the board they keep
today's meaning (move the board's scope). One binding, one visible
affordance, per view.

### Deliberately not here

- **Side-by-side windows.** herdr renders the panes of a tab as titled
  windows next to each other. Doing that here means several live xterm
  instances, a focus model, and per-pane fit and resize — its own change
  (maintainer decision, 2026-09-12: ship the hierarchy and the keyboard
  first).
- **A `+` on the tab strip.** Creating a tab is `prefix + c`'s sibling on
  the board's create menu; a second create surface is a separate decision.
- **Workspace-level navigation in the bar.** The breadcrumb already names
  the workspace, and the rail is the navigator (`docs/UX-GUIDELINES.md`).

## Impact

- **Affected specs:** `terminal-top-bar` (ADDED: the tab level above the
  card switcher), `keyboard-shortcuts` (ADDED: tab movement acts on the
  view you are in).
- **Affected code:** `apps/web/src/app/pane-detail/tab-strip.{ts,html,scss}`
  (new), `pane-detail.{ts,html,scss}`, `state/keyboard.service.ts`,
  `shared/copy.ts`, plus `docs/BRAND.md`'s copy table for the two new
  strings.
- **No change to:** the wire, the schema, any capability flag, the card
  switcher's own contract, or the board's meaning of `prefix + n`.
