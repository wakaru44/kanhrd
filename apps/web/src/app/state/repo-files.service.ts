import { Injectable, inject } from '@angular/core';
import type {
  BridgeCapabilities,
  BridgeMethod,
  BridgeMethodParams,
  BridgeMethodResult,
  RepoFileErrorCode,
} from '@kanhrd/schema';
import { PanesStore } from './panes.store';
import { BridgeError, WsClient } from './ws-client';

/**
 * The four repo file methods, and nothing else. Every call answers a
 * discriminated result rather than throwing: the panel renders a state for
 * each failure (docs/UX-GUIDELINES.md, "Reliability states tell the truth"),
 * so a rejected promise reaching a component would be a state the operator
 * never sees.
 *
 * Read-only by construction. There is no write method on the bridge's file
 * capability and none is wrapped here.
 */

/** Codes the panel has a state of its own for, plus the envelope-wide ones. */
export type RepoFilesErrorCode =
  RepoFileErrorCode | 'unknown_host' | 'host_unavailable' | 'invalid_params' | 'transport';

export type RepoFilesResult<T> =
  | { readonly ok: true; readonly data: T }
  | { readonly ok: false; readonly code: RepoFilesErrorCode; readonly message: string };

type RepoFilesMethod = 'repo.status' | 'repo.tree' | 'file.read' | 'repo.diff';

/** Bridge-advertised caps for the four methods; absent on a bridge without them. */
export type RepoFilesCapability = NonNullable<BridgeCapabilities['repoFiles']>;

@Injectable({ providedIn: 'root' })
export class RepoFilesService {
  private readonly ws = inject(WsClient);
  private readonly store = inject(PanesStore);

  /**
   * What the host's bridge advertises, or `null` on a bridge that does not
   * implement the methods at all — a tier-1 or older build. The toggle gates
   * on this: a control that cannot work does not appear
   * (docs/UX-GUIDELINES.md, "Visible affordances").
   */
  capability(host: string): RepoFilesCapability | null {
    return this.store.capabilitiesSignal().get(host)?.repoFiles ?? null;
  }

  status(host: string, paneId: string) {
    return this.call(host, 'repo.status', { pane_id: paneId });
  }

  /** One directory level. An omitted `path` is the checkout root. */
  tree(host: string, paneId: string, path?: string) {
    return this.call(host, 'repo.tree', { pane_id: paneId, path });
  }

  read(host: string, paneId: string, path: string) {
    return this.call(host, 'file.read', { pane_id: paneId, path });
  }

  diff(host: string, paneId: string, path: string) {
    return this.call(host, 'repo.diff', { pane_id: paneId, path });
  }

  private async call<M extends RepoFilesMethod>(
    host: string,
    method: M,
    params: BridgeMethodParams[M]
  ): Promise<RepoFilesResult<BridgeMethodResult[M]>> {
    try {
      const data = await this.ws.request(host, method as BridgeMethod, params);
      if (data === undefined) {
        // An `ok: true` frame with no `data` is a bridge the schema does not
        // describe; treat it as transport rather than invent a result.
        return { ok: false, code: 'transport', message: `${method} answered nothing` };
      }
      return { ok: true, data: data as BridgeMethodResult[M] };
    } catch (err) {
      if (err instanceof BridgeError) {
        return {
          ok: false,
          code: err.code as RepoFilesErrorCode,
          message: err.bridgeMessage,
        };
      }
      // A socket that is not open, or one that closed mid-request. Its own
      // message is the honest one; the panel says the bridge is out of reach.
      return {
        ok: false,
        code: 'transport',
        message: err instanceof Error ? err.message : String(err),
      };
    }
  }
}
