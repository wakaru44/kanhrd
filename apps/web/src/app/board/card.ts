import { Component, computed, inject, input, signal } from "@angular/core";
import { NgTemplateOutlet } from "@angular/common";
import { RouterLink } from "@angular/router";
import type { BridgeCapabilities, Pane, SplitDirection } from "@kanhrd/schema";
import { PanesStore } from "../state/panes.store";
import { hostColor } from "../util/host-color";
import { ConfirmModal } from "../shared/confirm-modal";

@Component({
  selector: "app-card",
  imports: [RouterLink, NgTemplateOutlet, ConfirmModal],
  templateUrl: "./card.html",
  styleUrl: "./card.scss",
})
export class Card {
  private readonly store = inject(PanesStore);

  readonly pane = input.required<Pane>();
  /** Per-host `bridge.capabilities` results, threaded down from the store via Board/Column. */
  readonly capabilities = input.required<ReadonlyMap<string, BridgeCapabilities>>();

  protected readonly hostColor = computed(() => hostColor(this.pane().host));

  protected readonly displayName = computed(() => {
    const pane = this.pane();
    return pane.agent?.name ?? pane.title ?? pane.id.slice(0, 8);
  });

  protected readonly path = computed(() => {
    const pane = this.pane();
    return `${pane.workspace.name} / ${pane.tab.name}`;
  });

  /** Whether this pane's host bridge supports the tier-2 terminal detail view. */
  protected readonly terminalAvailable = computed(
    () => this.capabilities().get(this.pane().host)?.terminal === true,
  );

  /** Tier-3: whether `pane.close` will succeed on this pane's host. */
  protected readonly paneCloseAvailable = computed(
    () => this.capabilities().get(this.pane().host)?.paneClose === true,
  );
  /** Tier-3: whether `pane.split` will succeed on this pane's host. */
  protected readonly paneSplitAvailable = computed(
    () => this.capabilities().get(this.pane().host)?.paneCreate === true,
  );

  protected readonly showCloseConfirm = signal(false);
  protected readonly showSplitMenu = signal(false);

  protected readonly closeConfirmBody = computed(
    () => `Terminate "${this.displayName()}"? This cannot be undone.`,
  );

  protected onCloseClick(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    this.showSplitMenu.set(false);
    this.showCloseConfirm.set(true);
  }

  protected confirmClose(): void {
    this.showCloseConfirm.set(false);
    void this.store.closePane(this.pane().host, this.pane().id);
  }

  protected onSplitClick(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    this.showSplitMenu.update((open) => !open);
  }

  protected doSplit(direction: SplitDirection, event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    this.showSplitMenu.set(false);
    void this.store.splitPane(this.pane().host, {
      target_pane_id: this.pane().id,
      direction,
    });
  }
}
