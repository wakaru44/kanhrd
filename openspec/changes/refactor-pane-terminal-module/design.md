## Context

The tier-2 detail view is the only place in kanhrd where a live terminal
exists. Everything that makes it work — xterm, the fit loop, touch
scrolling, `pane.read`/`pane.subscribe_output`, snapshot painting, the send
queue — was written inline in `PaneDetail` because that is where the
`ElementRef` was. The result is a deep module wearing a component's
clothes: a lot of behaviour, a small conceptual surface, and no way to
reach any of it except through a mounted fixture.

This change gives that module its own name and its own file, and records
the six decisions the move rests on. All of them were settled in a design
conversation with the maintainer before implementation; this file is the
record, not the debate.

## Goals / Non-Goals

**Goals**

- One object owns the terminal, from the DOM node up to the wire calls.
- The behaviours that were expensive to get right — the painter from
  `29acdc1`, the send ordering, the stale-route guards, the fit
  convergence — become cheap to test and hard to break silently.
- `PaneDetail` shrinks to what a component is for: route, chrome, template.

**Non-Goals**

- No behaviour change of any kind. Not a better state ladder, not a
  smarter painter, not a new wire parameter.
- No new capability. `send()` is public because the code path already
  existed and the top-bar change will need it; nothing calls it yet.
- No domain-vocabulary change. `PaneTerminal` is a class, not a concept the
  user meets, so `docs/CONTEXT.md` is untouched.

## Decisions

### 1. A plain class, not an `@Injectable` and not a component

`PaneTerminal` takes no DI. Its collaborators arrive through the
constructor: `new PaneTerminal({ ws, terminalTheme, terminalFontSize,
toast })`.

A service would be wrong: the terminal is per-view state with a DOM node
and a lifecycle, not an application singleton. A child component would be
wrong differently: it would buy an `ElementRef` at the price of a template,
a selector, change detection and a fixture in every test — the exact cost
this change is removing.

It does hold Angular signals internally. Signals are not tied to an
injection context, so this costs nothing and keeps the view's `computed`s
reactive across the boundary.

The consequence that mattered: **its tests run without TestBed and without
a fixture.** `pane-terminal.spec.ts` constructs the class with a fake
`WsClient` and a `<div>`, and asserts through the public signals and the
fake socket.

### 2. `attach(el)` owns everything DOM-and-terminal

One call claims the node and everything that hangs off it: the `Terminal`
and `FitAddon`, `term.open(el)`, the `ResizeObserver` → `fitToContainer()`
convergence loop, all four touch listeners including the sub-row carry, the
`onData` input pipe, and the `ws.events$` `pane.output` subscription.
`dispose()` releases the lot.

`PaneDetail` keeps **zero** terminal-shaped fields: no `term`, `fitAddon`,
`resizeObserver`, `subscriptionId`, `subscriptionHost`, `outputEventsSub`,
`lastSnapshot`, `sendChain` or touch anchors. What is left of its
lifecycle hooks is two lines.

### 3. The state ladder splits on what each side can know

`PaneTerminal.state()` returns `"loading" | "live" | "stale" | "failed" |
"empty"` — the five states that are facts about its own data flow — and
keeps `hasContent`, `frameReceived`, `loading`, `failure` and `subscribed`
private. `revision()`, `lastPollAt()` and `failureReason()` come out
alongside it for the meta strip.

`PaneDetail` overlays exactly one thing:

```ts
viewState = computed(() => (hostInSight() ? terminal.state() : "unavailable"));
```

Host connectivity comes from `PanesStore`, which the terminal does not and
should not see. The precedence is unchanged — a disconnected host still
outranks everything — and so are the two rules inside the ladder that are
easy to lose:

- A failure only wins while there is nothing on screen; with content
  already rendered a failed refresh reads as `stale`, never `failed`, and
  never blanks the terminal.
- `loading` deliberately stays true across the `pane.subscribe_output`
  round-trip. Clearing it when the read lands would show one frame of
  `stale` between "content arrived" and "subscription confirmed". There is
  a named unit test for this so the next reader does not tidy it away.

### 4. Input has one path, and `send()` is on it

`PaneTerminal` owns `term.onData` → `classifyInput` → the ordered queue →
`pane.send_text` / `pane.send_keys`, and exposes `send(data: string)` that
enters the same pipeline at the same point. A future terminal top bar
calls `send()`; it does not get its own classification or its own queue.

`key-mapping.ts` is untouched — a pure function with its own tests, used by
the implementation and not re-exported.

The `sendChain` ordering guarantee is preserved verbatim in behaviour: one
send-shaped request in flight at a time, a failed send logged and dropped
rather than retried so it cannot stall the queue behind it. Combined with
the bridge's per-pane FIFO this is what makes end-to-end keystroke order
hold, so it is asserted with manually-resolved promises rather than timers.

### 5. Placement and naming

`apps/web/src/app/pane-detail/pane-terminal.ts`, class `PaneTerminal`. It
lives beside the view it serves rather than in `state/`, because it is not
application state — it is the view's own object, one instance per mounted
view.

No `docs/CONTEXT.md` entry: that file is the domain glossary, and the
domain words here are still herdr's (`host`, `workspace`, `tab`, `pane`).

### 6. The interface, as shipped

```ts
export type PaneTerminalState = "loading" | "failed" | "stale" | "empty" | "live";

export interface PaneTerminalDeps {
  readonly ws: Pick<WsClient, "connected" | "events$" | "request">;
  readonly terminalTheme: Pick<TerminalThemeService, "theme">;
  readonly terminalFontSize: Pick<TerminalFontSizeService, "size">;
  readonly toast: Pick<ToastService, "push">;
}

class PaneTerminal {
  constructor(deps: PaneTerminalDeps);

  readonly revision: Signal<number | null>;
  readonly lastPollAt: Signal<number | null>;
  readonly failureReason: Signal<string>;
  readonly state: Signal<PaneTerminalState>;

  attach(el: HTMLElement): void;
  load(host: string, id: string): Promise<void>;
  retry(): void;
  send(data: string): void;
  dispose(): void;
}
```

Two details the implementation settled, both narrower than the sketch:

- **The deps are structural, not nominal.** `Pick<...>` on each service
  names the members actually used. The class is still handed the real
  services by `PaneDetail`; the narrowing is what lets a test pass a plain
  `{ theme }` object without standing up `TerminalThemeService` (which
  itself injects `ThemeService` and writes `localStorage`).
- **`retry()` re-runs the pane it is already pointed at.** It has no
  arguments because `load()` records the pane, and that record is also what
  the stale-route guards compare in-flight responses against — the same
  check the component used to make against its route signals.

## Risks / Trade-offs

**A settings reaction without `effect()`.** `PaneTerminal` must react to
the terminal theme and font-size signals, and `effect()` requires an
injection context this class deliberately does not have. It uses
`createWatch` from `@angular/core/primitives/signals` — the primitive
`effect()` is itself built on — scheduled on a microtask, with `destroy()`
called from `dispose()`.

That entry point is published and typed but aimed at framework authors, so
it is a real dependency risk on a future Angular version. The alternatives
were worse: keeping the two effects in `PaneDetail` would put terminal
knowledge back in the component and make the theme and font-size
reapplication untestable without a fixture again, and passing an `Injector`
in would reintroduce the DI the whole design removes. If the primitive ever
goes away, the fallback is a two-line `applyTheme`/`applyFontSize` pair
called from component effects.

The reaction is now scheduled rather than synchronous, which is what
Angular enforces (`Schedulers cannot synchronously execute watches while
scheduling`). A microtask is at least as prompt as the `effect()` it
replaces, and the assign-then-fit order inside the reaction — the option
first, so xterm has re-measured the cell before `fit()` divides the box by
it — is unchanged and separately asserted.

**A larger public-ish surface than a component's.** Five methods and four
signals is more than `PaneDetail` exposed. It is also the whole of it: the
painter, the queue, the fit loop, the touch engine and the subscription
lifecycle are all private, and the deletion test passes — removing
`PaneTerminal` would not simplify anything, it would move ~580 lines back
into a component.

## Migration Plan

Single commit, no flag, no staged rollout. The refactor is
behaviour-preserving and fully covered by the suite it moves; there is
nothing to migrate at runtime and nothing persisted to convert.
