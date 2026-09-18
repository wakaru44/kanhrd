import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { BridgeCapabilities } from '@kanhrd/schema';
import { PanesStore } from './panes.store';
import { RepoFilesService } from './repo-files.service';
import { BridgeError, WsClient } from './ws-client';

/**
 * The service's whole job is that a component never sees a rejected promise:
 * every bridge refusal has a state the panel can render, and one it cannot
 * name is still reported with the bridge's own words rather than swallowed.
 */
describe('state/repo-files.service', () => {
  let requests: { host: string; method: string; params: unknown }[];
  let answer: () => Promise<unknown>;
  let capabilities: Map<string, BridgeCapabilities>;
  let service: RepoFilesService;

  beforeEach(() => {
    requests = [];
    answer = async () => ({ ok: 'data' });
    capabilities = new Map();

    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        {
          provide: WsClient,
          useValue: {
            request: (host: string, method: string, params: unknown) => {
              requests.push({ host, method, params });
              return answer();
            },
          },
        },
        { provide: PanesStore, useValue: { capabilitiesSignal: () => capabilities } },
      ],
    });
    service = TestBed.inject(RepoFilesService);
  });

  function caps(repoFiles?: BridgeCapabilities['repoFiles']): BridgeCapabilities {
    return {
      tier: 3,
      terminal: true,
      paneResize: false,
      paneGraphics: false,
      outputPollIntervalMs: 1000,
      ...(repoFiles ? { repoFiles } : {}),
    } as BridgeCapabilities;
  }

  it('reports no capability for a bridge that does not advertise the methods', () => {
    capabilities.set('laptop', caps());
    expect(service.capability('laptop')).toBeNull();
    // An unknown host is not a bridge that HAS the methods either.
    expect(service.capability('nowhere')).toBeNull();
  });

  it('hands back the advertised caps for a bridge that does', () => {
    const repoFiles = {
      statusPollIntervalMs: 2500,
      fileReadMaxBytes: 1_048_576,
      diffMaxBytes: 262_144,
      treeMaxEntries: 1000,
      statusMaxEntries: 1000,
    };
    capabilities.set('laptop', caps(repoFiles));
    expect(service.capability('laptop')?.statusPollIntervalMs).toBe(2500);
  });

  it('keys every method by pane, never by a path the client chose', async () => {
    await service.status('laptop', 'p1');
    await service.tree('laptop', 'p1');
    await service.tree('laptop', 'p1', 'src');
    await service.read('laptop', 'p1', 'src/a.ts');
    await service.diff('laptop', 'p1', 'src/a.ts');

    expect(requests.map((r) => r.method)).toEqual([
      'repo.status',
      'repo.tree',
      'repo.tree',
      'file.read',
      'repo.diff',
    ]);
    for (const request of requests) {
      expect((request.params as { pane_id: string }).pane_id).toBe('p1');
    }
    // An omitted path is the checkout root; the service does not invent "/".
    expect((requests[1].params as { path?: string }).path).toBeUndefined();
  });

  it("turns a bridge refusal into a code and the bridge's own message", async () => {
    answer = () => Promise.reject(new BridgeError('files_not_local', 'host files: false'));

    const result = await service.read('alpaca01', 'p1', 'a.ts');

    expect(result.ok).toBeFalse();
    if (!result.ok) {
      expect(result.code).toBe('files_not_local');
      expect(result.message).toBe('host files: false');
    }
  });

  it('never rejects, so no component has to catch', async () => {
    answer = () => Promise.reject(new Error('ws not connected: cannot send file.read to laptop'));

    const result = await service.read('laptop', 'p1', 'a.ts');

    expect(result.ok).toBeFalse();
    if (!result.ok) {
      expect(result.code).toBe('transport');
      expect(result.message).toContain('ws not connected');
    }
  });

  it('treats an answer with no data as transport, rather than inventing a result', async () => {
    answer = async () => undefined;

    const result = await service.status('laptop', 'p1');

    expect(result.ok).toBeFalse();
    if (!result.ok) {
      expect(result.code).toBe('transport');
    }
  });

  it('passes a success straight through', async () => {
    answer = async () => ({ path: '', entries: [], truncated: false });

    const result = await service.tree('laptop', 'p1');

    expect(result.ok).toBeTrue();
    if (result.ok) {
      expect(result.data.entries).toEqual([]);
    }
  });
});
