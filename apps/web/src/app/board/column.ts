import { Component, input } from "@angular/core";
import { CdkDrag, CdkDropList } from "@angular/cdk/drag-drop";
import type { AgentStatus, BridgeCapabilities, Pane } from "@kanhrd/schema";
import { Card } from "./card";

/**
 * One kanban column. Built on CDK drop lists but with drag disabled: column
 * membership is driven by `agent_status`, a herdr-owned fact the browser
 * cannot change in tier-1. Structure is here so a later tier can flip
 * `cdkDropListDisabled`/`cdkDragDisabled` to `false` without a rewrite.
 */
@Component({
  selector: "app-column",
  imports: [Card, CdkDropList, CdkDrag],
  templateUrl: "./column.html",
  styleUrl: "./column.scss",
})
export class Column {
  readonly status = input.required<AgentStatus>();
  readonly panes = input.required<Pane[]>();
  readonly capabilities = input.required<ReadonlyMap<string, BridgeCapabilities>>();

  protected trackPane(_index: number, pane: Pane): string {
    return `${pane.host}:${pane.id}`;
  }
}
