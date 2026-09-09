import { provideZonelessChangeDetection, signal } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { Router } from "@angular/router";
import type { TabSummary } from "@kanhrd/schema";
import { KeyboardHelpOverlay } from "./keyboard-help-overlay";
import { KeyboardService } from "../state/keyboard.service";
import { PanesStore } from "../state/panes.store";
import { ToastService } from "../state/toast.service";

/** Overlay only reads `KeyboardService.shortcuts()`/`prefix()`, so `KeyboardService`'s own `PanesStore` dependency can be a minimal stub. */
class FakePanesStore {
  readonly tabsSignal = signal<ReadonlyMap<string, TabSummary>>(new Map());
  readonly tabFilterSignal = signal(null);
  readonly scopeSignal = signal(null);
  findHostForCapability = jasmine.createSpy("findHostForCapability").and.returnValue(null);
  splitPane = jasmine.createSpy("splitPane").and.resolveTo(undefined);
  setScope = jasmine.createSpy("setScope");
  requestPendingRename = jasmine.createSpy("requestPendingRename");
  requestCloseTabById = jasmine.createSpy("requestCloseTabById");
}

describe("KeyboardHelpOverlay", () => {
  let fixture: ComponentFixture<KeyboardHelpOverlay>;

  beforeEach(async () => {
    localStorage.removeItem("kanhrd.keyboard");
    await TestBed.configureTestingModule({
      imports: [KeyboardHelpOverlay],
      providers: [
        provideZonelessChangeDetection(),
        ToastService,
        { provide: PanesStore, useValue: new FakePanesStore() },
        { provide: Router, useValue: { navigate: jasmine.createSpy("navigate") } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(KeyboardHelpOverlay);
  });

  afterEach(() => {
    localStorage.removeItem("kanhrd.keyboard");
  });

  function el(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  it("renders nothing when open() is false", () => {
    fixture.componentRef.setInput("open", false);
    fixture.detectChanges();
    expect(el().querySelector(".modal")).toBeNull();
  });

  it("renders every category section with at least one shortcut when open", () => {
    fixture.componentRef.setInput("open", true);
    fixture.detectChanges();

    const headings = Array.from(el().querySelectorAll(".shortcut-group h3")).map((h) => h.textContent);
    expect(headings).toEqual(["Navigation", "Lifecycle", "View", "Help"]);
    const keyboardService = TestBed.inject(KeyboardService);
    expect(el().querySelectorAll(".shortcut-row").length).toBe(keyboardService.shortcuts().size);
  });

  it("shows the chord bindings prefixed with the current prefix", () => {
    fixture.componentRef.setInput("open", true);
    fixture.detectChanges();
    expect(el().textContent).toContain("Ctrl+B + c");
  });

  it("clicking the backdrop emits closed", () => {
    fixture.componentRef.setInput("open", true);
    fixture.detectChanges();
    let closed = false;
    fixture.componentInstance.closed.subscribe(() => (closed = true));
    el().querySelector<HTMLElement>(".modal-backdrop")?.click();
    expect(closed).toBe(true);
  });

  it("clicking inside the modal does not emit closed", () => {
    fixture.componentRef.setInput("open", true);
    fixture.detectChanges();
    let closed = false;
    fixture.componentInstance.closed.subscribe(() => (closed = true));
    el().querySelector<HTMLElement>(".modal")?.click();
    expect(closed).toBe(false);
  });
});
