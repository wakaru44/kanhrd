import { TestBed } from "@angular/core/testing";
import { provideZonelessChangeDetection } from "@angular/core";
import { ThemeService } from "./theme.service";
import {
  TerminalThemeService,
  XTERM_THEME_DARK,
  XTERM_THEME_LIGHT,
  XTERM_THEME_MONOKAI,
  loadTerminalThemeName,
} from "./terminal-theme.service";

async function flushMicrotasks(): Promise<void> {
  for (let i = 0; i < 5; i++) {
    await Promise.resolve();
  }
}

/** Lets a root effect (created in an `@Injectable` constructor) flush. Mirrors theme.service.spec.ts's `settle()`. */
async function settle(): Promise<void> {
  await flushMicrotasks();
  await new Promise((resolve) => setTimeout(resolve, 0));
  await flushMicrotasks();
}

describe("loadTerminalThemeName", () => {
  it("defaults to auto when nothing stored", () => {
    const storage = { getItem: () => null };
    expect(loadTerminalThemeName(storage)).toBe("auto");
  });

  it("returns a stored valid theme name", () => {
    const storage = { getItem: () => "monokai" };
    expect(loadTerminalThemeName(storage)).toBe("monokai");
  });

  it("falls back to auto for garbage storage content", () => {
    const storage = { getItem: () => "not-a-real-theme" };
    expect(loadTerminalThemeName(storage)).toBe("auto");
  });
});

describe("TerminalThemeService", () => {
  let service: TerminalThemeService;
  let themeService: ThemeService;

  beforeEach(() => {
    localStorage.removeItem("kanhrd.terminal-theme");
    localStorage.removeItem("kanhrd.theme");
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    themeService = TestBed.inject(ThemeService);
    service = TestBed.inject(TerminalThemeService);
  });

  afterEach(() => {
    localStorage.removeItem("kanhrd.terminal-theme");
    localStorage.removeItem("kanhrd.theme");
    document.documentElement.removeAttribute("data-theme");
  });

  it("defaults to 'auto' and follows the SPA theme", () => {
    expect(service.name()).toBe("auto");

    themeService.set("dark");
    expect(service.theme()).toEqual(XTERM_THEME_DARK);

    themeService.set("light");
    expect(service.theme()).toEqual(XTERM_THEME_LIGHT);
  });

  it("an explicit theme overrides the SPA theme regardless of dark/light", () => {
    themeService.set("dark");
    service.set("monokai");
    expect(service.theme()).toEqual(XTERM_THEME_MONOKAI);

    themeService.set("light");
    expect(service.theme()).toEqual(XTERM_THEME_MONOKAI);
  });

  it("persists the chosen name to localStorage", async () => {
    service.set("solarized-dark");
    await settle();
    expect(loadTerminalThemeName()).toBe("solarized-dark");
  });

  it("emits a new theme value to computed subscribers when the name changes", () => {
    const seen: string[] = [];
    // computed() signals re-derive lazily; read after each change to observe the new value.
    service.set("catppuccin-mocha");
    seen.push(JSON.stringify(service.theme()));
    service.set("solarized-light");
    seen.push(JSON.stringify(service.theme()));
    expect(seen[0]).not.toEqual(seen[1]);
  });
});
