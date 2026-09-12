import type { BridgeCapabilities, Pane, TabSummary, WorkspaceSummary } from '@kanhrd/schema';
import { destinationsFor, type DestinationSources } from './destination-picker';

function caps(overrides: Partial<BridgeCapabilities>): BridgeCapabilities {
  return {
    tier: 3,
    terminal: true,
    paneResize: false,
    paneGraphics: false,
    outputPollIntervalMs: 150,
    paneCreate: false,
    paneClose: false,
    paneMove: false,
    paneRename: false,
    tabCrud: false,
    workspaceCrud: false,
    ...overrides,
  };
}

const WORKSPACES: WorkspaceSummary[] = [
  { id: 'w1', host: 'laptop', name: 'kanhrd' },
  { id: 'w2', host: 'desktop', name: 'herdr' },
];

const TABS: TabSummary[] = [
  { id: 't1', host: 'laptop', workspace: { id: 'w1' }, name: 'main' },
  { id: 't2', host: 'laptop', workspace: { id: 'w1' }, name: 'logs' },
  { id: 't3', host: 'desktop', workspace: { id: 'w2' }, name: 'build' },
];

const PANES: Pane[] = [
  {
    id: 'p1',
    host: 'laptop',
    workspace: { id: 'w1', name: 'kanhrd' },
    tab: { id: 't1', name: 'main' },
    agent_status: 'idle',
  },
];

function sources(capabilities: ReadonlyMap<string, BridgeCapabilities>): DestinationSources {
  return { workspaces: WORKSPACES, tabs: TABS, panes: PANES, capabilities };
}

const BOTH_CAN_CREATE = new Map([
  ['laptop', caps({ paneCreate: true, tabCrud: true, workspaceCrud: true })],
  ['desktop', caps({ paneCreate: true, tabCrud: true, workspaceCrud: true })],
]);

/**
 * `destinationsFor` is what the picker renders AND what the board counts to
 * decide whether there is a question worth asking, so these pin both at
 * once (openspec `add-pane-destinations`, tasks 2.1 and 2.2).
 */
describe('destinationsFor', () => {
  it('offers each level only as deep as the thing being created needs', () => {
    const hosts = destinationsFor(sources(BOTH_CAN_CREATE), {
      level: 'host',
      capability: 'workspaceCrud',
    });
    expect(hosts.map((d) => d.label)).toEqual(['desktop', 'laptop']);
    expect(hosts[0].workspaceId).withContext('a host names no workspace yet').toBeNull();

    const workspaces = destinationsFor(sources(BOTH_CAN_CREATE), {
      level: 'workspace',
      capability: 'tabCrud',
    });
    expect(workspaces.map((d) => d.workspaceId)).toEqual(['w2', 'w1']);
    expect(workspaces[0].tabId).toBeNull();

    const tabs = destinationsFor(sources(BOTH_CAN_CREATE), {
      level: 'tab',
      capability: 'paneCreate',
    });
    expect(tabs.map((d) => d.tabId)).toEqual(['t3', 't2', 't1']);
  });

  it('carries a pane already in the tab, which is what makes a tab reachable at all', () => {
    const tabs = destinationsFor(sources(BOTH_CAN_CREATE), {
      level: 'tab',
      capability: 'paneCreate',
    });
    // `workspace_id` alone narrows to the workspace and no further, so a tab
    // destination herdr can actually honour needs a pane to point at.
    expect(tabs.find((d) => d.tabId === 't1')?.targetPaneId).toBe('p1');
    expect(tabs.find((d) => d.tabId === 't2')?.targetPaneId).toBeNull();
  });

  it('offers nothing on a host that cannot do the thing being asked for', () => {
    const onlyLaptop = new Map([
      ['laptop', caps({ paneCreate: true })],
      ['desktop', caps({ paneCreate: false })],
    ]);
    const tabs = destinationsFor(sources(onlyLaptop), {
      level: 'tab',
      capability: 'paneCreate',
    });
    expect(tabs.every((d) => d.host === 'laptop')).toBeTrue();

    const noneCanMove = destinationsFor(sources(onlyLaptop), {
      level: 'tab',
      capability: 'paneMove',
    });
    expect(noneCanMove).withContext('a host that can do neither contributes no rows').toEqual([]);
  });

  it('names the host only when more than one is offering something', () => {
    const tabs = destinationsFor(sources(BOTH_CAN_CREATE), {
      level: 'tab',
      capability: 'paneCreate',
    });
    expect(tabs[0].label).toBe('desktop / herdr / build');

    const single = new Map([['laptop', caps({ paneCreate: true })]]);
    const oneHost = destinationsFor(sources(single), { level: 'tab', capability: 'paneCreate' });
    expect(oneHost.map((d) => d.label))
      .withContext('a host name on every row of a single-host board says nothing')
      .toEqual(['kanhrd / logs', 'kanhrd / main']);
  });

  it('leaves out the tab a pane is already in — herdr would answer same_tab', () => {
    const tabs = destinationsFor(sources(BOTH_CAN_CREATE), {
      level: 'tab',
      capability: 'paneCreate',
      excludeTab: { host: 'laptop', tabId: 't1' },
    });
    expect(tabs.some((d) => d.tabId === 't1')).toBeFalse();
    expect(tabs.length).toBe(2);
  });
});
