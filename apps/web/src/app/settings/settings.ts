import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { PanesStore } from '../state/panes.store';
import { SettingsService, type Density } from '../state/settings.service';
import { ParkedStore } from '../state/parked.store';
import { TERMINAL_FONT_SIZES, TerminalFontSizeService } from '../state/terminal-font-size.service';
import {
  HERDR_READ_LINE_CEILING,
  TERMINAL_SCROLLBACK_STEPS,
  TerminalScrollbackService,
} from '../state/terminal-scrollback.service';
import {
  DEFAULT_PREFIX,
  KeyboardService,
  formatBinding,
  type ShortcutBinding,
} from '../state/keyboard.service';
import { ConfirmModal, type ConfirmPreviewItem } from '../shared/confirm-modal';
import { LucideArrowLeft } from '../shared/icons';
import { ThemeChoice } from '../shared/theme-choice';
import { TerminalThemeChoice } from '../shared/terminal-theme-choice';
import { COPY, fill } from '../shared/copy';

/**
 * `/settings` — appearance (theme + density), terminal palette, runtime
 * (read-only advertised poll cadence per host plus the inert override),
 * hosts (read-only: host config lives in `kanhrd.config.yaml` on the bridge),
 * keyboard, and data (clear local client state).
 *
 * Single column capped at `--content-max-width`; every row stacks
 * label-over-control below `--breakpoint-mobile`, and the back control is
 * the first focusable element on the screen.
 */
@Component({
  selector: 'app-settings',
  imports: [RouterLink, ConfirmModal, LucideArrowLeft, ThemeChoice, TerminalThemeChoice],
  templateUrl: './settings.html',
  styleUrl: './settings.scss',
})
export class Settings {
  protected readonly store = inject(PanesStore);
  protected readonly settingsService = inject(SettingsService);
  private readonly parked = inject(ParkedStore);
  protected readonly keyboardService = inject(KeyboardService);
  protected readonly terminalFontSizeService = inject(TerminalFontSizeService);
  protected readonly terminalFontSizes = TERMINAL_FONT_SIZES;
  protected readonly terminalScrollbackService = inject(TerminalScrollbackService);
  protected readonly terminalScrollbackSteps = TERMINAL_SCROLLBACK_STEPS;
  /** The ceiling is a measured herdr fact, so it is filled in from the constant that caps the control rather than written into the copy. */
  protected readonly terminalScrollbackNote = fill(COPY.settings.terminalScrollbackNote, {
    max: String(HERDR_READ_LINE_CEILING),
  });

  protected readonly copy = COPY;
  /** The screen's copy. */
  protected readonly text = COPY.settings;

  protected readonly hosts = this.store.hostsSignal;
  protected readonly capabilities = this.store.capabilitiesSignal;
  protected readonly density = computed(() => this.settingsService.settings().density);
  protected readonly requestedPollIntervalMs = computed(
    () => this.settingsService.settings().requestedOutputPollIntervalMs
  );

  protected setDensity(density: Density): void {
    this.settingsService.setDensity(density);
  }

  protected setTerminalFontSize(size: number): void {
    this.terminalFontSizeService.set(size);
  }

  protected setTerminalScrollback(lines: number): void {
    this.terminalScrollbackService.set(lines);
  }

  protected onRequestedPollIntervalInput(value: string): void {
    const parsed = value.trim() === '' ? null : Number(value);
    this.settingsService.setRequestedPollIntervalMs(
      parsed !== null && Number.isFinite(parsed) ? parsed : null
    );
  }

  /** Data readout, not copy: the advertised cadence in ms, or `n/a` when the host advertises none. */
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
      case 'override':
        return 'your override';
      case 'herdr-config':
        return 'from herdr config';
      default:
        return 'default';
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
    { kind: COPY.settings.clearKindSetting, name: COPY.settings.clearSwimlane },
    { kind: COPY.settings.clearKindSetting, name: COPY.settings.clearAppearance },
    { kind: COPY.settings.clearKindSetting, name: COPY.settings.clearTerminal },
    { kind: COPY.settings.clearKindSetting, name: COPY.settings.clearTerminalFontSize },
    { kind: COPY.settings.clearKindSetting, name: COPY.settings.clearTerminalScrollback },
    { kind: COPY.settings.clearKindSetting, name: COPY.settings.clearKeyboard },
    { kind: COPY.settings.clearKindSetting, name: COPY.settings.clearParked },
  ];

  // --- clear parked columns -----------------------------------------------
  //
  // The board's user-defined columns live in this browser only (the section
  // note above says so for everything in here), so this is where they are
  // cleared. Removing them is the same fact `remove column` states, applied
  // to all of them at once: the cards go back to their status columns and
  // nothing on the host changes.

  protected readonly showClearParkedConfirm = signal(false);

  protected requestClearParked(): void {
    this.showClearParkedConfirm.set(true);
  }

  protected confirmClearParked(): void {
    this.showClearParkedConfirm.set(false);
    this.parked.clear();
  }

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
