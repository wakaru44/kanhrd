import { TestBed } from "@angular/core/testing";
import { provideZonelessChangeDetection, signal } from "@angular/core";
import { Router } from "@angular/router";
import type { TabSummary } from "@kanhrd/schema";
import {
  DEFAULT_PREFIX,
  KeyboardService,
  formatBinding,
  isTextInputFocused,
  loadPrefix,
  matchesPrefix,
  parsePrefix,
  savePrefix,
} from "./keyboard.service";
import { PanesStore, paneKey } from "./panes.store";
import { LayoutService } from "./layout.service";
import { ThemeService } from "./theme.service";
import { ToastService } from "./toast.service";

function keyEvent(key: string, mods: Partial<{ ctrlKey: boolean; metaKey: boolean; shiftKey: boolean }> = {}): KeyboardEvent {
  return new KeyboardEvent("keydown", { key, cancelable: true, ...mods });
}

function tab(host: string, id: string): TabSummary {
  return { id, host, workspace: { id: "w1" }, name: id };
}

/** Minimal fake covering every `PanesStore` member `KeyboardService` touches. */
class FakePanesStore {
  readonly tabsSignal = signal<ReadonlyMap<string, TabSummary>>(new Map());
  readonly tabFilterSignal = signal<{ host: string; tabId: string } | null>(null);
  readonly scopeSignal = signal<{ host: string; workspaceId: string; tabId: string | null } | null>(null);

  findHostForCapability = jasmine.createSpy("findHostForCapability").and.returnValue(null);
  splitPane = jasmine.createSpy("splitPane").and.resolveTo(undefined);
  setScope = jasmine
    .createSpy("setScope")
    .and.callFake((host: string, _workspaceId: string, tabId: string | null) => {
      this.tabFilterSignal.set(tabId ? { host, tabId } : null);
    });
  requestPendingRename = jasmine.createSpy("requestPendingRename");
  requestCloseTabById = jasmine.createSpy("requestCloseTabById");

  setTabs(tabs: TabSummary[]): void {
    this.tabsSignal.set(new Map(tabs.map((t) => [paneKey(t.host, t.id), t])));
  }
}

async function flushMicrotasks(): Promise<void> {
  for (let i = 0; i < 5; i++) {
    await Promise.resolve();
  }
}

/** Lets a root effect (created in an `@Injectable` constructor, e.g. `KeyboardService`'s prefix-persist effect) flush. Mirrors theme.service.spec.ts's `settle()`. */
async function settle(): Promise<void> {
  await flushMicrotasks();
  await new Promise((resolve) => setTimeout(resolve, 0));
  await flushMicrotasks();
}

describe("keyboard.service pure helpers", () => {
  afterEach(() => {
    localStorage.removeItem("kanhrd.keyboard");
  });

  it("loadPrefix defaults to Ctrl+B when nothing is stored", () => {
    expect(loadPrefix({ getItem: () => null })).toBe(DEFAULT_PREFIX);
  });

  it("loadPrefix reads a stored prefix", () => {
    expect(loadPrefix({ getItem: () => JSON.stringify({ prefix: "Ctrl+A" }) })).toBe("Ctrl+A");
  });

  it("loadPrefix falls back to default on garbage", () => {
    expect(loadPrefix({ getItem: () => "not json" })).toBe(DEFAULT_PREFIX);
  });

  it("savePrefix writes the expected JSON shape", () => {
    const calls: string[] = [];
    savePrefix("Ctrl+A", { setItem: (_k, v) => calls.push(v) });
    expect(calls).toEqual([JSON.stringify({ prefix: "Ctrl+A" })]);
  });

  it("parsePrefix/matchesPrefix recognize the default Ctrl+B combo", () => {
    const parsed = parsePrefix(DEFAULT_PREFIX);
    expect(parsed).toEqual({ ctrl: true, meta: false, shift: false, alt: false, key: "b" });
    expect(matchesPrefix(DEFAULT_PREFIX, keyEvent("b", { ctrlKey: true }))).toBe(true);
    expect(matchesPrefix(DEFAULT_PREFIX, keyEvent("b"))).toBe(false);
  });

  it("isTextInputFocused recognizes input/textarea/contenteditable, not a plain div", () => {
    const input = document.createElement("input");
    const textarea = document.createElement("textarea");
    const div = document.createElement("div");
    const editable = document.createElement("div");
    editable.contentEditable = "true";
    expect(isTextInputFocused(input)).toBe(true);
    expect(isTextInputFocused(textarea)).toBe(true);
    expect(isTextInputFocused(editable)).toBe(true);
    expect(isTextInputFocused(div)).toBe(false);
    expect(isTextInputFocused(null)).toBe(false);
  });

  it("formatBinding renders chord bindings as 'prefix + key' and non-chord as the bare key", () => {
    const chordBinding = { action: "new-pane", keys: "c", description: "", category: "Lifecycle", chord: true } as const;
    const plainBinding = { action: "toggle-theme", keys: "t", description: "", category: "View", chord: false } as const;
    expect(formatBinding(chordBinding, "Ctrl+B")).toBe("Ctrl+B + c");
    expect(formatBinding(plainBinding, "Ctrl+B")).toBe("t");
  });
});

describe("KeyboardService", () => {
  let store: FakePanesStore;
  let service: KeyboardService;

  beforeEach(() => {
    localStorage.removeItem("kanhrd.keyboard");
    localStorage.removeItem("kanhrd.theme");
    store = new FakePanesStore();
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        LayoutService,
        ThemeService,
        ToastService,
        { provide: PanesStore, useValue: store },
        { provide: Router, useValue: { navigate: jasmine.createSpy("navigate") } },
      ],
    });
    service = TestBed.inject(KeyboardService);
  });

  afterEach(() => {
    localStorage.removeItem("kanhrd.keyboard");
    localStorage.removeItem("kanhrd.theme");
    document.documentElement.removeAttribute("data-theme");
  });

  it("defaults prefix() to Ctrl+B", () => {
    expect(service.prefix()).toBe(DEFAULT_PREFIX);
  });

  it("persists a changed prefix to localStorage", async () => {
    service.setPrefix("Ctrl+A");
    await settle();
    expect(loadPrefix()).toBe("Ctrl+A");
  });

  it("resetToDefault() restores Ctrl+B after a rebind", () => {
    service.setPrefix("Ctrl+A");
    service.resetToDefault();
    expect(service.prefix()).toBe(DEFAULT_PREFIX);
  });

  it("shortcuts() returns every documented action, each with a description", () => {
    const shortcuts = service.shortcuts();
    for (const action of [
      "new-pane",
      "next-tab",
      "prev-tab",
      "last-tab",
      "open-rail",
      "close-tab",
      "close-pane",
      "rename-tab",
      "jump-tab",
      "help",
      "toggle-theme",
      "focus-search",
      "close-overlay",
    ] as const) {
      expect(shortcuts.get(action)?.description).withContext(action).toBeTruthy();
    }
  });

  describe("prefix chord detection", () => {
    it("arms on Ctrl+B, then 'c' within the timeout fires new-pane (paneCreate lookup + splitPane)", () => {
      store.findHostForCapability.and.returnValue("local");

      service.handleKeydown(keyEvent("b", { ctrlKey: true }), document.body);
      expect(service.chordActive()).toBe(true);

      service.handleKeydown(keyEvent("c"), document.body);

      expect(service.chordActive()).toBe(false);
      expect(store.findHostForCapability).toHaveBeenCalledWith("paneCreate");
      expect(store.splitPane).toHaveBeenCalledWith("local", { direction: "right" });
    });

    it("expires the chord after the 2s timeout, so a late 'c' does nothing", () => {
      jasmine.clock().install();
      try {
        store.findHostForCapability.and.returnValue("local");

        service.handleKeydown(keyEvent("b", { ctrlKey: true }), document.body);
        expect(service.chordActive()).toBe(true);

        jasmine.clock().tick(2001);
        expect(service.chordActive()).toBe(false);

        service.handleKeydown(keyEvent("c"), document.body);
        expect(store.splitPane).not.toHaveBeenCalled();
      } finally {
        jasmine.clock().uninstall();
      }
    });
  });

  describe("focused-input suppression", () => {
    it("does not arm the chord (or fire the bound action) while a text input has focus", () => {
      const input = document.createElement("input");
      store.findHostForCapability.and.returnValue("local");

      service.handleKeydown(keyEvent("b", { ctrlKey: true }), input);
      expect(service.chordActive())
        .withContext("Ctrl+B must reach the focused input untouched, not arm the prefix chord")
        .toBe(false);

      service.handleKeydown(keyEvent("c"), input);
      expect(store.splitPane).not.toHaveBeenCalled();
    });
  });

  describe("'?' help overlay", () => {
    it("opens when no text input has focus", () => {
      expect(service.helpOpen()).toBe(false);
      service.handleKeydown(keyEvent("?"), document.body);
      expect(service.helpOpen()).toBe(true);
    });

    it("does not open while a text input has focus", () => {
      const input = document.createElement("input");
      service.handleKeydown(keyEvent("?"), input);
      expect(service.helpOpen()).toBe(false);
    });

    it("Escape closes the overlay", () => {
      service.openHelp();
      expect(service.helpOpen()).toBe(true);
      service.handleKeydown(keyEvent("Escape"), document.body);
      expect(service.helpOpen()).toBe(false);
    });
  });

  describe("tab navigation (chord)", () => {
    it("prefix+n advances tabFilterSignal to the next tab in tabsSignal order", () => {
      store.setTabs([tab("local", "t1"), tab("local", "t2")]);
      store.setScope("local", "w1", "t1");

      service.handleKeydown(keyEvent("b", { ctrlKey: true }), document.body);
      service.handleKeydown(keyEvent("n"), document.body);

      expect(store.tabFilterSignal()).toEqual({ host: "local", tabId: "t2" });
    });

    it("prefix+0..9 jumps to the tab at that index", () => {
      store.setTabs([tab("local", "t1"), tab("local", "t2"), tab("local", "t3")]);

      service.handleKeydown(keyEvent("b", { ctrlKey: true }), document.body);
      service.handleKeydown(keyEvent("2"), document.body);

      expect(store.tabFilterSignal()).toEqual({ host: "local", tabId: "t3" });
    });
  });

  it("prefix+t (non-chord 't') toggles the theme", () => {
    const themeService = TestBed.inject(ThemeService);
    const before = themeService.theme();
    service.handleKeydown(keyEvent("t"), document.body);
    expect(themeService.theme()).not.toBe(before);
  });
});
