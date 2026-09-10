import { provideZonelessChangeDetection, signal } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { provideRouter } from "@angular/router";
import type { BridgeCapabilities, HostSummary } from "@kanhrd/schema";
import { Settings } from "./settings";
import { PanesStore } from "../state/panes.store";
import { SettingsService } from "../state/settings.service";
import { ThemeService } from "../state/theme.service";
import { COPY } from "../shared/copy";

const LONG_ERROR =
  "dial unix /run/user/1000/herdr.sock: connect: connection refused after 5 attempts over 30s — check that herdr is running on this pen and that the socket path in kanhrd.config.yaml matches";

class FakePanesStore {
  readonly hostsSignal = signal<HostSummary[]>([
    { name: "laptop", connected: true },
    { name: "desktop", connected: false, last_error: LONG_ERROR },
  ]);
  readonly capabilitiesSignal = signal<ReadonlyMap<string, BridgeCapabilities>>(
    new Map([
      [
        "laptop",
        {
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
        },
      ],
    ]),
  );
}

describe("Settings", () => {
  let store: FakePanesStore;
  let fixture: ComponentFixture<Settings>;
  let settingsService: SettingsService;
  let themeService: ThemeService;

  beforeEach(async () => {
    localStorage.removeItem("kanhrd.settings");
    localStorage.removeItem("kanhrd.theme");
    store = new FakePanesStore();
    await TestBed.configureTestingModule({
      imports: [Settings],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        { provide: PanesStore, useValue: store },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(Settings);
    settingsService = TestBed.inject(SettingsService);
    themeService = TestBed.inject(ThemeService);
    fixture.detectChanges();
  });

  afterEach(() => {
    localStorage.removeItem("kanhrd.settings");
    localStorage.removeItem("kanhrd.theme");
  });

  function el(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  it("titles the screen and its back control from copy.ts", () => {
    expect(el().querySelector("h1")?.textContent).toContain(COPY.nav.settings);
    expect(el().querySelector(".back")?.textContent).toContain(COPY.nav.backToBoard);
  });

  it("puts the back control first in tab order with an icon, not an entity glyph", () => {
    const focusable = el().querySelector('a[href], button, input, select, [tabindex]:not([tabindex="-1"])');
    expect(focusable?.classList.contains("back")).toBeTrue();
    expect(focusable?.querySelector("svg")).toBeTruthy();
    expect(el().querySelector(".back")?.textContent?.includes("←")).toBeFalse();
  });

  it("renders the appearance section with a theme toggle and density segments", () => {
    const sections = Array.from(el().querySelectorAll(".settings-section h2")).map((h) => h.textContent);
    expect(sections).toContain("appearance");
    expect(el().querySelectorAll(".segment").length).toBe(2);
  });

  it("renders the runtime section with per-pen advertised poll intervals", () => {
    expect(el().textContent).toContain("runtime");
    expect(el().textContent).toContain("150ms");
    expect(el().textContent).toContain("n/a");
  });

  it("renders the pens section with connection status and a wrapping last_error", () => {
    expect(el().textContent).toContain("pens");
    expect(el().textContent).toContain("laptop");
    expect(el().textContent).toContain("desktop");

    const error = el().querySelector<HTMLElement>(".host-error");
    expect(error?.textContent).toContain("connection refused");
    expect(getComputedStyle(error!).whiteSpace).not.toBe("nowrap");
  });

  it("says pens, never hosts or servers", () => {
    const headings = Array.from(el().querySelectorAll(".settings-section h2")).map((h) => h.textContent);
    expect(headings).not.toContain("Servers / hosts");
  });

  it("renders the data section with a clear-data button", () => {
    expect(el().querySelector(".btn.danger")?.textContent).toContain("clear local data");
  });

  it("clicking density segments persists the choice via SettingsService", () => {
    const compactButton = Array.from(el().querySelectorAll<HTMLButtonElement>(".segment")).find((b) =>
      b.textContent?.includes("compact"),
    );
    compactButton?.click();
    fixture.detectChanges();
    expect(settingsService.settings().density).toBe("compact");
  });

  it("clicking the theme button toggles ThemeService", () => {
    const before = themeService.theme();
    const themeButton = el().querySelector<HTMLButtonElement>(".setting-row .btn");
    themeButton?.click();
    fixture.detectChanges();
    expect(themeService.theme()).not.toBe(before);
  });

  it("clicking clear-data opens a confirmation with a preview list instead of clearing", () => {
    const clearSpy = spyOn(TestBed.inject(SettingsService), "clearLocalData");
    el().querySelector<HTMLButtonElement>(".btn.danger")?.click();
    fixture.detectChanges();

    const modal = el().querySelector("app-confirm-modal");
    expect(modal).toBeTruthy();
    expect(modal?.querySelector(".preview-heading")?.textContent).toContain(COPY.confirm.previewHeading);
    expect(modal?.querySelectorAll(".preview-row").length).toBe(4);
    expect(modal?.querySelector(".modal-body")?.textContent).toContain("cannot be undone");
    expect(clearSpy).not.toHaveBeenCalled();
  });
});
