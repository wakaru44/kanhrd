## 1. `HostRuntime` subscription stability

- [x] 1.1 `buildSubscriptionSpecs()` drops the per-pane
      `pane.agent_status_changed` loop; specs become a fixed set
      (`pane.created`, `pane.closed`, plus `LIFECYCLE_EVENT_KINDS`) that no
      longer depends on `paneIds`.
- [x] 1.2 Remove `subscribeWithPaneRecovery()` and `stalePaneIdFromError()`
      — no longer reachable once specs carry no `pane_id`. `establishSubscription()`
      calls `client.subscribe()` directly.
- [x] 1.3 Remove `scheduleResubscribe()`, `resubscribeTimer`, and
      `RESUBSCRIBE_DEBOUNCE_MS`; drop the `scheduleResubscribe()` calls in
      the `pane.created`/`pane.closed` push handlers and in `purgeCascade()`.
- [x] 1.4 `establishSubscription()` is called exactly once from
      `connectOnce()` (on connect and on reconnect-after-disconnect) — never
      from a lifecycle event handler.

## 2. Bridge-side agent-status polling

- [x] 2.1 Add a per-host poll loop (`pollAgentStatus()`, started in
      `start()`, stopped in `stop()`, self-gated on `connected`) that calls
      `pane.list` on an interval (`AGENT_STATUS_POLL_INTERVAL_MS`, default
      5s, overridable via a constructor param for tests) and diffs each
      pane's `agent_status` against the last-seen value.
- [x] 2.2 On a diff, emit the same `bridge-event` shape the old push handler
      emitted for `pane.agent_status_changed` (`{ id, host, agent_status }`),
      so `ws/server.ts` and the browser wire contract are untouched.
- [x] 2.3 Seed each pane's baseline `agent_status` without emitting (matches
      the old push subscription's semantics: no event for the value already
      known at subscribe time).
- [x] 2.4 Clean up per-pane agent-status tracking state in `untrackPane()`/
      `purgeCascade()` (renamed `paneIds` -> `paneAgentStatus` map) so closed
      panes don't leak into the diff map.

## 3. Tests

- [x] 3.1 Rewrote `apps/bridge/src/herdr/hosts.test.ts`'s `pane_not_found`
      recovery test (unreachable now — subscribe never carries a `pane_id`)
      into: (a) a fixed-spec-set assertion, and (b) proof that a burst of
      pane.created/pane.closed push events triggers no second
      `events.subscribe` call.
- [x] 3.2 Added unit coverage for the poll loop: baseline seeding emits
      nothing, a later `agent_status` change on the same pane emits exactly
      one `bridge-event`.
- [x] 3.3 Added an integration regression test,
      `apps/bridge/integration/lifecycle.test.ts` describe block "E", that
      opens a WS, subscribes to lifecycle event kinds, and — since this
      dev sandbox is a live shared herdr with genuine concurrent multi-lane
      activity, not a controllable steady-state instance — asserts the
      storm's actual signature (events referencing ids that don't
      currently exist in herdr) rather than a raw zero-events count.
- [x] 3.3b Added a stronger, environment-independent unit test
      ("resubscribe-cascade storm reproduction" in `hosts.test.ts`): a fake
      herdr that pushes a 1000-event backlog-replay burst on the one
      `events.subscribe` call; asserts the bridge absorbs it without
      triggering a second subscribe (no cascade) and without duplicating
      any event.
- [x] 3.4 Ran `pnpm --filter @kanhrd/bridge typecheck`,
      `pnpm --filter @kanhrd/bridge build`, and
      `pnpm --filter @kanhrd/bridge test` — all clean (69/69 unit tests).
- [ ] 3.5 `pnpm test:int` — **not run to completion for verification.**
      Discovered mid-lane that this suite's default config points at the
      real local herdr socket (`~/.config/herdr/herdr.sock`), which turned
      out to be the *user's own actively-used* herdr instance (confirmed
      live: pid, workspace `w6`, real codex/claude sessions) — running it
      creates real throwaway tabs/panes visible to the user. Two runs were
      made before this was caught: one showed `D1+D2` (previously
      known-failing) now PASSING (2229–3389ms), consistent with the
      resubscribe-storm no longer masking real event delivery, but this
      is not to be treated as a clean, repeatable confirmation — the
      foreman will run the authoritative live storm-verification smoke
      test separately against an idle herdr. Do not re-run `pnpm test:int`
      until an isolated-herdr test fixture exists (separate queued lane).

## 4. Openspec

- [x] 4.1 `openspec validate fix-bridge-subscription-backlog-storm --strict`
- [ ] 4.2 Archive on landing:
      `openspec archive fix-bridge-subscription-backlog-storm --yes`
