import { provideZonelessChangeDetection, signal } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { Router } from "@angular/router";
import type { TabSummary } from "@kanhrd/schema";
import { KeyboardHelpOverlay } from "./keyboard-help-overlay";
import { KeyboardService } from "../state/keyboard.service";
import { PanesStore } from "../state/panes.store";
import { ToastService } from "../state/toast.service";
import { COPY } from "./copy";

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
  let invoker: HTMLButtonElement;

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

    invoker = document.createElement("button");
    invoker.textContent = "help";
    document.body.appendChild(invoker);
    invoker.focus();

    fixture = TestBed.createComponent(KeyboardHelpOverlay);
  });

  afterEach(() => {
    localStorage.removeItem("kanhrd.keyboard");
    invoker.remove();
  });

  function el(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function open(): void {
    fixture.componentRef.setInput("open", true);
    fixture.detectChanges();
  }

  it("renders nothing when open() is false", () => {
    fixture.componentRef.setInput("open", false);
    fixture.detectChanges();
    expect(el().querySelector(".modal")).toBeNull();
  });

  it("titles itself from copy.ts", () => {
    open();
    expect(el().querySelector(".modal-title")?.textContent).toContain(COPY.nav.help);
  });

  it("closes with an icon button, never a literal glyph", () => {
    open();
    const close = el().querySelector(".close-btn");
    expect(close?.querySelector("svg")).toBeTruthy();
    expect(close?.textContent?.includes("×")).toBeFalse();
  });

  it("renders every category section with at least one shortcut when open", () => {
    open();
    const headings = Array.from(el().querySelectorAll(".shortcut-group h3")).map((h) => h.textContent);
    expect(headings).toEqual(["Navigation", "Lifecycle", "View", "Help"]);
    const keyboardService = TestBed.inject(KeyboardService);
    expect(el().querySelectorAll(".shortcut-row").length).toBe(keyboardService.shortcuts().size);
  });

  it("shows the chord bindings prefixed with the current prefix", () => {
    open();
    expect(el().textContent).toContain("Ctrl+B + c");
  });

  it("advertises help as the chord only — never a bare ?", () => {
    open();
    const label = Array.from(el().querySelectorAll(".shortcut-row"))
      .map((row) => row.textContent ?? "")
      .find((text) => text.includes("help overlay"));
    expect(label).toContain("Ctrl+B + ?");
    expect(label).not.toContain("? or");
  });

  it("clicking the backdrop emits closed", () => {
    open();
    let closed = false;
    fixture.componentInstance.closed.subscribe(() => (closed = true));
    el().querySelector<HTMLElement>(".modal-backdrop")?.click();
    expect(closed).toBe(true);
  });

  it("clicking inside the modal does not emit closed", () => {
    open();
    let closed = false;
    fixture.componentInstance.closed.subscribe(() => (closed = true));
    el().querySelector<HTMLElement>(".modal")?.click();
    expect(closed).toBe(false);
  });

  it("emits closed on Escape inside the dialog, and ignores a global Escape", () => {
    open();
    const closed = jasmine.createSpy("closed");
    fixture.componentInstance.closed.subscribe(closed);

    el().querySelector<HTMLElement>(".modal")?.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
    expect(closed).toHaveBeenCalledTimes(1);

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(closed).toHaveBeenCalledTimes(1);
  });

  describe("focus containment", () => {
    it("moves focus into the dialog and inerts the background", () => {
      open();
      expect(el().querySelector(".modal")?.contains(document.activeElement)).toBeTrue();
      expect(invoker.hasAttribute("inert")).toBeTrue();
    });

    it("restores focus to the invoking control and clears inert on close", () => {
      open();
      fixture.componentRef.setInput("open", false);
      fixture.detectChanges();

      expect(invoker.hasAttribute("inert")).toBeFalse();
      expect(document.activeElement).toBe(invoker);
    });

    it("wraps Tab inside the dialog", () => {
      open();
      const stops = Array.from(
        el().querySelectorAll<HTMLElement>('button, a[href], [tabindex]:not([tabindex="-1"])'),
      );
      const last = stops[stops.length - 1];
      last.focus();

      last.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true }));

      expect(document.activeElement).toBe(stops[0]);
    });
  });
});
