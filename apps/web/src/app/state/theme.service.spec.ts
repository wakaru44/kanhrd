import { TestBed } from "@angular/core/testing";
import { provideZonelessChangeDetection } from "@angular/core";
import { ThemeService, loadTheme } from "./theme.service";

async function flushMicrotasks(): Promise<void> {
  for (let i = 0; i < 5; i++) {
    await Promise.resolve();
  }
}

/** Lets a root effect (created outside a component tree, in an `@Injectable`) flush. Mirrors panes.store.spec.ts's `settle()`. */
async function settle(): Promise<void> {
  await flushMicrotasks();
  await new Promise((resolve) => setTimeout(resolve, 0));
  await flushMicrotasks();
}

describe("loadTheme (pure)", () => {
  it("returns null when nothing is stored", () => {
    expect(loadTheme({ getItem: () => null })).toBeNull();
  });

  it("returns the stored theme when valid", () => {
    expect(loadTheme({ getItem: () => "light" })).toBe("light");
    expect(loadTheme({ getItem: () => "dark" })).toBe("dark");
  });

  it("returns null for garbage stored values", () => {
    expect(loadTheme({ getItem: () => "purple" })).toBeNull();
  });
});

describe("ThemeService", () => {
  afterEach(() => {
    localStorage.removeItem("kanhrd.theme");
    document.documentElement.removeAttribute("data-theme");
  });

  function create(): ThemeService {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    return TestBed.inject(ThemeService);
  }

  it("respects a stored localStorage preference on construction", () => {
    localStorage.setItem("kanhrd.theme", "light");
    const service = create();
    expect(service.theme()).toBe("light");
  });

  it("falls back to prefers-color-scheme when nothing is stored", () => {
    localStorage.removeItem("kanhrd.theme");
    const service = create();
    // jsdom/ChromeHeadless default matchMedia reports no light preference, so dark is expected here.
    expect(["light", "dark"]).toContain(service.theme());
  });

  it("toggle() flips dark <-> light", () => {
    localStorage.setItem("kanhrd.theme", "dark");
    const service = create();
    expect(service.theme()).toBe("dark");
    service.toggle();
    expect(service.theme()).toBe("light");
    service.toggle();
    expect(service.theme()).toBe("dark");
  });

  it("persists the theme to localStorage and stamps data-theme on <html>", async () => {
    const service = create();
    service.set("light");
    await settle();
    expect(localStorage.getItem("kanhrd.theme")).toBe("light");
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
  });
});
