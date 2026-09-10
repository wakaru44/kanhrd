import { provideZonelessChangeDetection } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { provideRouter } from "@angular/router";
import type { BridgeCapabilities, Pane } from "@kanhrd/schema";
import { CARD_COPY, Card } from "./card";
import { COPY } from "../shared/copy";
import { PanesStore } from "../state/panes.store";

class FakePanesStore {
  readonly closePane = jasmine.createSpy("closePane");
  readonly splitPane = jasmine.createSpy("splitPane");
  readonly renamePane = jasmine.createSpy("renamePane").and.resolveTo({});
}

function pane(overrides: Partial<Pane> = {}): Pane {
  return {
    id: "pane-12345678",
    host: "laptop",
    workspace: { id: "w1", name: "kanhrd" },
    tab: { id: "t1", name: "main" },
    agent_status: "working",
    ...overrides,
  };
}

function capabilities(overrides: Partial<BridgeCapabilities> = {}): BridgeCapabilities {
  return {
    tier: 2,
    terminal: true,
    paneResize: false,
    paneGraphics: false,
    outputPollIntervalMs: 150,
    paneCreate: false,
    paneClose: false,
    paneMove: false,
    paneRename: false,
    tabCrud: false,
    workspaceCrud: false,
    ...overrides,
  };
}

function capsWithTerminal(
  host: string,
  overrides: Partial<BridgeCapabilities> = {},
): ReadonlyMap<string, BridgeCapabilities> {
  return new Map([[host, capabilities(overrides)]]);
}

describe("Card", () => {
  let store: FakePanesStore;

  beforeEach(async () => {
    store = new FakePanesStore();
    await TestBed.configureTestingModule({
      imports: [Card],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        { provide: PanesStore, useValue: store },
      ],
    }).compileComponents();
  });

  function renderFixture(
    p: Pane,
    capabilities: ReadonlyMap<string, BridgeCapabilities> = capsWithTerminal(p.host),
    compact = false,
  ) {
    const fixture = TestBed.createComponent(Card);
    fixture.componentRef.setInput("pane", p);
    fixture.componentRef.setInput("capabilities", capabilities);
    fixture.componentRef.setInput("compact", compact);
    fixture.detectChanges();
    return fixture;
  }

  function render(
    p: Pane,
    capabilities: ReadonlyMap<string, BridgeCapabilities> = capsWithTerminal(p.host),
    compact = false,
  ) {
    return renderFixture(p, capabilities, compact).nativeElement as HTMLElement;
  }

  /** Clicks `selector` inside `fixture` and flushes a change-detection pass so signal-driven `@if`s re-render. */
  function clickAndSettle(fixture: ReturnType<typeof renderFixture>, selector: string): void {
    (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(selector)?.click();
    fixture.detectChanges();
  }

  const tier3 = { paneClose: true, paneCreate: true };

  // --- content ------------------------------------------------------------

  it("shows the agent name when present", () => {
    const el = render(pane({ agent: { name: "claude" } }));
    expect(el.querySelector(".card-open")?.textContent).toContain("claude");
  });

  it("falls back to title when agent name is absent", () => {
    const el = render(pane({ agent: undefined, title: "fix the bug" }));
    expect(el.querySelector(".card-open")?.textContent).toContain("fix the bug");
  });

  it("falls back to a short pane id when both agent and title are absent", () => {
    const el = render(pane({ agent: undefined, title: undefined, id: "abcdefgh-1234" }));
    expect(el.querySelector(".card-open")?.textContent).toContain("abcdefgh");
  });

  // --- title precedence (util/pane-title.ts, rendered) ---------------------

  it("prefers the operator's own label over agent identity and hook title", () => {
    const el = render(
      pane({ label: "fix the backlog storm", agent: { name: "claude" }, title: "hook title" }),
    );
    expect(el.querySelector(".card-open")?.textContent?.trim()).toBe("fix the backlog storm");
  });

  it("moves the displaced agent identity into the meta row rather than losing it", () => {
    const el = render(pane({ label: "fix the backlog storm", agent: { name: "claude" } }));
    expect(el.querySelector(".meta .identity")?.textContent?.trim()).toBe("claude");
  });

  it("renders no secondary identity row when the title already is the agent identity", () => {
    const el = render(pane({ agent: { name: "codex" } }));
    expect(el.querySelector(".card-open")?.textContent?.trim()).toBe("codex");
    expect(el.querySelector(".meta .identity")).toBeNull();
  });

  it("keeps the title stable when herdr renames the agent under a label", () => {
    const fixture = renderFixture(pane({ label: "fix the backlog storm", agent: { name: "claude" } }));
    fixture.componentRef.setInput(
      "pane",
      pane({ label: "fix the backlog storm", agent: { name: "claude-review" } }),
    );
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;

    expect(el.querySelector(".card-open")?.textContent?.trim()).toBe("fix the backlog storm");
    expect(el.querySelector(".meta .identity")?.textContent?.trim()).toBe("claude-review");
  });

  // --- project line --------------------------------------------------------

  const PROJECT = {
    repo_name: "kanhrd",
    checkout_path: "/home/op/workspace/src/github.com/wakaru44/kanhrd",
    is_linked_worktree: false,
  };

  it("renders the repo name and a computed path tail, with the full path as a pointer convenience", () => {
    const el = render(pane({ project: PROJECT }));

    expect(el.querySelector(".project .repo")?.textContent?.trim()).toBe("kanhrd");
    expect(el.querySelector(".project .checkout-tail")?.textContent?.trim()).toBe("…/wakaru44/kanhrd");
    expect(el.querySelector(".project")?.getAttribute("title")).toBe(PROJECT.checkout_path);
  });

  it("keeps the full path in the DOM so it is reachable without a pointer", () => {
    const el = render(pane({ project: PROJECT }));
    expect(el.querySelector(".project .checkout-full")?.textContent?.trim()).toBe(
      PROJECT.checkout_path,
    );
  });

  it("renders a shallow checkout path whole, with no ellipsis prefix", () => {
    const el = render(pane({ project: { ...PROJECT, checkout_path: "/srv" } }));
    expect(el.querySelector(".project .checkout-tail")?.textContent?.trim()).toBe("/srv");
  });

  it("renders no project line at all — no placeholder, no dash — when the pane has none", () => {
    const el = render(pane());
    expect(el.querySelector(".project")).toBeNull();
    expect(el.querySelector(".path")?.textContent?.trim()).toBe("kanhrd / main");
  });

  it("drops the project line in the compact variant, where the location lives on the detail route", () => {
    const el = render(pane({ project: PROJECT }), capsWithTerminal("laptop"), true);
    const path = el.querySelector<HTMLElement>(".path");

    expect(path).not.toBeNull();
    // The whole location row is hidden in compact, so a long checkout path
    // cannot widen the card at phone width (where compact is forced).
    expect(getComputedStyle(path!).display).toBe("none");
  });

  it("shows the workspace / tab path", () => {
    const el = render(pane());
    expect(el.querySelector(".path")?.textContent).toContain("kanhrd / main");
  });

  it("renders the title in --font-ui at --fw-medium, never the display serif", () => {
    for (const compact of [false, true]) {
      const title = render(pane(), capsWithTerminal("laptop"), compact).querySelector(".card-open");
      const style = getComputedStyle(title as Element);
      expect(style.fontWeight).toBe("500");
      expect(style.fontFamily).toContain("Inter");
      expect(style.fontFamily).not.toContain("Shippori");
    }
  });

  // --- host seal ----------------------------------------------------------

  it("renders the host as an unfilled outline seal, not a filled colour swatch", () => {
    const seal = render(pane({ host: "desktop" })).querySelector(".host-seal") as HTMLElement;
    expect(seal.textContent).toContain("desktop");
    // the old treatment was [style.background]="hostColor()" — a per-host fill
    expect(seal.getAttribute("style")).toBeNull();
    const style = getComputedStyle(seal);
    expect(style.backgroundColor).toMatch(/rgba\(0, 0, 0, 0\)|transparent/);
    expect(style.borderTopWidth).toBe("1px");
  });

  // --- status is never colour alone --------------------------------------

  it("pairs a status dot with a visible status word from copy.ts", () => {
    for (const status of ["working", "blocked", "done", "idle", "unknown"] as const) {
      const el = render(pane({ agent_status: status }));
      expect(el.querySelector(`.status-dot.${status}`)).withContext(status).toBeTruthy();
      const label = el.querySelector(`.status-label.${status}`);
      expect(label?.textContent?.trim()).toBe(COPY.status[status]);
    }
  });

  it("keeps the status word in the compact variant", () => {
    const el = render(pane({ agent_status: "blocked" }), capsWithTerminal("laptop"), true);
    expect(el.querySelector(".status-dot.blocked")).toBeTruthy();
    expect(el.querySelector(".status-label")?.textContent?.trim()).toBe(COPY.status.blocked);
    expect(getComputedStyle(el.querySelector(".status-label") as Element).display).not.toBe("none");
  });

  it("marks the compact variant on the host element", () => {
    expect(render(pane(), capsWithTerminal("laptop"), true).classList).toContain("compact");
    expect(render(pane(), capsWithTerminal("laptop"), false).classList).not.toContain("compact");
  });

  // --- navigation target --------------------------------------------------

  it("renders as a link to the pane detail route when the host bridge supports terminal", () => {
    const el = render(pane({ host: "laptop" }), capsWithTerminal("laptop"));
    const link = el.querySelector("a.card-open");
    expect(link).toBeTruthy();
    expect(link?.getAttribute("href")).toBe("/pane/laptop/pane-12345678");
  });

  it("renders as a non-clickable card when the host bridge lacks terminal support", () => {
    const el = render(pane({ host: "laptop" }), new Map());
    expect(el.querySelector("a.card-open")).toBeFalsy();
    expect(el.querySelector("div.card--static")).toBeTruthy();
    expect(el.querySelector(".card-open")?.textContent?.length).toBeGreaterThan(0);
  });

  // --- structure: no nested interactive elements ---------------------------

  it("keeps the card's link and its action controls as siblings, never nested", () => {
    const el = render(pane({ host: "laptop" }), capsWithTerminal("laptop", tier3));
    const link = el.querySelector("a.card-open") as HTMLElement;
    const buttons = Array.from(el.querySelectorAll("button"));

    expect(buttons.length).toBeGreaterThan(0);
    for (const button of buttons) {
      expect(link.contains(button)).withContext(button.className).toBe(false);
      expect(button.closest("a")).toBeNull();
    }
    expect(link.parentElement).toBe(el.querySelector(".card-actions")?.parentElement ?? null);
  });

  it("gives the link and every action an accessible name", () => {
    const el = render(pane({ agent: { name: "claude" }, host: "laptop" }), capsWithTerminal("laptop", tier3));
    expect(el.querySelector("a.card-open")?.textContent?.trim()).toBe("claude");
    for (const button of Array.from(el.querySelectorAll("button"))) {
      const name = button.getAttribute("aria-label") ?? button.textContent?.trim() ?? "";
      expect(name.length).withContext(button.className).toBeGreaterThan(0);
      expect(name).toContain("claude");
    }
  });

  // --- actions ------------------------------------------------------------

  it("shows the close action when paneClose is true, as a lucide svg icon (not '×' text)", () => {
    const el = render(pane({ host: "laptop" }), capsWithTerminal("laptop", { paneClose: true }));
    const closeButton = el.querySelector(".card-action.close");
    expect(closeButton).toBeTruthy();
    expect(closeButton?.querySelector("svg")).toBeTruthy();
    expect(closeButton?.textContent?.trim()).toBe("");
  });

  it("hides the close action when paneClose capability is false", () => {
    const el = render(pane({ host: "laptop" }), capsWithTerminal("laptop", { paneClose: false }));
    expect(el.querySelector(".card-action.close")).toBeFalsy();
  });

  it("shows both split directions when paneCreate is true, hides them otherwise", () => {
    const shown = render(pane({ host: "laptop" }), capsWithTerminal("laptop", { paneCreate: true }));
    expect(shown.querySelector(".card-action.split-right svg")).toBeTruthy();
    expect(shown.querySelector(".card-action.split-down svg")).toBeTruthy();

    const hidden = render(pane({ host: "laptop" }), capsWithTerminal("laptop", { paneCreate: false }));
    expect(hidden.querySelector(".card-action.split-right")).toBeFalsy();
  });

  it("renders no action row at all when the bridge supports neither split nor close", () => {
    const el = render(pane({ host: "laptop" }), capsWithTerminal("laptop"));
    expect(el.querySelector(".card-actions")).toBeFalsy();
  });

  it("exposes the actions on first render without any hover simulation", () => {
    const el = render(pane({ host: "laptop" }), capsWithTerminal("laptop", tier3));
    const actions = el.querySelector(".card-actions") as HTMLElement;
    const style = getComputedStyle(actions);
    expect(style.opacity).toBe("1");
    expect(style.pointerEvents).not.toBe("none");
    // the overflow trigger (the compact/touch route to the same actions) is
    // itself a visible control, present from the first render
    expect(el.querySelector(".card-action.overflow-trigger")).toBeTruthy();
  });

  it("opens the overflow menu with the capability-supported actions and closes it on Escape", () => {
    const fixture = renderFixture(pane({ host: "laptop" }), capsWithTerminal("laptop", tier3));
    const el = fixture.nativeElement as HTMLElement;
    const trigger = el.querySelector<HTMLButtonElement>(".card-action.overflow-trigger");

    expect(trigger?.getAttribute("aria-expanded")).toBe("false");
    clickAndSettle(fixture, ".card-action.overflow-trigger");

    const items = Array.from(el.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'));
    expect(items.map((i) => i.textContent?.trim())).toEqual([
      CARD_COPY.splitRight,
      CARD_COPY.splitDown,
      CARD_COPY.close,
    ]);
    expect(trigger?.getAttribute("aria-expanded")).toBe("true");

    items[0].focus();
    el.querySelector(".actions-overflow")?.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
    fixture.detectChanges();

    expect(el.querySelector('[role="menu"]')).toBeFalsy();
    expect(document.activeElement).toBe(trigger as HTMLButtonElement);
  });

  it("splits through the overflow menu", () => {
    const fixture = renderFixture(pane({ host: "laptop" }), capsWithTerminal("laptop", tier3));
    clickAndSettle(fixture, ".card-action.overflow-trigger");
    clickAndSettle(fixture, '[role="menuitem"]');

    expect(store.splitPane).toHaveBeenCalledWith("laptop", {
      target_pane_id: "pane-12345678",
      direction: "right",
    });
  });

  it("splits through the inline action", () => {
    const fixture = renderFixture(pane({ host: "laptop" }), capsWithTerminal("laptop", tier3));
    clickAndSettle(fixture, ".card-action.split-down");

    expect(store.splitPane).toHaveBeenCalledWith("laptop", {
      target_pane_id: "pane-12345678",
      direction: "down",
    });
  });

  // --- close confirmation --------------------------------------------------

  it("clicking close opens a confirmation modal instead of closing immediately", () => {
    const fixture = renderFixture(pane({ host: "laptop" }), capsWithTerminal("laptop", { paneClose: true }));
    clickAndSettle(fixture, ".card-action.close");

    const modal = (fixture.nativeElement as HTMLElement).querySelector("app-confirm-modal");
    expect(modal).toBeTruthy();
    expect(modal?.querySelector(".modal-title")?.textContent?.trim()).toBe(COPY.confirm.closePane);
    expect(modal?.querySelector(".modal-body")?.textContent?.trim()).toBe(COPY.confirm.closePaneBody);
    expect(store.closePane).not.toHaveBeenCalled();
  });

  it("confirming the close modal calls store.closePane", () => {
    const fixture = renderFixture(
      pane({ host: "laptop", id: "pane-12345678" }),
      capsWithTerminal("laptop", { paneClose: true }),
    );
    clickAndSettle(fixture, ".card-action.close");

    const confirm = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>(
        "app-confirm-modal .modal-actions .btn",
      ),
    ).find((b) => b.textContent?.trim() === COPY.confirm.closePaneAction);
    confirm?.click();
    fixture.detectChanges();

    expect(store.closePane).toHaveBeenCalledWith("laptop", "pane-12345678");
  });

  // --- meta ---------------------------------------------------------------

  it("shows an elapsed-time readout of observed client time", () => {
    const el = render(pane({ agent_status: "working" }));
    expect(el.querySelector(".meta .elapsed")?.textContent).toMatch(/^\d+[smh]$/);
  });

  it("shows a line count when last_output_snippet is present and omits it when absent", () => {
    const withSnippet = render(pane({ last_output_snippet: "line one\nline two\nline three" }));
    expect(withSnippet.querySelector(".meta")?.textContent).toContain("3 lines");

    const without = render(pane({ last_output_snippet: undefined }));
    expect(without.querySelector(".meta")?.textContent).not.toContain("lines");
  });

  // --- no hardcoded copy ---------------------------------------------------

  it("renders no user-facing string that is not copy or pane data", () => {
    const el = render(
      pane({ agent: { name: "claude" }, host: "laptop", agent_status: "blocked" }),
      capsWithTerminal("laptop", tier3),
    );
    // Everything the card renders at standard density: pane data, the two
    // mono data readouts, and the status word from copy.ts. Strip them and
    // nothing must be left over — an inlined literal would survive.
    const data = ["claude", "laptop", "kanhrd / main", COPY.status.blocked];
    let text = (el.querySelector(".card") as HTMLElement).textContent ?? "";
    for (const value of data) {
      text = text.replace(value, "");
    }
    text = text.replace(/\d+[smh]/, "").replace(/\d+ lines/, "");
    expect(text.trim()).toBe("");
  });

  // --- rename (herdr's pane.rename, exposed on the card) -------------------

  it("offers rename in the overflow menu only when the pen advertises paneRename", () => {
    const withRename = renderFixture(pane(), capsWithTerminal("laptop", { paneRename: true }));
    clickAndSettle(withRename, ".overflow-trigger");
    expect(
      (withRename.nativeElement as HTMLElement).querySelector('[role="menuitem"].rename'),
    ).not.toBeNull();

    const without = renderFixture(pane(), capsWithTerminal("laptop", tier3));
    clickAndSettle(without, ".overflow-trigger");
    expect((without.nativeElement as HTMLElement).querySelector('[role="menuitem"].rename')).toBeNull();
  });

  it("keeps the overflow trigger visible on first render, with no hover simulation", () => {
    const el = render(pane(), capsWithTerminal("laptop", { paneRename: true }));
    const trigger = el.querySelector<HTMLElement>(".overflow-trigger");

    expect(trigger).not.toBeNull();
    expect(getComputedStyle(trigger!.parentElement!).display).not.toBe("none");
  });

  it("seeds the rename modal with the current label and sends the trimmed value", async () => {
    const fixture = renderFixture(
      pane({ label: "old name" }),
      capsWithTerminal("laptop", { paneRename: true }),
    );
    clickAndSettle(fixture, ".overflow-trigger");
    clickAndSettle(fixture, '[role="menuitem"].rename');

    const el = fixture.nativeElement as HTMLElement;
    const field = el.querySelector<HTMLInputElement>("app-rename-modal .field");
    expect(field?.value).toBe("old name");

    field!.value = "  fix the backlog storm  ";
    field!.dispatchEvent(new Event("input"));
    fixture.detectChanges();
    clickAndSettle(fixture, "app-rename-modal .btn.primary");

    expect(store.renamePane).toHaveBeenCalledWith("laptop", "pane-12345678", "fix the backlog storm");
  });

  it("sends label: null when the submitted name is empty after trimming", async () => {
    const fixture = renderFixture(
      pane({ label: "old name" }),
      capsWithTerminal("laptop", { paneRename: true }),
    );
    clickAndSettle(fixture, ".overflow-trigger");
    clickAndSettle(fixture, '[role="menuitem"].rename');

    const field = (fixture.nativeElement as HTMLElement).querySelector<HTMLInputElement>(
      "app-rename-modal .field",
    );
    field!.value = "   ";
    field!.dispatchEvent(new Event("input"));
    fixture.detectChanges();
    clickAndSettle(fixture, "app-rename-modal .btn.primary");

    expect(store.renamePane).toHaveBeenCalledWith("laptop", "pane-12345678", null);
  });

  it("returns focus to the overflow trigger when the rename modal is cancelled", () => {
    const fixture = renderFixture(pane(), capsWithTerminal("laptop", { paneRename: true }));
    clickAndSettle(fixture, ".overflow-trigger");
    clickAndSettle(fixture, '[role="menuitem"].rename');

    const el = fixture.nativeElement as HTMLElement;
    el.querySelector<HTMLElement>("app-rename-modal .modal")!.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
    fixture.detectChanges();

    expect(store.renamePane).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(el.querySelector(".overflow-trigger"));
  });

  it("labels its actions from copy, with the sanctioned close verb", () => {
    expect(CARD_COPY.close).toBe(COPY.confirm.closePaneAction);
    const el = render(pane({ agent: { name: "claude" }, host: "laptop" }), capsWithTerminal("laptop", tier3));
    expect(el.querySelector(".card-action.close")?.getAttribute("aria-label")).toContain(
      COPY.confirm.closePaneAction,
    );
  });
});
