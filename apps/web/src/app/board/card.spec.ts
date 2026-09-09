import { provideZonelessChangeDetection } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { provideRouter } from "@angular/router";
import type { Pane } from "@kanhrd/schema";
import { Card } from "./card";

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

describe("Card", () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Card],
      providers: [provideZonelessChangeDetection(), provideRouter([])],
    }).compileComponents();
  });

  function render(p: Pane) {
    const fixture = TestBed.createComponent(Card);
    fixture.componentRef.setInput("pane", p);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
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
});
