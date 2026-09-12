import { Component, computed, inject, input, output } from '@angular/core';
import type { BridgeCapabilities, Pane, TabSummary, WorkspaceSummary } from '@kanhrd/schema';
import { COPY } from './copy';
import { PanesStore } from '../state/panes.store';

/**
 * How deep a destination has to be named. A creation is only as specific as
 * the thing it creates: a workspace needs a host, a tab needs a workspace, a
 * pane needs a tab — and a move needs a tab too.
 */
export type DestinationLevel = 'host' | 'workspace' | 'tab';

/**
 * One place a pane, tab or workspace can be put. The fields above the
 * chosen level are `null`: a `host` destination names no workspace, because
 * there is no workspace to name yet.
 *
 * `targetPaneId` is a pane that already sits in `tabId`. It is what makes a
 * tab destination reachable at all: `pane.split` narrows to a workspace with
 * `workspace_id` and no further, so without a pane to point at, herdr picks
 * the tab itself — which is the whole defect this picker exists to close.
 */
export interface Destination {
  host: string;
  workspaceId: string | null;
  workspaceName: string | null;
  tabId: string | null;
  tabName: string | null;
  targetPaneId: string | null;
  /** What the operator reads: names, not product copy (see shared/copy.ts's header). */
  label: string;
}

/** The capability a host must advertise for a destination on it to be offered. */
export type DestinationCapability = keyof Pick<
  BridgeCapabilities,
  'paneCreate' | 'paneMove' | 'tabCrud' | 'workspaceCrud'
>;

/** Everything `destinationsFor` reads, so it can be called without a store. */
export interface DestinationSources {
  workspaces: Iterable<WorkspaceSummary>;
  tabs: Iterable<TabSummary>;
  panes: Iterable<Pane>;
  capabilities: ReadonlyMap<string, BridgeCapabilities>;
}

export interface DestinationQuery {
  level: DestinationLevel;
  capability: DestinationCapability;
  /**
   * A tab to leave out — the pane's own, for a move. Moving a pane into the
   * tab it is already in is herdr's `same_tab` no-op, and an option that
   * cannot do anything should not be offered.
   */
  excludeTab?: { host: string; tabId: string } | null;
}

/**
 * Every destination on offer, in host → workspace → tab order.
 *
 * A pure function rather than a method, because two callers need the same
 * answer for different reasons: the picker renders it, and the board counts
 * it to decide whether there is anything worth asking about. One
 * implementation means the question and the list can never disagree.
 *
 * A host is qualified into the label only when more than one host is
 * offering something. On the single-host board that is the common case, a
 * host name on every row is noise that says nothing.
 */
export function destinationsFor(
  sources: DestinationSources,
  query: DestinationQuery
): readonly Destination[] {
  const capable = new Set<string>();
  for (const [host, caps] of sources.capabilities) {
    if (caps[query.capability] === true) {
      capable.add(host);
    }
  }

  if (query.level === 'host') {
    return [...capable].sort().map((host) => ({
      host,
      workspaceId: null,
      workspaceName: null,
      tabId: null,
      tabName: null,
      targetPaneId: null,
      label: host,
    }));
  }

  const workspaces = [...sources.workspaces]
    .filter((workspace) => capable.has(workspace.host))
    .sort((a, b) => a.host.localeCompare(b.host) || a.name.localeCompare(b.name));
  const multiHost = new Set(workspaces.map((w) => w.host)).size > 1;

  if (query.level === 'workspace') {
    return workspaces.map((workspace) => ({
      host: workspace.host,
      workspaceId: workspace.id,
      workspaceName: workspace.name,
      tabId: null,
      tabName: null,
      targetPaneId: null,
      label: multiHost ? `${workspace.host} / ${workspace.name}` : workspace.name,
    }));
  }

  const tabs = [...sources.tabs];
  const panes = [...sources.panes];
  const exclude = query.excludeTab ?? null;
  const out: Destination[] = [];
  for (const workspace of workspaces) {
    const own = tabs
      .filter((tab) => tab.host === workspace.host && tab.workspace.id === workspace.id)
      .sort((a, b) => a.name.localeCompare(b.name));
    for (const tab of own) {
      if (exclude && exclude.host === tab.host && exclude.tabId === tab.id) {
        continue;
      }
      const pane = panes.find((p) => p.host === tab.host && p.tab.id === tab.id);
      const name = `${workspace.name} / ${tab.name}`;
      out.push({
        host: tab.host,
        workspaceId: workspace.id,
        workspaceName: workspace.name,
        tabId: tab.id,
        tabName: tab.name,
        targetPaneId: pane?.id ?? null,
        label: multiHost ? `${tab.host} / ${name}` : name,
      });
    }
  }
  return out;
}

/**
 * The one destination list, used by every surface that has to ask where
 * something goes: the board's `+` menu when the board has no scope to answer
 * with, and a card's move menu.
 *
 * It renders as a `role="group"` of plain menu items INSIDE the menu that
 * opened it, rather than as a second popover. That is the shape `park in…`
 * already uses, and the reason is the keyboard: one menu, one arrow/Home/
 * End/Escape contract over every item, with focus returning to the one
 * trigger that opened it. A nested popover would need a second contract and
 * a second focus owner for no gain.
 */
@Component({
  selector: 'app-destination-picker',
  templateUrl: './destination-picker.html',
  styleUrl: './destination-picker.scss',
})
export class DestinationPicker {
  private readonly store = inject(PanesStore);
  protected readonly copy = COPY;

  readonly level = input.required<DestinationLevel>();
  readonly capability = input.required<DestinationCapability>();
  readonly excludeTab = input<{ host: string; tabId: string } | null>(null);

  readonly chosen = output<Destination>();

  /**
   * Read off the store rather than taken as a list, so a host that
   * connects, a workspace that opens or a tab that closes while the menu is
   * open changes the rows under the operator instead of leaving a
   * destination on offer that has stopped existing.
   */
  readonly destinations = computed<readonly Destination[]>(() =>
    destinationsFor(
      {
        workspaces: this.store.workspacesSignal().values(),
        tabs: this.store.tabsSignal().values(),
        panes: this.store.panesSignal().values(),
        capabilities: this.store.capabilitiesSignal(),
      },
      { level: this.level(), capability: this.capability(), excludeTab: this.excludeTab() }
    )
  );

  protected choose(destination: Destination): void {
    this.chosen.emit(destination);
  }
}
