import { Component, computed, input } from "@angular/core";
import { RouterLink } from "@angular/router";
import type { Pane } from "@kanhrd/schema";
import { hostColor } from "../util/host-color";

@Component({
  selector: "app-card",
  imports: [RouterLink],
  templateUrl: "./card.html",
  styleUrl: "./card.scss",
})
export class Card {
  readonly pane = input.required<Pane>();

  protected readonly hostColor = computed(() => hostColor(this.pane().host));

  protected readonly displayName = computed(() => {
    const pane = this.pane();
    return pane.agent?.name ?? pane.title ?? pane.id.slice(0, 8);
  });

  protected readonly path = computed(() => {
    const pane = this.pane();
    return `${pane.workspace.name} / ${pane.tab.name}`;
  });
}
