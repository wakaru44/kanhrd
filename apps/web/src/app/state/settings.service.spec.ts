import { TestBed } from "@angular/core/testing";
import { provideZonelessChangeDetection } from "@angular/core";
import { SettingsService, defaultSettings, loadSettings, saveSettings } from "./settings.service";

/**
 * Section 15.2: `kanhrd.settings` survives the redesign.
 *
 * The redesign changed what density LOOKS like (`--density-scale` in
 * shared/tokens.scss, the compact card variant) but not what it is
 * stored as. So the migration contract is that there is no migration:
 * the key keeps its name, the stored `density` value keeps its meaning,
 * and nothing already written to the key is dropped on the first
 * read/write round trip of the new build.
 */

async function flushMicrotasks(): Promise<void> {
  for (let i = 0; i < 5; i++) {
    await Promise.resolve();
  }
}

/** Lets a root effect (created in an `@Injectable`, outside a component tree) flush. Mirrors theme.service.spec.ts. */
async function settle(): Promise<void> {
  await flushMicrotasks();
  await new Promise((resolve) => setTimeout(resolve, 0));
  await flushMicrotasks();
}

describe("loadSettings (pure): the stored key is read, never reset", () => {
  function stored(raw: string | null) {
    return { getItem: () => raw };
  }

  it("returns the defaults when the key is absent", () => {
    expect(loadSettings(stored(null))).toEqual(defaultSettings());
    expect(defaultSettings().density).toBe("comfortable");
  });

  it("preserves an existing compact density written by the pre-redesign build", () => {
    expect(loadSettings(stored('{"density":"compact"}')).density).toBe("compact");
  });

  it("preserves an existing comfortable density", () => {
    expect(loadSettings(stored('{"density":"comfortable"}')).density).toBe("comfortable");
  });

  it("fills in only the keys the stored payload is missing", () => {
    const loaded = loadSettings(stored('{"density":"compact"}'));
    expect(loaded.density).toBe("compact");
    expect(loaded.requestedOutputPollIntervalMs).toBe(defaultSettings().requestedOutputPollIntervalMs);
  });

  it("keeps a stored poll-interval request alongside density", () => {
    const loaded = loadSettings(stored('{"density":"compact","requestedOutputPollIntervalMs":250}'));
    expect(loaded).toEqual({ density: "compact", requestedOutputPollIntervalMs: 250 });
  });

  it("falls back to the defaults on unparseable content rather than throwing", () => {
    expect(loadSettings(stored("{not json"))).toEqual(defaultSettings());
    expect(loadSettings(stored(""))).toEqual(defaultSettings());
  });
});

describe("kanhrd.settings round trip: no data loss", () => {
  const KEY = "kanhrd.settings";

  afterEach(() => {
    localStorage.removeItem(KEY);
    document.documentElement.removeAttribute("data-density");
  });

  it("writes back everything it read, under the same key", () => {
    localStorage.setItem(KEY, '{"density":"compact","requestedOutputPollIntervalMs":250}');
    saveSettings(loadSettings());

    expect(Object.keys(localStorage).filter((k) => k.startsWith("kanhrd.settings"))).toEqual([KEY]);
    expect(JSON.parse(localStorage.getItem(KEY) ?? "{}")).toEqual({
      density: "compact",
      requestedOutputPollIntervalMs: 250,
    });
  });

  it("carries a pre-existing compact density into the running service and stamps data-density", async () => {
    localStorage.setItem(KEY, '{"density":"compact"}');
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    const service = TestBed.inject(SettingsService);

    expect(service.settings().density).toBe("compact");
    await settle();
    expect(document.documentElement.getAttribute("data-density")).toBe("compact");
    expect(JSON.parse(localStorage.getItem(KEY) ?? "{}").density).toBe("compact");
  });

  it("changing density does not drop the other stored keys", async () => {
    localStorage.setItem(KEY, '{"density":"comfortable","requestedOutputPollIntervalMs":250}');
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    const service = TestBed.inject(SettingsService);
    service.setDensity("compact");
    await settle();

    expect(JSON.parse(localStorage.getItem(KEY) ?? "{}")).toEqual({
      density: "compact",
      requestedOutputPollIntervalMs: 250,
    });
  });

  it("clearLocalData removes every kanhrd key and nothing else", () => {
    const foreign = "other-app.setting";
    localStorage.setItem(KEY, '{"density":"compact"}');
    localStorage.setItem("kanhrd.theme", "dark");
    localStorage.setItem(foreign, "keep me");

    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    TestBed.inject(SettingsService).clearLocalData();

    expect(localStorage.getItem(KEY)).toBeNull();
    expect(localStorage.getItem("kanhrd.theme")).toBeNull();
    expect(localStorage.getItem(foreign)).toBe("keep me");
    localStorage.removeItem(foreign);
  });
});
