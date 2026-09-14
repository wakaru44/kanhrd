import type {
  BridgeCapabilities,
  BridgeMethod,
  BridgeMethodParams,
  BridgeMethodResult,
  EventKind,
  Pane,
  ReadFormat,
  ReadSource,
  WsRequest,
  WsResponse,
} from '@kanhrd/schema';
import { HerdrRequestError } from '../herdr/client.js';
import { RepoFileError } from '../files/errors.js';
import { DEFAULT_REPO_FILE_LIMITS } from '../files/reader.js';
import { HostUnavailableError } from '../herdr/hosts.js';

/** Just enough of `HostRuntime` for dispatch to route tier-1 + tier-2 + tier-3 methods. */
export interface DispatchHost {
  listPanes(): Promise<Pane[]>;
  paneRead(params: {
    pane_id: string;
    source?: ReadSource;
    format?: ReadFormat;
    lines?: number;
    strip_ansi?: boolean;
  }): Promise<{
    content: string;
    revision: number;
    truncated: boolean;
    format: ReadFormat;
    source: ReadSource;
  }>;
  paneSendKeys(params: { pane_id: string; keys: string[] }): Promise<void>;
  paneSendText(params: { pane_id: string; text: string }): Promise<void>;

  // --- Tier-3 (pane/tab/workspace lifecycle) ------------------------------
  paneSplit(params: BridgeMethodParams['pane.split']): Promise<BridgeMethodResult['pane.split']>;
  paneClose(params: { pane_id: string }): Promise<void>;
  paneMove(params: BridgeMethodParams['pane.move']): Promise<BridgeMethodResult['pane.move']>;
  paneRename(params: BridgeMethodParams['pane.rename']): Promise<BridgeMethodResult['pane.rename']>;
  tabCreate(params: BridgeMethodParams['tab.create']): Promise<BridgeMethodResult['tab.create']>;
  tabRename(params: BridgeMethodParams['tab.rename']): Promise<BridgeMethodResult['tab.rename']>;
  tabClose(params: { tab_id: string }): Promise<void>;
  tabMove(params: BridgeMethodParams['tab.move']): Promise<BridgeMethodResult['tab.move']>;
  workspaceCreate(
    params: BridgeMethodParams['workspace.create']
  ): Promise<BridgeMethodResult['workspace.create']>;
  workspaceRename(
    params: BridgeMethodParams['workspace.rename']
  ): Promise<BridgeMethodResult['workspace.rename']>;
  workspaceClose(params: { workspace_id: string; close_group?: boolean }): Promise<void>;

  // --- Repo file reads ----------------------------------------------------
  repoStatus(params: BridgeMethodParams['repo.status']): Promise<BridgeMethodResult['repo.status']>;
  repoTree(params: BridgeMethodParams['repo.tree']): Promise<BridgeMethodResult['repo.tree']>;
  fileRead(params: BridgeMethodParams['file.read']): Promise<BridgeMethodResult['file.read']>;
  repoDiff(params: BridgeMethodParams['repo.diff']): Promise<BridgeMethodResult['repo.diff']>;

  /** Bridge-process-local, cached — see `HostRuntime.getHostKeybinds()` doc. */
  getHostKeybinds(): NonNullable<BridgeCapabilities['hostKeybinds']>;
}

export interface DispatchHostSource {
  get(host: string): DispatchHost | undefined;
  /** Configured hosts in config order — first entry is the "primary" host `bridge.capabilities.hostKeybinds` resolves from. */
  list(): DispatchHost[];
}

/**
 * `outputPollIntervalMs` reported in `BridgeCapabilities` — see
 * `ws/server.ts` for where the matching `OutputPoller` is constructed with
 * this same value. Kept as one constant so the two can't drift.
 */
export const OUTPUT_POLL_INTERVAL_MS = 150;

const CAPABILITIES: BridgeCapabilities = {
  tier: 3,
  terminal: true,
  paneResize: false,
  paneGraphics: false,
  outputPollIntervalMs: OUTPUT_POLL_INTERVAL_MS,
  // Tier-3 (lane LC3) — all ten methods are implemented, so every flag is
  // `true`. See CONTRACT-TIER3.md section 6: these are checked
  // independently by the SPA, not as an all-or-nothing tier gate.
  paneCreate: true,
  paneClose: true,
  paneMove: true,
  paneRename: true,
  tabCrud: true,
  workspaceCrud: true,
  repoFiles: DEFAULT_REPO_FILE_LIMITS,
};

export interface DispatchContext {
  hosts: DispatchHostSource;
  /** Mints a subscription id and records the (host, kinds) subscription. */
  onSubscribe: (host: string, kinds: EventKind[]) => string;
  /** Starts (or attaches to) a shared output poll loop and registers this connection as a subscriber. */
  subscribeOutput: (host: string, params: BridgeMethodParams['pane.subscribe_output']) => string;
  /** Deregisters a `pane.subscribe_output` subscription; stops the poll loop if it was the last one. */
  unsubscribeOutput: (subscriptionId: string) => void;
}

const NOT_SUPPORTED = {
  code: 'not_supported',
  message: 'herdr has no public PTY-resize API in this version',
} as const;

/**
 * Populates `hostKeybinds` from the primary host (first in
 * `DispatchHostSource.list()` config order — same "first host in config
 * order" idea `PanesStore.findHostForCapability` already uses client-side).
 * Answered identically regardless of which `host` the request named,
 * matching `bridge.capabilities`'s existing bridge-level-not-per-host
 * behavior. Omits the field entirely when there is no configured host to
 * resolve one from (e.g. an empty `hosts` config) rather than reporting a
 * fabricated default.
 */
function withHostKeybinds(base: BridgeCapabilities, hosts: DispatchHostSource): BridgeCapabilities {
  const primary = hosts.list()[0];
  if (!primary) {
    return base;
  }
  return { ...base, hostKeybinds: primary.getHostKeybinds() };
}

function invalid(id: string, host: string, message: string): WsResponse {
  return { id, host, ok: false, error: { code: 'invalid_params', message } };
}

/**
 * Routes one `WsRequest` to the matching herdr call and returns the
 * `WsResponse` to send back. Pure with respect to the WebSocket connection —
 * `ws/server.ts` owns the socket and event fan-out; this only decides what a
 * single request/response pair looks like.
 */
export async function dispatch(request: WsRequest, ctx: DispatchContext): Promise<WsResponse> {
  const { id, host, method } = request;

  // Bridge-owned, no herdr host involved — answer even if `host` isn't configured.
  if ((method as BridgeMethod) === 'bridge.capabilities') {
    return { id, host, ok: true, data: withHostKeybinds(CAPABILITIES, ctx.hosts) };
  }

  const runtime = ctx.hosts.get(host);
  if (!runtime) {
    return {
      id,
      host,
      ok: false,
      error: { code: 'unknown_host', message: `unknown host "${host}"` },
    };
  }

  try {
    switch (method as BridgeMethod) {
      case 'pane.list': {
        const panes = await runtime.listPanes();
        return { id, host, ok: true, data: { panes } };
      }
      case 'events.subscribe': {
        const kinds = (request.params as { kinds?: EventKind[] } | undefined)?.kinds ?? [];
        const subscriptionId = ctx.onSubscribe(host, kinds);
        return { id, host, ok: true, data: { subscription_id: subscriptionId } };
      }
      case 'pane.read': {
        const params = request.params as BridgeMethodParams['pane.read'] | undefined;
        if (!params?.pane_id) {
          return {
            id,
            host,
            ok: false,
            error: { code: 'invalid_params', message: 'missing pane_id' },
          };
        }
        const data = await runtime.paneRead(params);
        return { id, host, ok: true, data };
      }
      case 'pane.subscribe_output': {
        const params = request.params as BridgeMethodParams['pane.subscribe_output'] | undefined;
        if (!params?.pane_id) {
          return {
            id,
            host,
            ok: false,
            error: { code: 'invalid_params', message: 'missing pane_id' },
          };
        }
        const subscriptionId = ctx.subscribeOutput(host, params);
        return { id, host, ok: true, data: { subscription_id: subscriptionId } };
      }
      case 'pane.unsubscribe_output': {
        const params = request.params as BridgeMethodParams['pane.unsubscribe_output'] | undefined;
        if (params?.subscription_id) ctx.unsubscribeOutput(params.subscription_id);
        return { id, host, ok: true, data: {} };
      }
      case 'pane.send_keys': {
        const params = request.params as BridgeMethodParams['pane.send_keys'] | undefined;
        if (!params?.pane_id || !params.keys) {
          return {
            id,
            host,
            ok: false,
            error: { code: 'invalid_params', message: 'missing pane_id or keys' },
          };
        }
        await runtime.paneSendKeys(params);
        return { id, host, ok: true, data: {} };
      }
      case 'pane.send_text': {
        const params = request.params as BridgeMethodParams['pane.send_text'] | undefined;
        if (!params?.pane_id || params.text === undefined) {
          return {
            id,
            host,
            ok: false,
            error: { code: 'invalid_params', message: 'missing pane_id or text' },
          };
        }
        await runtime.paneSendText(params);
        return { id, host, ok: true, data: {} };
      }
      case 'pane.resize':
        return { id, host, ok: false, error: NOT_SUPPORTED };
      case 'pane.graphics.info':
      case 'pane.graphics.stream':
        // Optional tier-2 capabilities this bridge build doesn't implement — see
        // CONTRACT-TIER2.md section 5. Dispatch entries kept so a future
        // implementation slots in cleanly without a client-facing shape change.
        return {
          id,
          host,
          ok: false,
          error: {
            code: 'not_supported',
            message: 'pane graphics streaming is not implemented in this bridge',
          },
        };

      // --- Tier-3 (pane/tab/workspace lifecycle) --------------------------

      case 'pane.split': {
        const params = request.params as BridgeMethodParams['pane.split'] | undefined;
        if (!params?.direction) {
          return {
            id,
            host,
            ok: false,
            error: { code: 'invalid_params', message: 'missing direction' },
          };
        }
        const data = await runtime.paneSplit(params);
        return { id, host, ok: true, data };
      }
      case 'pane.close': {
        const params = request.params as BridgeMethodParams['pane.close'] | undefined;
        if (!params?.pane_id) {
          return {
            id,
            host,
            ok: false,
            error: { code: 'invalid_params', message: 'missing pane_id' },
          };
        }
        await runtime.paneClose(params);
        return { id, host, ok: true, data: {} };
      }
      case 'pane.move': {
        const params = request.params as BridgeMethodParams['pane.move'] | undefined;
        if (!params?.pane_id || !params.destination) {
          return {
            id,
            host,
            ok: false,
            error: { code: 'invalid_params', message: 'missing pane_id or destination' },
          };
        }
        const data = await runtime.paneMove(params);
        return { id, host, ok: true, data };
      }
      case 'pane.rename': {
        const params = request.params as BridgeMethodParams['pane.rename'] | undefined;
        if (!params?.pane_id) {
          return {
            id,
            host,
            ok: false,
            error: { code: 'invalid_params', message: 'missing pane_id' },
          };
        }
        // `label` is intentionally NOT required: herdr's `PaneRenameParams`
        // requires only `pane_id`, and `null` is its explicit clear form.
        const data = await runtime.paneRename(params);
        return { id, host, ok: true, data };
      }
      case 'tab.create': {
        const params = (request.params as BridgeMethodParams['tab.create'] | undefined) ?? {};
        const data = await runtime.tabCreate(params);
        return { id, host, ok: true, data };
      }
      case 'tab.rename': {
        const params = request.params as BridgeMethodParams['tab.rename'] | undefined;
        if (!params?.tab_id || params.label === undefined) {
          return {
            id,
            host,
            ok: false,
            error: { code: 'invalid_params', message: 'missing tab_id or label' },
          };
        }
        const data = await runtime.tabRename(params);
        return { id, host, ok: true, data };
      }
      case 'tab.close': {
        const params = request.params as BridgeMethodParams['tab.close'] | undefined;
        if (!params?.tab_id) {
          return {
            id,
            host,
            ok: false,
            error: { code: 'invalid_params', message: 'missing tab_id' },
          };
        }
        await runtime.tabClose(params);
        return { id, host, ok: true, data: {} };
      }
      case 'tab.move': {
        const params = request.params as BridgeMethodParams['tab.move'] | undefined;
        if (!params?.tab_id || params.insert_index === undefined) {
          return {
            id,
            host,
            ok: false,
            error: { code: 'invalid_params', message: 'missing tab_id or insert_index' },
          };
        }
        const data = await runtime.tabMove(params);
        return { id, host, ok: true, data };
      }
      case 'workspace.create': {
        const params = (request.params as BridgeMethodParams['workspace.create'] | undefined) ?? {};
        const data = await runtime.workspaceCreate(params);
        return { id, host, ok: true, data };
      }
      case 'workspace.rename': {
        const params = request.params as BridgeMethodParams['workspace.rename'] | undefined;
        if (!params?.workspace_id || params.label === undefined) {
          return {
            id,
            host,
            ok: false,
            error: { code: 'invalid_params', message: 'missing workspace_id or label' },
          };
        }
        const data = await runtime.workspaceRename(params);
        return { id, host, ok: true, data };
      }
      case 'workspace.close': {
        const params = request.params as BridgeMethodParams['workspace.close'] | undefined;
        if (!params?.workspace_id) {
          return {
            id,
            host,
            ok: false,
            error: { code: 'invalid_params', message: 'missing workspace_id' },
          };
        }
        await runtime.workspaceClose(params);
        return { id, host, ok: true, data: {} };
      }

      // --- Repo file reads ------------------------------------------------

      case 'repo.status': {
        const params = request.params as BridgeMethodParams['repo.status'] | undefined;
        if (typeof params?.pane_id !== 'string' || params.pane_id === '') {
          return invalid(id, host, 'missing pane_id');
        }
        const data = await runtime.repoStatus({ pane_id: params.pane_id });
        return { id, host, ok: true, data };
      }
      case 'repo.tree': {
        const params = request.params as BridgeMethodParams['repo.tree'] | undefined;
        if (typeof params?.pane_id !== 'string' || params.pane_id === '') {
          return invalid(id, host, 'missing pane_id');
        }
        if (params.path !== undefined && typeof params.path !== 'string') {
          return invalid(id, host, 'path must be a string');
        }
        const treeParams: BridgeMethodParams['repo.tree'] = { pane_id: params.pane_id };
        if (params.path !== undefined) treeParams.path = params.path;
        const data = await runtime.repoTree(treeParams);
        return { id, host, ok: true, data };
      }
      case 'file.read':
      case 'repo.diff': {
        const params = request.params as BridgeMethodParams['file.read'] | undefined;
        if (typeof params?.pane_id !== 'string' || params.pane_id === '') {
          return invalid(id, host, 'missing pane_id');
        }
        if (typeof params.path !== 'string') return invalid(id, host, 'missing path');
        const pathParams = { pane_id: params.pane_id, path: params.path };
        const data =
          method === 'file.read'
            ? await runtime.fileRead(pathParams)
            : await runtime.repoDiff(pathParams);
        return { id, host, ok: true, data };
      }
      default:
        return {
          id,
          host,
          ok: false,
          error: { code: 'unknown_method', message: `unknown method "${String(method)}"` },
        };
    }
  } catch (err) {
    if (err instanceof RepoFileError) {
      return { id, host, ok: false, error: { code: err.code, message: err.message } };
    }
    if (err instanceof HostUnavailableError) {
      return { id, host, ok: false, error: { code: err.code, message: err.message } };
    }
    // Tier-3: herdr's own error code (e.g. `workspace_group_close_required` —
    // CONTRACT-TIER3.md section 5.4) is preserved end to end instead of being
    // flattened to `internal_error`, so the browser can distinguish it.
    if (err instanceof HerdrRequestError) {
      return { id, host, ok: false, error: { code: err.code, message: err.message } };
    }
    return {
      id,
      host,
      ok: false,
      error: { code: 'internal_error', message: err instanceof Error ? err.message : String(err) },
    };
  }
}
