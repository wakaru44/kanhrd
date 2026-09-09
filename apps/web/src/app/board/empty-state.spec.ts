import { ComponentFixture, TestBed } from "@angular/core/testing";
import { provideZonelessChangeDetection } from "@angular/core";
import type { HostSummary } from "@kanhrd/schema";
import { EmptyState } from "./empty-state";

function host(name: string, connected: boolean): HostSummary {
  return { name, connected, last_error: connected ? undefined : "connection refused" };
}

describe("EmptyState", () => {
  let fixture: ComponentFixture<EmptyState>;

  beforeEach(() => {
    jasmine.clock().install();
    jasmine.clock().mockDate(new Date());
    TestBed.configureTestingModule({
      imports: [EmptyState],
      providers: [provideZonelessChangeDetection()],
    });
    fixture = TestBed.createComponent(EmptyState);
  });

  afterEach(() => {
    jasmine.clock().uninstall();
  });

  function el(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  it("renders immediately when there are no configured hosts", () => {
    fixture.componentRef.setInput("hosts", []);
    fixture.detectChanges();
    expect(fixture.componentInstance.show()).toBe(true);
    expect(el().querySelector(".empty-state")).not.toBeNull();
    expect(el().textContent).toContain("Connect a herdr host");
  });

  it("does not render right away when a host is merely disconnected", () => {
    fixture.componentRef.setInput("hosts", [host("local", false)]);
    fixture.detectChanges();
    expect(fixture.componentInstance.show()).toBe(false);
    expect(el().querySelector(".empty-state")).toBeNull();
  });

  it("renders after every host has been disconnected for more than 5s", () => {
    fixture.componentRef.setInput("hosts", [host("local", false)]);
    fixture.detectChanges();
    expect(fixture.componentInstance.show()).toBe(false);

    // ClockTick only updates its `now` signal once per second (1000ms
    // interval), so tick comfortably past the 5s grace period rather than
    // right at the boundary.
    jasmine.clock().tick(6001);
    fixture.detectChanges();

    expect(fixture.componentInstance.show()).toBe(true);
    expect(el().textContent).toContain("Waiting for herdr to come online");
  });

  it("does not render when at least one host is connected", () => {
    fixture.componentRef.setInput("hosts", [host("local", false), host("remote", true)]);
    fixture.detectChanges();
    jasmine.clock().tick(10_000);
    fixture.detectChanges();
    expect(fixture.componentInstance.show()).toBe(false);
  });

  it("resets the disconnected timer once a host reconnects", () => {
    fixture.componentRef.setInput("hosts", [host("local", false)]);
    fixture.detectChanges();
    jasmine.clock().tick(3000);

    fixture.componentRef.setInput("hosts", [host("local", true)]);
    fixture.detectChanges();
    jasmine.clock().tick(3000);

    fixture.componentRef.setInput("hosts", [host("local", false)]);
    fixture.detectChanges();
    jasmine.clock().tick(3000);
    fixture.detectChanges();

    // Only 3s since the most recent disconnect (the earlier 3s+3s don't
    // carry over), so still below the 5s grace period.
    expect(fixture.componentInstance.show()).toBe(false);
  });
});
