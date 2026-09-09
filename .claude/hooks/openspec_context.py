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

1. **Propose first** — `openspec change add <name>`, then draft
   `openspec/changes/<name>/{proposal.md, tasks.md, specs/<cap>/spec.md}`.
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
