import { Component, computed, effect, inject, input, signal } from "@angular/core";
import { NgTemplateOutlet } from "@angular/common";
import { RouterLink } from "@angular/router";
import type { BridgeCapabilities, Pane, SplitDirection } from "@kanhrd/schema";
import { PanesStore } from "../state/panes.store";
import { hostColor } from "../util/host-color";
import { ConfirmModal } from "../shared/confirm-modal";
import { ClockTick, formatElapsed } from "../util/clock";

@Component({
  selector: "app-card",
  imports: [RouterLink, NgTemplateOutlet, ConfirmModal],
  templateUrl: "./card.html",
  styleUrl: "./card.scss",
})
export class Card {
  private readonly store = inject(PanesStore);
  private readonly clock = inject(ClockTick);

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

  // --- discreet stats badge ---------------------------------------------
  // Uses only data already on the `Pane`/`EventKind` surface: the pane's
  // own `agent_status` plus how long it's held that status (tracked
  // client-side — herdr/the bridge send no timestamp, so "since when" is
  // derived from when this client last observed a change, not invented
  // bridge data), and an optional line count off `last_output_snippet`
  // (present today only as an optional projected field; the badge simply
  // omits that segment when a bridge hasn't populated it).

  private readonly statusSince = signal(Date.now());
  private lastObservedStatus: Pane["agent_status"] | null = null;

  protected readonly elapsed = computed(() => formatElapsed(this.clock.now() - this.statusSince()));

  protected readonly lineCount = computed(() => {
    const snippet = this.pane().last_output_snippet;
    return snippet ? snippet.split("\n").length : null;
  });

  constructor() {
    effect(() => {
      const status = this.pane().agent_status;
      if (this.lastObservedStatus !== null && this.lastObservedStatus !== status) {
        this.statusSince.set(Date.now());
      }
      this.lastObservedStatus = status;
    });
  }

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
