import { Component, computed, input } from "@angular/core";
import { NgTemplateOutlet } from "@angular/common";
import { RouterLink } from "@angular/router";
import type { BridgeCapabilities, Pane } from "@kanhrd/schema";
import { hostColor } from "../util/host-color";

@Component({
  selector: "app-card",
  imports: [RouterLink, NgTemplateOutlet],
  templateUrl: "./card.html",
  styleUrl: "./card.scss",
})
export class Card {
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
}
