#!/usr/bin/env python3
"""SubagentStart hook (project-local, kanhrd).

Injects a short openspec workflow reminder into every subagent spawned
from inside this repo. Complements the global ponytail hook; both fire.

Always exits 0 — a broken hook must never block agent spawning.
"""
import json
import sys


CONTEXT = """
## OpenSpec workflow (project-local, kanhrd)

This repo uses **openspec** (https://openspec.dev / `openspec --help`) for
spec-driven change management. Every substantial lane follows:

1. **Propose first** — `openspec new change <name> --description "..."`
   scaffolds a change; then hand-author `openspec/changes/<name>/{proposal.md,
   tasks.md, specs/<cap>/spec.md}` (the CLI only creates README/.yaml).
   Run `openspec validate <name> --strict`. Only then implement.
2. **Archive on landing** — when the code ships and tests pass, run
   `openspec archive <name> --yes`. Spec deltas merge into
   `openspec/specs/<cap>/spec.md` (the persistent source of truth).

Fast exemptions (no proposal required): trivial typo/comment fixes,
lint-gate config tweaks, foreman-inline single-file edits <10 lines,
documentation-only edits under `docs/adr/**`.

When you're spawned as a lane, your brief tells you what to build. If the
brief doesn't mention an openspec proposal, either the coordinator has
already made one and pointed you at it, OR you're expected to make one
now as your first step. When in doubt, `openspec list` — if your lane's
name isn't in the active-changes list, create the proposal before
touching implementation code.

Existing capability specs (source of truth) live at `openspec/specs/`.
Existing proposals in flight are under `openspec/changes/` (archived ones
under `openspec/changes/archive/`).

## Brand + design + UX authority

If your lane touches `apps/web/src/**` or produces user-facing copy,
**you MUST read these three docs first**:

- `docs/BRAND.md` — voice (terse, lowercase, verbs of tending; no
  exclamation marks; care verbs on lifecycle/empty/error only), wordmark
  (lowercase serif + ochre brushstroke crook), domain renames
  (host→**pen**, workspace→**field**, tab→**lane**, pane→**card** in UI
  copy — wire/API/code keep herdr's terms).
- `docs/DESIGN-SYSTEM.md` — tokens (paper cream `#f4ede0` primary, ochre
  `#c8842a` accent, torii-red vermilion `#b6412a` for blocked; hairline
  rules over shadows; lucide icons; typography Shippori Mincho display,
  Inter UI, JetBrains Mono terminal; every spacing/radius/motion value
  is a token — no raw hex/px/rem in components).
- `docs/UX-GUIDELINES.md` — patterns (visible affordances not
  hover-only; keyboard-first; URL is state — rail is navigator not
  filter; empty states are next steps, not messages; drag-drop must work
  or not appear).

Do not invent copy, colors, or interaction patterns. Do not use HTML
entity glyphs or emoji in chrome. If the docs don't cover your case,
flag it in your report — a maintainer extends the docs; you don't.
""".strip()


def main() -> int:
    try:
        json.load(sys.stdin)
    except Exception:
        pass
    print(json.dumps({
        "hookSpecificOutput": {
            "hookEventName": "SubagentStart",
            "additionalContext": CONTEXT,
        }
    }))
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as exc:
        print("ERROR: openspec_context hook: %s" % exc, file=sys.stderr)
        sys.exit(0)
