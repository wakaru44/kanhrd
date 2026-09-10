import { Component, computed, inject, signal } from "@angular/core";
import { RouterLink } from "@angular/router";
import { PanesStore } from "../state/panes.store";
import { ThemeService } from "../state/theme.service";
import { SettingsService, type Density } from "../state/settings.service";
import {
  TERMINAL_THEME_OPTIONS,
  TerminalThemeService,
  type TerminalThemeName,
} from "../state/terminal-theme.service";
import { TERMINAL_FONT_SIZES, TerminalFontSizeService } from "../state/terminal-font-size.service";
import { DEFAULT_PREFIX, KeyboardService, formatBinding, type ShortcutBinding } from "../state/keyboard.service";
import { ConfirmModal, type ConfirmPreviewItem } from "../shared/confirm-modal";
import { LucideArrowLeft } from "../shared/icons";
import { COPY } from "../shared/copy";

/**
 * Every string this screen shows that `shared/copy.ts` does not carry yet.
 * The redesign's copy table covers the board, cards, confirms and toasts but
 * not the settings surface, and this lane may not edit `copy.ts` — so the
 * strings live here, in one typed place, and the templates stay free of
 * literals. Lift this block into `copy.ts` under `settings.*` and delete it.
 *
 * Voice follows `docs/BRAND.md`: lowercase, terse, users read *pen* where
 * the wire says host.
 */
const SETTINGS_COPY = {
  appearance: "appearance",
  theme: "theme",
  toWashi: "switch to washi",
  toSumi: "switch to sumi",
  density: "density",
  comfortable: "comfortable",
  compact: "compact",

  terminal: "terminal",
  terminalNote:
    "one palette for every open terminal — cards are told apart by title, pen seal and status, never by terminal colour.",
  terminalTheme: "colour theme",
  terminalFontSize: "text size",

  runtime: "runtime",
  runtimeNote: "the output poll interval is bridge-owned. each connected pen advertises its own cadence.",
  noPensConnected: "no pens connected yet.",
  pollOverride: "requested override (ms)",
  pollOverrideNote:
    "not wired up yet — the bridge does not accept a per-subscription poll interval, so this is saved in this browser and changes nothing.",

  pens: "pens",
  pensNote: "the pen list is bridge-owned. to add, remove or reconfigure a pen, edit",
  pensNoteFile: "kanhrd.config.yaml",
  pensNoteTail: "on the bridge host — this screen reads it, it never writes it.",
  noPens: "no pens configured.",
  connected: "connected",
  notConnected: "not connected",

  keyboard: "keyboard",
  keyboardNote:
    "herdr-style prefix shortcuts: press the prefix, release, then the action key. rebinding is not available yet — only the prefix resets.",
  colAction: "action",
  colDefault: "default",
  colCurrent: "current",
  resetDefaults: "reset to defaults",

  data: "data",
  dataNote: "everything kanhrd keeps in this browser. no pen and no bridge is touched.",
  clearData: "clear local data",
  clearTitle: "clear what this browser remembers?",
  clearBody:
    "this removes kanhrd's saved settings from this browser and reloads the page. no pen, session or bridge is affected. this cannot be undone.",
  clearAction: "clear",
  clearKindSetting: "setting",
  clearFilters: "board filters",
  clearAppearance: "theme and density",
  clearTerminal: "terminal palette",
  clearTerminalFontSize: "terminal text size",
  clearKeyboard: "keyboard prefix",

  poll: {
    unavailable: "n/a",
    unit: "ms",
  },
} as const;

/**
 * `/settings` — appearance (theme + density), terminal palette, runtime
 * (read-only advertised poll cadence per pen plus the inert override),
 * pens (read-only: pen config lives in `kanhrd.config.yaml` on the bridge),
 * keyboard, and data (clear local client state).
 *
 * Single column capped at `--content-max-width`; every row stacks
 * label-over-control below `--breakpoint-mobile`, and the back control is
 * the first focusable element on the screen.
 */
@Component({
  selector: "app-settings",
  imports: [RouterLink, ConfirmModal, LucideArrowLeft],
  templateUrl: "./settings.html",
  styleUrl: "./settings.scss",
})
export class Settings {
  protected readonly store = inject(PanesStore);
  protected readonly themeService = inject(ThemeService);
  protected readonly settingsService = inject(SettingsService);
  protected readonly keyboardService = inject(KeyboardService);
  protected readonly terminalThemeService = inject(TerminalThemeService);
  protected readonly terminalThemeOptions = TERMINAL_THEME_OPTIONS;
  protected readonly terminalFontSizeService = inject(TerminalFontSizeService);
  protected readonly terminalFontSizes = TERMINAL_FONT_SIZES;

  protected readonly copy = COPY;
  protected readonly text = SETTINGS_COPY;

  protected readonly hosts = this.store.hostsSignal;
  protected readonly capabilities = this.store.capabilitiesSignal;
  protected readonly density = computed(() => this.settingsService.settings().density);
  protected readonly requestedPollIntervalMs = computed(
    () => this.settingsService.settings().requestedOutputPollIntervalMs,
  );

  protected themeLabel(): string {
    return this.themeService.theme() === "dark" ? this.text.toWashi : this.text.toSumi;
  }

  protected toggleTheme(): void {
    this.themeService.toggle();
  }

  protected setDensity(density: Density): void {
    this.settingsService.setDensity(density);
  }

  protected onTerminalThemeChange(value: string): void {
    this.terminalThemeService.set(value as TerminalThemeName);
  }

  protected setTerminalFontSize(size: number): void {
    this.terminalFontSizeService.set(size);
  }

  protected onRequestedPollIntervalInput(value: string): void {
    const parsed = value.trim() === "" ? null : Number(value);
    this.settingsService.setRequestedPollIntervalMs(parsed !== null && Number.isFinite(parsed) ? parsed : null);
  }

  /** Data readout, not copy: the advertised cadence in ms, or `n/a` when the pen advertises none. */
  protected advertisedPollLabel(host: string): string {
    const ms = this.capabilities().get(host)?.outputPollIntervalMs ?? null;
    return ms === null ? this.text.poll.unavailable : `${ms}${this.text.poll.unit}`;
  }

  // --- keyboard shortcuts --------------------------------------------------

  protected readonly shortcutRows = computed(() => [...this.keyboardService.shortcuts().values()]);

  protected defaultBindingLabel(binding: ShortcutBinding): string {
    return formatBinding(binding, DEFAULT_PREFIX);
  }

  protected currentBindingLabel(binding: ShortcutBinding): string {
    return formatBinding(binding, this.keyboardService.prefix());
  }

  protected resetKeyboardDefaults(): void {
    this.keyboardService.resetToDefault();
  }

  // --- clear local data ----------------------------------------------------

  protected readonly showClearConfirm = signal(false);

  /** What disappears, one row each — the preview-list pattern, so "cannot be undone" is backed by a list rather than a promise. */
  protected readonly clearPreview: readonly ConfirmPreviewItem[] = [
    { kind: SETTINGS_COPY.clearKindSetting, name: SETTINGS_COPY.clearFilters },
    { kind: SETTINGS_COPY.clearKindSetting, name: SETTINGS_COPY.clearAppearance },
    { kind: SETTINGS_COPY.clearKindSetting, name: SETTINGS_COPY.clearTerminal },
    { kind: SETTINGS_COPY.clearKindSetting, name: SETTINGS_COPY.clearTerminalFontSize },
    { kind: SETTINGS_COPY.clearKindSetting, name: SETTINGS_COPY.clearKeyboard },
  ];

  protected requestClearData(): void {
    this.showClearConfirm.set(true);
  }

  protected cancelClearData(): void {
    this.showClearConfirm.set(false);
  }

  protected confirmClearData(): void {
    this.showClearConfirm.set(false);
    this.settingsService.clearLocalData();
    location.reload();
  }
}
