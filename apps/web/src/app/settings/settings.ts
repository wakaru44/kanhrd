import { Component, computed, inject, signal } from "@angular/core";
import { RouterLink } from "@angular/router";
import { PanesStore } from "../state/panes.store";
import { ThemeService } from "../state/theme.service";
import { SettingsService, type Density } from "../state/settings.service";
import { ConfirmModal } from "../shared/confirm-modal";

/**
 * `/settings` route. Appearance (theme + density), Runtime (read-only
 * advertised poll interval per host, plus an inert "requested" override —
 * see SettingsService's doc on why it isn't wired to anything yet),
 * Servers/hosts (read-only, bridge-owned per the runtime/client boundary
 * guardrail — host config lives in `kanhrd.config.yaml` on the bridge host,
 * not something this SPA can edit), and Data (clear local client state).
 */
@Component({
  selector: "app-settings",
  imports: [RouterLink, ConfirmModal],
  templateUrl: "./settings.html",
  styleUrl: "./settings.scss",
})
export class Settings {
  protected readonly store = inject(PanesStore);
  protected readonly themeService = inject(ThemeService);
  protected readonly settingsService = inject(SettingsService);

  protected readonly hosts = this.store.hostsSignal;
  protected readonly capabilities = this.store.capabilitiesSignal;
  protected readonly density = computed(() => this.settingsService.settings().density);
  protected readonly requestedPollIntervalMs = computed(
    () => this.settingsService.settings().requestedOutputPollIntervalMs,
  );

  protected toggleTheme(): void {
    this.themeService.toggle();
  }

  protected setDensity(density: Density): void {
    this.settingsService.setDensity(density);
  }

  protected onRequestedPollIntervalInput(value: string): void {
    const parsed = value.trim() === "" ? null : Number(value);
    this.settingsService.setRequestedPollIntervalMs(parsed !== null && Number.isFinite(parsed) ? parsed : null);
  }

  protected advertisedPollInterval(host: string): number | null {
    return this.capabilities().get(host)?.outputPollIntervalMs ?? null;
  }

  // --- clear local data --------------------------------------------------

  protected readonly showClearConfirm = signal(false);

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
