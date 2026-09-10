import { provideZonelessChangeDetection, signal } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { provideRouter } from "@angular/router";
import type { BridgeCapabilities, HostSummary } from "@kanhrd/schema";
import { Settings } from "./settings";
import { PanesStore } from "../state/panes.store";
import { SettingsService } from "../state/settings.service";
import { ThemeService } from "../state/theme.service";

class FakePanesStore {
  readonly hostsSignal = signal<HostSummary[]>([
    { name: "laptop", connected: true },
    { name: "desktop", connected: false, last_error: "connection refused" },
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

  primaryHostKeybinds(): BridgeCapabilities["hostKeybinds"] | null {
    for (const caps of this.capabilitiesSignal().values()) {
      if (caps.hostKeybinds) return caps.hostKeybinds;
    }
    return null;
  }
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

  it("renders the Appearance section with a theme toggle and density segments", () => {
    const sections = Array.from(el().querySelectorAll(".settings-section h2")).map((h) => h.textContent);
    expect(sections).toContain("Appearance");
    expect(el().querySelectorAll(".segment").length).toBe(2);
  });

  it("renders the Runtime section with per-host advertised poll intervals", () => {
    expect(el().textContent).toContain("Runtime");
    expect(el().textContent).toContain("150ms");
  });

  it("renders the Servers / hosts section with connection status and last_error", () => {
    expect(el().textContent).toContain("Servers");
    expect(el().textContent).toContain("laptop");
    expect(el().textContent).toContain("desktop");
    expect(el().textContent).toContain("connection refused");
  });

  it("renders the current keyboard prefix with a default source label when no host reports hostKeybinds", () => {
    expect(el().textContent).toContain("Ctrl+B");
    expect(el().textContent).toContain("default");
  });

  it("renders the current keyboard prefix with a herdr-config source label when the primary host reports hostKeybinds", () => {
    store.capabilitiesSignal.update((map) => {
      const next = new Map(map);
      const laptop = next.get("laptop");
      if (laptop) next.set("laptop", { ...laptop, hostKeybinds: { prefix: "Ctrl+Space", source: "config-file" } });
      return next;
    });
    fixture.detectChanges();

    expect(el().textContent).toContain("Ctrl+Space");
    expect(el().textContent).toContain("from herdr config");
  });

  it("renders the Data section with a clear-data button", () => {
    expect(el().querySelector(".btn.danger")?.textContent).toContain("Clear local data");
  });

  it("clicking density segments persists the choice via SettingsService", () => {
    const compactButton = Array.from(el().querySelectorAll<HTMLButtonElement>(".segment")).find((b) =>
      b.textContent?.includes("Compact"),
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

  it("clicking clear-data opens a confirmation modal instead of clearing immediately", () => {
    const clearSpy = spyOn(TestBed.inject(SettingsService), "clearLocalData");
    el().querySelector<HTMLButtonElement>(".btn.danger")?.click();
    fixture.detectChanges();
    expect(el().querySelector("app-confirm-modal")).toBeTruthy();
    expect(clearSpy).not.toHaveBeenCalled();
  });
});
