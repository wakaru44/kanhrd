import { Injectable, computed, inject, signal } from "@angular/core";
import { Router } from "@angular/router";
import { PanesStore } from "./panes.store";
import { LayoutService } from "./layout.service";
import { ThemeService } from "./theme.service";
import { ToastService } from "./toast.service";
import { COPY } from "../shared/copy";

export type ShortcutCategory = "Navigation" | "Lifecycle" | "View" | "Help";

export type ShortcutAction =
  | "new-pane"
  | "next-tab"
  | "prev-tab"
  | "last-tab"
  | "open-rail"
  | "close-tab"
  | "close-pane"
  | "rename-tab"
  | "jump-tab"
  | "help"
  | "toggle-theme"
  | "focus-search"
  | "close-overlay";

export interface ShortcutBinding {
  readonly action: ShortcutAction;
  /** The action key pressed after the prefix (or, for non-chord bindings, standalone). `"0-9"` is a range, not a literal key. */
  readonly keys: string;
  readonly description: string;
  readonly category: ShortcutCategory;
  /** True when this binding requires the prefix chord first. */
  readonly chord: boolean;
}

export const DEFAULT_PREFIX = "Ctrl+B";
const CHORD_TIMEOUT_MS = 2000;
const STORAGE_KEY = "kanhrd.keyboard";

interface StoredKeyboardSettings {
  prefix: string;
}

/** Herdr-style tmux-convention bindings. Only `prefix` is user-rebindable today (see `KeyboardService` doc); individual action keys are fixed. */
const SHORTCUT_LIST: readonly ShortcutBinding[] = [
  // `description` is what the user reads, so every one of these comes from
  // `shared/copy.ts` — never a literal typed here. `new-pane` reuses
  // `create.pane` because it is the same action the board's `+` menu
  // performs; the rest live under `help.shortcuts`.
  { action: "new-pane", keys: "c", description: COPY.create.pane, category: "Lifecycle", chord: true },
  {
    action: "next-tab",
    keys: "n",
    description: COPY.help.shortcuts.nextTab,
    category: "Navigation",
    chord: true,
  },
  {
    action: "prev-tab",
    keys: "p",
    description: COPY.help.shortcuts.prevTab,
    category: "Navigation",
    chord: true,
  },
  {
    action: "last-tab",
    keys: "l",
    description: COPY.help.shortcuts.lastTab,
    category: "Navigation",
    chord: true,
  },
  {
    action: "open-rail",
    keys: "w",
    description: COPY.help.shortcuts.openRail,
    category: "View",
    chord: true,
  },
  {
    action: "close-tab",
    keys: "&",
    description: COPY.help.shortcuts.closeTab,
    category: "Lifecycle",
    chord: true,
  },
  {
    action: "close-pane",
    keys: "x",
    description: COPY.help.shortcuts.closePane,
    category: "Lifecycle",
    chord: true,
  },
  {
    action: "rename-tab",
    keys: ",",
    description: COPY.help.shortcuts.renameTab,
    category: "Lifecycle",
    chord: true,
  },
  {
    action: "jump-tab",
    keys: "0-9",
    description: COPY.help.shortcuts.jumpTab,
    category: "Navigation",
    chord: true,
  },
  {
    action: "help",
    keys: "?",
    description: COPY.help.shortcuts.help,
    category: "Help",
    chord: false,
  },
  {
    action: "toggle-theme",
    keys: "t",
    description: COPY.help.shortcuts.toggleTheme,
    category: "View",
    chord: false,
  },
  {
    action: "focus-search",
    keys: "/",
    description: COPY.help.shortcuts.focusSearch,
    category: "View",
    chord: false,
  },
  {
    action: "close-overlay",
    keys: "Escape",
    description: COPY.help.shortcuts.closeOverlay,
    category: "Help",
    chord: false,
  },
];

const SHORTCUT_MAP: ReadonlyMap<ShortcutAction, ShortcutBinding> = new Map(
  SHORTCUT_LIST.map((binding) => [binding.action, binding]),
);

/** Renders a binding's display label for the given prefix, e.g. `"Ctrl+B + c"` or `"t"` for non-chord bindings. */
export function formatBinding(binding: ShortcutBinding, prefix: string): string {
  if (binding.action === "help") {
    return `? or ${prefix} + ?`;
  }
  return binding.chord ? `${prefix} + ${binding.keys}` : binding.keys;
}

/** Pure read, unit-testable without DI — mirrors `loadTheme` in theme.service.ts. */
export function loadPrefix(storage: Pick<Storage, "getItem"> = localStorage): string {
  return loadPrefixOverride(storage) ?? DEFAULT_PREFIX;
}

/**
 * Like `loadPrefix`, but returns `null` instead of `DEFAULT_PREFIX` when
 * nothing valid is stored — the distinction `KeyboardService.prefix`
 * needs to tell "the user explicitly rebound this" apart from "no override
 * exists yet, fall through to the herdr-mirrored or hardcoded default."
 */
export function loadPrefixOverride(storage: Pick<Storage, "getItem"> = localStorage): string | null {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as Partial<StoredKeyboardSettings>;
    return typeof parsed.prefix === "string" && parsed.prefix.trim() ? parsed.prefix : null;
  } catch {
    return null;
  }
}

export function savePrefix(prefix: string, storage: Pick<Storage, "setItem"> = localStorage): void {
  storage.setItem(STORAGE_KEY, JSON.stringify({ prefix } satisfies StoredKeyboardSettings));
}

export function clearStoredPrefix(storage: Pick<Storage, "removeItem"> = localStorage): void {
  storage.removeItem(STORAGE_KEY);
}

/** True when a keydown on `el` should be left alone for the app's shortcuts (the user is typing) — includes xterm.js, whose hidden input IS a real `<textarea>`. */
export function isTextInputFocused(el: Element | null): boolean {
  if (!el) {
    return false;
  }
  if (el.tagName === "INPUT" || el.tagName === "TEXTAREA") {
    return true;
  }
  return (el as HTMLElement).isContentEditable === true;
}

interface ParsedPrefix {
  ctrl: boolean;
  meta: boolean;
  shift: boolean;
  alt: boolean;
  key: string;
}

/** Parses a display prefix string (e.g. `"Ctrl+B"`) into the modifier/key shape needed to match a `KeyboardEvent`. */
export function parsePrefix(prefix: string): ParsedPrefix {
  const parts = prefix
    .split("+")
    .map((p) => p.trim())
    .filter(Boolean);
  const key = (parts[parts.length - 1] ?? "").toLowerCase();
  const mods = parts.slice(0, -1).map((p) => p.toLowerCase());
  return {
    ctrl: mods.includes("ctrl") || mods.includes("control"),
    meta: mods.includes("meta") || mods.includes("cmd"),
    shift: mods.includes("shift"),
    alt: mods.includes("alt"),
    key,
  };
}

export function matchesPrefix(prefix: string, event: KeyboardEvent): boolean {
  const parsed = parsePrefix(prefix);
  return (
    event.key.toLowerCase() === parsed.key &&
    event.ctrlKey === parsed.ctrl &&
    event.metaKey === parsed.meta &&
    event.shiftKey === parsed.shift &&
    event.altKey === parsed.alt
  );
}

/**
 * tmux/herdr-style prefix-chord keyboard shortcuts: signals + `localStorage`
 * (mirrors `ThemeService`/`SettingsService`'s pattern) for the rebindable
 * prefix, plus the actual chord-detection and action-dispatch logic so
 * `App`'s global keydown listener stays a thin `handleKeydown` call. Owns
 * `PanesStore`/`LayoutService`/`ThemeService` directly since every action
 * here is a plain client-side call identical to what `Board`/`Rail` already
 * do from a click handler — this is TUI/client presentation wiring, not new
 * shared runtime state.
 *
 * "Current tab" for the tab-navigation/close/rename actions is
 * `PanesStore.tabFilterSignal` — the same "current tab" the rail already
 * tracks via click-to-filter. "Close current pane" (`prefix+x`) is
 * deliberately a no-op stub: unlike herdr's own TUI, kanhrd's board renders
 * every pane simultaneously with no single focused pane to close, so there
 * is no honest "current" to act on yet.
 */
@Injectable({ providedIn: "root" })
export class KeyboardService {
  private readonly store = inject(PanesStore);
  private readonly layout = inject(LayoutService);
  private readonly themeService = inject(ThemeService);
  private readonly toastService = inject(ToastService);
  private readonly router = inject(Router);

  /**
   * The user's explicit Settings > Keyboard rebind, if any — `null` means
   * "no override, fall through to the herdr-mirrored or hardcoded
   * default." Only `setPrefix`/`resetToDefault` (explicit user action)
   * write to this and to `localStorage`; merely computing a default never
   * does, unlike the old always-persist-on-load behavior.
   */
  private readonly prefixOverride = signal<string | null>(loadPrefixOverride());

  /**
   * Effective prefix, in precedence order: (1) `prefixOverride`, (2) the
   * primary host's `bridge.capabilities.hostKeybinds.prefix` (mirrors
   * herdr's own configured prefix — see the `add-host-keybinds-passthrough`
   * openspec change), (3) the hardcoded `DEFAULT_PREFIX`.
   */
  readonly prefix = computed<string>(
    () => this.prefixOverride() ?? this.store.primaryHostKeybinds()?.prefix ?? DEFAULT_PREFIX,
  );

  /** Where `prefix()`'s current value came from, for Settings > Keyboard's source label. */
  readonly prefixSource = computed<"override" | "herdr-config" | "default">(() => {
    if (this.prefixOverride() !== null) {
      return "override";
    }
    return this.store.primaryHostKeybinds() ? "herdr-config" : "default";
  });

  readonly helpOpen = signal(false);

  private readonly chordArmedSignal = signal(false);
  /** Exposed read-only mostly for tests/diagnostics; the UI doesn't currently render a chord indicator. */
  readonly chordActive = this.chordArmedSignal.asReadonly();

  private chordTimer: ReturnType<typeof setTimeout> | null = null;
  /** The tab shown before the current `tabFilterSignal`, for `prefix+l` ("last tab"). Only tracks keyboard-driven switches. */
  private previousTab: { host: string; tabId: string } | null = null;

  shortcuts(): ReadonlyMap<ShortcutAction, ShortcutBinding> {
    return SHORTCUT_MAP;
  }

  setPrefix(prefix: string): void {
    this.prefixOverride.set(prefix);
    savePrefix(prefix);
  }

  resetToDefault(): void {
    this.prefixOverride.set(null);
    clearStoredPrefix();
  }

  openHelp(): void {
    this.helpOpen.set(true);
  }

  closeHelp(): void {
    this.helpOpen.set(false);
  }

  /**
   * Single entry point for the global keydown listener (`App`). Handles
   * suppression, chord arming/timeout, and dispatch in one place so `App`
   * itself stays a one-line wire-up.
   */
  handleKeydown(event: KeyboardEvent, activeElement: Element | null): void {
    if (isTextInputFocused(activeElement)) {
      // The user is typing — including into xterm.js's hidden textarea, so
      // Ctrl+B reaches the terminal instead of arming the prefix chord.
      this.disarmChord();
      return;
    }

    if (this.chordArmedSignal()) {
      this.disarmChord();
      this.dispatchChordAction(event);
    } else if (matchesPrefix(this.prefix(), event)) {
      event.preventDefault();
      this.armChord();
    } else {
      this.dispatchNonChordAction(event);
    }

    // `App` now attaches this in the CAPTURE phase at `window` specifically
    // so this can win a race against a page-level browser extension's own
    // capture-phase listener (e.g. Vimium binding `Ctrl+B` to scroll-up —
    // see openspec's fix-keyboard-shortcut-suppression). Only stop
    // propagation for a key we actually recognized (every branch above
    // that acts on the event calls `preventDefault()` first) — an
    // unrecognized key must reach the page/terminal/extension untouched.
    if (event.defaultPrevented) {
      event.stopPropagation();
    }
  }

  private armChord(): void {
    this.chordArmedSignal.set(true);
    if (this.chordTimer) {
      clearTimeout(this.chordTimer);
    }
    this.chordTimer = setTimeout(() => this.disarmChord(), CHORD_TIMEOUT_MS);
  }

  private disarmChord(): void {
    this.chordArmedSignal.set(false);
    if (this.chordTimer) {
      clearTimeout(this.chordTimer);
      this.chordTimer = null;
    }
  }

  private dispatchChordAction(event: KeyboardEvent): void {
    const key = event.key;
    if (/^[0-9]$/.test(key)) {
      event.preventDefault();
      this.jumpTabByIndex(Number(key));
      return;
    }
    switch (key) {
      case "c":
        event.preventDefault();
        void this.newPane();
        return;
      case "n":
        event.preventDefault();
        this.cycleTab(1);
        return;
      case "p":
        event.preventDefault();
        this.cycleTab(-1);
        return;
      case "l":
        event.preventDefault();
        this.lastTab();
        return;
      case "w":
        event.preventDefault();
        this.openRailFocused();
        return;
      case "&":
        event.preventDefault();
        this.closeCurrentTab();
        return;
      case "x":
        event.preventDefault();
        // ponytail: no "focused pane" concept exists in this kanban board
        // (every pane renders simultaneously, unlike a single-pane tmux/herdr
        // view) — deferred rather than guessing which pane "current" means.
        // Upgrade path: once a pane focus/selection model exists, wire this
        // the same way close-tab is wired below (PanesStore pending-action
        // signal → Rail/Board opens the existing ConfirmModal).
        console.info(
          "kanhrd: prefix+x (close current pane) isn't wired up yet — the board has no focused-pane model to act on",
        );
        return;
      case ",":
        event.preventDefault();
        this.renameCurrentTab();
        return;
      case "?":
        event.preventDefault();
        this.openHelp();
        return;
      case "t":
      case "T":
        // Not in the brief's "prefix" action-key list (`t` is documented as
        // a bare non-chord shortcut below) — kept as a harmless alias so
        // `prefix+t` also works, matching the brief's own E2E acceptance
        // wording ("Press prefix + t, theme toggles") alongside the bare
        // `t` shortcut.
        event.preventDefault();
        this.themeService.toggle();
        return;
      default:
        return;
    }
  }

  private dispatchNonChordAction(event: KeyboardEvent): void {
    switch (event.key) {
      case "?":
        event.preventDefault();
        this.openHelp();
        return;
      case "Escape":
        this.closeTopOverlay();
        return;
      case "/":
        event.preventDefault();
        console.info("kanhrd: search is coming soon");
        return;
      case "t":
      case "T":
        this.themeService.toggle();
        return;
      default:
        return;
    }
  }

  private closeTopOverlay(): void {
    if (this.helpOpen()) {
      this.closeHelp();
      return;
    }
    if (this.toastService.toasts().length > 0) {
      this.toastService.dismissTop();
      return;
    }
    if (this.layout.plusMenuOpen()) {
      this.layout.closePlusMenu();
      return;
    }
    if (this.layout.railOpen()) {
      this.layout.closeRail();
      return;
    }
    if (this.store.scopeSignal()) {
      // Mirrors the board's scope pill's own × button — navigates back to
      // `/` rather than clearing `PanesStore.scopeSignal` directly, so the
      // URL (the source of truth `Board`'s route-sync effect derives the
      // scope from) and the store never disagree.
      void this.router.navigate(["/"]);
    }
  }

  private async newPane(): Promise<void> {
    const host = this.store.findHostForCapability("paneCreate");
    if (!host) {
      return;
    }
    try {
      await this.store.splitPane(host, { direction: "right" });
    } catch (err) {
      console.warn("keyboard: new pane failed", err);
    }
  }

  private openRailFocused(): void {
    this.layout.openRail();
    document.querySelector<HTMLElement>(".rail")?.focus();
  }

  private orderedTabs(): { host: string; id: string; workspaceId: string }[] {
    return [...this.store.tabsSignal().values()].map((tab) => ({
      host: tab.host,
      id: tab.id,
      workspaceId: tab.workspace.id,
    }));
  }

  private cycleTab(direction: 1 | -1): void {
    const tabs = this.orderedTabs();
    if (tabs.length === 0) {
      return;
    }
    const current = this.store.tabFilterSignal();
    const currentIndex = current
      ? tabs.findIndex((t) => t.host === current.host && t.id === current.tabId)
      : -1;
    const nextIndex = (((currentIndex + direction) % tabs.length) + tabs.length) % tabs.length;
    this.setCurrentTab(tabs[nextIndex]);
  }

  private jumpTabByIndex(index: number): void {
    const target = this.orderedTabs()[index];
    if (!target) {
      return;
    }
    this.setCurrentTab(target);
  }

  private lastTab(): void {
    const prev = this.previousTab;
    if (!prev) {
      return;
    }
    const current = this.store.tabFilterSignal();
    this.previousTab = current ? { host: current.host, tabId: current.tabId } : null;
    const workspaceId = this.orderedTabs().find((t) => t.host === prev.host && t.id === prev.tabId)?.workspaceId;
    if (workspaceId) {
      this.store.setScope(prev.host, workspaceId, prev.tabId);
    }
  }

  private setCurrentTab(target: { host: string; id: string; workspaceId: string }): void {
    const current = this.store.tabFilterSignal();
    this.previousTab = current ? { host: current.host, tabId: current.tabId } : null;
    this.store.setScope(target.host, target.workspaceId, target.id);
  }

  private renameCurrentTab(): void {
    const current = this.store.tabFilterSignal();
    if (!current) {
      return;
    }
    this.store.requestPendingRename("tab", current.host, current.tabId);
  }

  private closeCurrentTab(): void {
    const current = this.store.tabFilterSignal();
    if (!current) {
      return;
    }
    this.store.requestCloseTabById(current.host, current.tabId);
  }
}
