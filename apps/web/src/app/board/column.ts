import { Component, computed, input } from "@angular/core";
import { CdkDrag, CdkDropList } from "@angular/cdk/drag-drop";
import { ScrollingModule } from "@angular/cdk/scrolling";
import type { AgentStatus, BridgeCapabilities, Pane } from "@kanhrd/schema";
import { Card } from "./card";

/** Above this many cards, switch the column to CDK virtual scroll — below it, intersection-observer overhead isn't worth it for a short list. */
const VIRTUALIZE_THRESHOLD = 20;

/**
 * One kanban column. Built on CDK drop lists but with drag disabled: column
 * membership is driven by `agent_status`, a herdr-owned fact the browser
 * cannot change today. Structure is here so a later "user-controlled column"
 * feature (park/archive a pane out of the live flow; it returns to its
 * status-driven column automatically on its next activity) can flip
 * `cdkDropListDisabled`/`cdkDragDisabled` to `false` without a rewrite. Not
 * shipping yet — do not delete this scaffold as dead code.
 */
@Component({
  selector: "app-column",
  imports: [Card, CdkDropList, CdkDrag, ScrollingModule],
  templateUrl: "./column.html",
  styleUrl: "./column.scss",
})
export class Column {
  readonly status = input.required<AgentStatus>();
  readonly panes = input.required<Pane[]>();
  readonly capabilities = input.required<ReadonlyMap<string, BridgeCapabilities>>();

  protected readonly virtualized = computed(() => this.panes().length > VIRTUALIZE_THRESHOLD);

  protected trackPane(_index: number, pane: Pane): string {
    return `${pane.host}:${pane.id}`;
  }
}
