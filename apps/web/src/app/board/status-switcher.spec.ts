import { provideZonelessChangeDetection } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import type { AgentStatus } from "@kanhrd/schema";
import { StatusSwitcher } from "./status-switcher";

/**
 * The switcher owns no selection state: `selectedIndex` in, `select` out.
 * These tests pin the half of the "one state, two views" contract that lives
 * here — roles, `aria-selected`, the count on the selected segment only, and
 * arrow-key navigation. The other half (the strip's scroll position) is
 * pinned by `pageIndex` in `board.spec.ts` and measured for real at 390px.
 */
describe("StatusSwitcher", () => {
  let fixture: ComponentFixture<StatusSwitcher>;

  function render(statuses: AgentStatus[], counts: number[], selectedIndex: number): void {
    fixture.componentRef.setInput("statuses", statuses);
    fixture.componentRef.setInput("counts", counts);
    fixture.componentRef.setInput("selectedIndex", selectedIndex);
    fixture.detectChanges();
  }

  function tabs(): HTMLButtonElement[] {
    return Array.from((fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('[role="tab"]'));
  }

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [StatusSwitcher],
      providers: [provideZonelessChangeDetection()],
    });
    fixture = TestBed.createComponent(StatusSwitcher);
  });

  it("renders one tab per visible status inside a tablist, in the order given", () => {
    render(["working", "blocked", "done"], [3, 1, 0], 0);

    const list = (fixture.nativeElement as HTMLElement).querySelector('[role="tablist"]');
    expect(list).not.toBeNull();
    expect(tabs().map((t) => t.querySelector(".segment-label")?.textContent?.trim())).toEqual([
      "working",
      "blocked",
      "done",
    ]);
  });

  it("marks exactly one segment aria-selected and points it at its column panel", () => {
    render(["working", "blocked", "done"], [3, 1, 0], 1);

    expect(tabs().map((t) => t.getAttribute("aria-selected"))).toEqual(["false", "true", "false"]);
    expect(tabs()[1].getAttribute("aria-controls")).toBe("column-panel-blocked");
    expect(tabs()[1].id).toBe("switcher-tab-blocked");
  });

  it("shows the card count on the selected segment only", () => {
    render(["working", "blocked", "done"], [3, 1, 0], 1);

    const counts = tabs().map((t) => t.querySelector(".segment-count")?.textContent?.trim() ?? null);
    expect(counts).toEqual([null, "1", null]);
  });

  it("still shows a count of 0 on a selected empty column", () => {
    render(["working", "blocked", "done"], [3, 1, 0], 2);

    expect(tabs()[2].querySelector(".segment-count")?.textContent?.trim()).toBe("0");
  });

  it("names every segment '{status} — {count} cards' for assistive tech", () => {
    render(["working", "blocked"], [3, 1], 0);

    expect(tabs()[0].getAttribute("aria-label")).toBe("working — 3 cards");
    expect(tabs()[1].getAttribute("aria-label")).toBe("blocked — 1 cards");
  });

  it("keeps only the selected segment in the tab sequence (roving tabindex)", () => {
    render(["working", "blocked", "done"], [3, 1, 0], 2);

    expect(tabs().map((t) => t.getAttribute("tabindex"))).toEqual(["-1", "-1", "0"]);
  });

  it("emits the tapped segment's index", () => {
    render(["working", "blocked", "done"], [3, 1, 0], 0);
    const emitted: number[] = [];
    fixture.componentInstance.select.subscribe((index) => emitted.push(index));

    tabs()[2].click();

    expect(emitted).toEqual([2]);
  });

  it("moves between segments with left/right arrows, wrapping at the ends", () => {
    render(["working", "blocked", "done"], [3, 1, 0], 0);
    const emitted: number[] = [];
    fixture.componentInstance.select.subscribe((index) => emitted.push(index));

    const list = (fixture.nativeElement as HTMLElement).querySelector('[role="tablist"]')!;
    list.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    expect(emitted).toEqual([1]);

    list.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }));
    expect(emitted).toEqual([1, 2]); // selectedIndex is controlled and still 0: ArrowLeft wraps to the last

    render(["working", "blocked", "done"], [3, 1, 0], 2);
    list.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    expect(emitted[emitted.length - 1]).toBe(0);
  });

  it("ignores keys that are not left/right", () => {
    render(["working", "blocked"], [1, 1], 0);
    const emitted: number[] = [];
    fixture.componentInstance.select.subscribe((index) => emitted.push(index));

    const list = (fixture.nativeElement as HTMLElement).querySelector('[role="tablist"]')!;
    list.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));

    expect(emitted).toEqual([]);
  });
});
