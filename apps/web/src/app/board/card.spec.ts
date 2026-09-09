import { provideZonelessChangeDetection } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { provideRouter } from "@angular/router";
import type { BridgeCapabilities, Pane } from "@kanhrd/schema";
import { Card } from "./card";
import { PanesStore } from "../state/panes.store";

class FakePanesStore {
  readonly closePane = jasmine.createSpy("closePane");
  readonly splitPane = jasmine.createSpy("splitPane");
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
  ) {
    const fixture = TestBed.createComponent(Card);
    fixture.componentRef.setInput("pane", p);
    fixture.componentRef.setInput("capabilities", capabilities);
    fixture.detectChanges();
    return fixture;
  }

  function render(p: Pane, capabilities: ReadonlyMap<string, BridgeCapabilities> = capsWithTerminal(p.host)) {
    return renderFixture(p, capabilities).nativeElement as HTMLElement;
  }

  /** Clicks `selector` inside `fixture` and flushes a change-detection pass so signal-driven `@if`s re-render. */
  function clickAndSettle(fixture: ReturnType<typeof renderFixture>, selector: string): void {
    (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(selector)?.click();
    fixture.detectChanges();
  }

  it("shows the agent name when present", () => {
    const el = render(pane({ agent: { name: "claude" } }));
    expect(el.querySelector(".agent-name")?.textContent).toContain("claude");
  });

  it("falls back to title when agent name is absent", () => {
    const el = render(pane({ agent: undefined, title: "fix the bug" }));
    expect(el.querySelector(".agent-name")?.textContent).toContain("fix the bug");
  });

  it("falls back to a short pane id when both agent and title are absent", () => {
    const el = render(pane({ agent: undefined, title: undefined, id: "abcdefgh-1234" }));
    expect(el.querySelector(".agent-name")?.textContent).toContain("abcdefgh");
  });

  it("shows the workspace / tab path", () => {
    const el = render(pane());
    expect(el.querySelector(".path")?.textContent).toContain("kanhrd / main");
  });

  it("shows the host chip and status dot", () => {
    const el = render(pane({ host: "desktop", agent_status: "blocked" }));
    expect(el.querySelector(".host-chip")?.textContent).toContain("desktop");
    expect(el.querySelector(".status-dot.blocked")).toBeTruthy();
  });

  it("renders as a link to the pane detail route when the host bridge supports terminal", () => {
    const el = render(pane({ host: "laptop" }), capsWithTerminal("laptop"));
    const link = el.querySelector("a.card");
    expect(link).toBeTruthy();
    expect(link?.getAttribute("href")).toBe("/pane/laptop/pane-12345678");
  });

  it("renders as a non-clickable card when the host bridge lacks terminal support", () => {
    const el = render(pane({ host: "laptop" }), new Map());
    expect(el.querySelector("a.card")).toBeFalsy();
    expect(el.querySelector("div.card--static")).toBeTruthy();
    // content still renders even without the click affordance
    expect(el.querySelector(".agent-name")?.textContent?.length).toBeGreaterThan(0);
  });

  it("shows the close button when paneClose capability is true", () => {
    const el = render(pane({ host: "laptop" }), capsWithTerminal("laptop", { paneClose: true }));
    expect(el.querySelector(".card-action.close")).toBeTruthy();
  });

  it("hides the close button when paneClose capability is false", () => {
    const el = render(pane({ host: "laptop" }), capsWithTerminal("laptop", { paneClose: false }));
    expect(el.querySelector(".card-action.close")).toBeFalsy();
  });

  it("shows the split button when paneCreate capability is true, hides it otherwise", () => {
    const shown = render(pane({ host: "laptop" }), capsWithTerminal("laptop", { paneCreate: true }));
    expect(shown.querySelector(".card-action.split")).toBeTruthy();

    const hidden = render(pane({ host: "laptop" }), capsWithTerminal("laptop", { paneCreate: false }));
    expect(hidden.querySelector(".card-action.split")).toBeFalsy();
  });

  it("clicking close opens a confirmation modal instead of closing immediately", () => {
    const fixture = renderFixture(pane({ host: "laptop" }), capsWithTerminal("laptop", { paneClose: true }));
    clickAndSettle(fixture, ".card-action.close");

    expect((fixture.nativeElement as HTMLElement).querySelector("app-confirm-modal")).toBeTruthy();
    expect(store.closePane).not.toHaveBeenCalled();
  });

  it("confirming the close modal calls store.closePane", () => {
    const fixture = renderFixture(
      pane({ host: "laptop", id: "pane-12345678" }),
      capsWithTerminal("laptop", { paneClose: true }),
    );
    clickAndSettle(fixture, ".card-action.close");
    clickAndSettle(fixture, "app-confirm-modal .modal-actions .btn.danger");

    expect(store.closePane).toHaveBeenCalledWith("laptop", "pane-12345678");
  });

  it("stats badge shows the agent status and an elapsed-time segment", () => {
    const el = render(pane({ agent_status: "working" }));
    const badge = el.querySelector(".stats-badge");
    expect(badge).toBeTruthy();
    expect(badge?.textContent).toContain("working");
    expect(badge?.textContent).toMatch(/\d+[smh]/);
  });

  it("stats badge shows a line count when last_output_snippet is present", () => {
    const el = render(pane({ last_output_snippet: "line one\nline two\nline three" }));
    expect(el.querySelector(".stats-badge")?.textContent).toContain("3 lines");
  });

  it("stats badge hides the line-count segment when last_output_snippet is absent", () => {
    const el = render(pane({ last_output_snippet: undefined }));
    expect(el.querySelector(".stats-badge")?.textContent).not.toContain("lines");
  });

  it("clicking the close/split buttons does not navigate the card link", () => {
    const el = render(pane({ host: "laptop" }), capsWithTerminal("laptop", { paneClose: true, paneCreate: true }));
    const closeEvent = new MouseEvent("click", { bubbles: true, cancelable: true });
    spyOn(closeEvent, "preventDefault").and.callThrough();

    el.querySelector<HTMLButtonElement>(".card-action.close")?.dispatchEvent(closeEvent);

    expect(closeEvent.defaultPrevented).toBe(true);
  });
});
