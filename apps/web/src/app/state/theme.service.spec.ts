import { TestBed } from "@angular/core/testing";
import { provideZonelessChangeDetection } from "@angular/core";
import { ThemeService, loadTheme, resolveTheme, systemPrefersDark } from "./theme.service";

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

describe("resolveTheme (pure)", () => {
  const nothingStored = { getItem: () => null };

  it("uses washi (light) when nothing is stored and the OS does not prefer dark", () => {
    expect(resolveTheme(nothingStored, false)).toBe("light");
  });

  it("uses sumi (dark) when nothing is stored and the OS prefers dark", () => {
    expect(resolveTheme(nothingStored, true)).toBe("dark");
  });

  it("lets a valid stored preference win over the OS preference", () => {
    expect(resolveTheme({ getItem: () => "light" }, true)).toBe("light");
    expect(resolveTheme({ getItem: () => "dark" }, false)).toBe("dark");
  });

  it("ignores a garbage stored value and falls back to the OS preference", () => {
    expect(resolveTheme({ getItem: () => "purple" }, true)).toBe("dark");
    expect(resolveTheme({ getItem: () => "purple" }, false)).toBe("light");
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
    // The browser's own preference decides; ChromeHeadless reports light unless asked otherwise.
    expect(service.theme()).toBe(systemPrefersDark() ? "dark" : "light");
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
