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
  /** The screen's copy. `themeLabel()` reaches past it for the two shell-shared labels. */
  protected readonly text = COPY.settings;

  protected readonly hosts = this.store.hostsSignal;
  protected readonly capabilities = this.store.capabilitiesSignal;
  protected readonly density = computed(() => this.settingsService.settings().density);
  protected readonly requestedPollIntervalMs = computed(
    () => this.settingsService.settings().requestedOutputPollIntervalMs,
  );

  /** Same control, same words, as the shell's theme toggle — one pair of keys, not two. */
  protected themeLabel(): string {
    return this.themeService.theme() === "dark" ? COPY.nav.toWashi : COPY.nav.toSumi;
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
  protected readonly currentPrefix = this.keyboardService.prefix;
  protected readonly prefixSource = this.keyboardService.prefixSource;
  protected readonly prefixSourceLabel = computed(() => {
    switch (this.prefixSource()) {
      case "override":
        return "your override";
      case "herdr-config":
        return "from herdr config";
      default:
        return "default";
    }
  });

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
    { kind: COPY.settings.clearKindSetting, name: COPY.settings.clearFilters },
    { kind: COPY.settings.clearKindSetting, name: COPY.settings.clearAppearance },
    { kind: COPY.settings.clearKindSetting, name: COPY.settings.clearTerminal },
    { kind: COPY.settings.clearKindSetting, name: COPY.settings.clearTerminalFontSize },
    { kind: COPY.settings.clearKindSetting, name: COPY.settings.clearKeyboard },
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
