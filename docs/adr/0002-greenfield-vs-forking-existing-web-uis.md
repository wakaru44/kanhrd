# ADR-0002: Greenfield sidecar, not forking existing web UIs

Status: Accepted
Date: 2026-09-09

## Context

Two prior projects already put herdr in a browser. `eyalev/herdr-web` is a
Node bridge that renders terminal output by translating SGR codes to DOM
elements; it has no auth and binds to `127.0.0.1` only, targeting a mobile
PWA use case. `alecuba16/herdr-webui` is a Rust/Axum service with an
embedded herdr backend and a ghostty-based renderer, built around a
single-host, terminal-workspace-centric interaction model. Neither offers a
kanban view — that's the gap kanhrd exists to fill. Before building
anything new, the question is whether either project's codebase is a
reasonable starting point.

## Decision

Build kanhrd as a greenfield sidecar. Read both prior projects for lessons
on what works and what doesn't — the SGR-to-DOM rendering failure mode
especially — but take no code lineage from either.

## Alternatives considered

- **A. Fork `herdr-web`** — rejected: SGR-to-DOM rendering cannot survive
  real agent TUIs that use alt-screen, cursor repositioning, or kitty
  graphics; the project's own open issues confirm this ceiling.
- **B. Fork `herdr-webui`** — rejected: it's single-host and built around a
  terminal-workspace-centric model, not multi-host kanban; adapting it
  would mean deleting most of its architecture before kanhrd's actual
  feature could go in.
- **C. Frankenfork (merge pieces of both)** — rejected: two upstreams, two
  languages, two build systems — the integration cost exceeds the value of
  any code reused.
- **D. Greenfield sidecar** — chosen.

## Consequences

- Full ownership of the stack and freedom to design the multi-host +
  kanban surface from first principles instead of retrofitting it onto an
  architecture built for a different problem.
- Re-solving problems both prior projects already solved once — chiefly the
  JSON-socket-to-WebSocket plumbing — but that surface is small (roughly
  200 lines), so the cost is low.
- Revisit only if kanhrd's own maintenance load becomes disproportionate to
  its value *and* one of the existing projects has since evolved to
  actually fit (multi-host support, a kanban view, or both).
