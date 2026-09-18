import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { parse as parseYaml } from 'yaml';

export interface HostConfig {
  name: string;
  socket: string;
  /**
   * `false` refuses every repo file method for this host's panes. Omitted
   * means the local-only gate decides (see `files/gate.ts`). For a tunnelled
   * host whose paths happen to exist on the bridge's machine as well, the
   * gate cannot tell the two machines apart; this is the operator's switch.
   */
  files?: boolean;
}

export interface BridgeConfig {
  bind: string;
  port: number;
  spaDir: string;
  hosts: HostConfig[];
  /** Extra browser origins the operator configured, as typed. */
  allowedOrigins: string[];
  /** Refuse handshakes that carry no `Origin` header at all. */
  requireOrigin: boolean;
  /** Resolved allowlist, ready for the handshake check. */
  origins: OriginPolicy;
}

/** A browser origin normalized for exact comparison. */
export interface OriginTriple {
  scheme: 'http' | 'https';
  host: string;
  port: number;
}

/**
 * The effective `/ws` origin policy: what was derived from `bind`/`port`,
 * what the operator configured, and the canonical keys the handshake check
 * compares against. Keeping the original strings alongside the keys is what
 * lets the startup and rejection logs print what the operator typed.
 */
export interface OriginPolicy {
  derived: string[];
  configured: string[];
  allowed: Set<string>;
  requireOrigin: boolean;
  allowAny: boolean;
}

/** Flags parsed from argv; each overrides the matching config-file value. */
export interface CliOverrides {
  configPath?: string;
  port?: number;
  bind?: string;
  spaDir?: string;
  allowNonLoopback?: boolean;
  /** Repeatable `--allowed-origin`; a non-empty list replaces the file's. */
  allowedOrigins?: string[];
  requireOrigin?: boolean;
  /** CLI-only escape hatch: disables the check entirely. */
  allowAnyOrigin?: boolean;
}

const DEFAULT_CONFIG_PATH = 'kanhrd.config.yaml';

const DEFAULT_CONFIG: BridgeConfig = {
  bind: '127.0.0.1',
  port: 5173,
  spaDir: '../../web/dist/web/browser',
  hosts: [{ name: 'local', socket: '~/.config/herdr/herdr.sock' }],
  allowedOrigins: [],
  requireOrigin: false,
  origins: {
    derived: [],
    configured: [],
    allowed: new Set(),
    requireOrigin: false,
    allowAny: false,
  },
};

// ponytail: loopback allowlist is a fixed set, not a full CIDR/hostname
// resolver — good enough for "did the user type a public bind address by
// mistake"; widen if IPv6 zone ids or hostnames-that-resolve-to-loopback
// come up.
const LOOPBACK_ADDRESSES = new Set(['127.0.0.1', '::1', 'localhost']);

/** Binds that are reachable under an unknown set of names. */
const WILDCARD_ADDRESSES = new Set(['0.0.0.0', '::']);

/** Hosts a browser on the box could use to reach any bind. */
const LOCAL_ORIGIN_HOSTS = ['127.0.0.1', 'localhost', '[::1]'];

export function expandHome(path: string): string {
  if (path === '~') return homedir();
  if (path.startsWith('~/')) return resolve(homedir(), path.slice(2));
  return path;
}

interface RawConfigFile {
  bind?: string;
  port?: number;
  spa_dir?: string;
  hosts?: HostConfig[];
  allowed_origins?: string[];
  require_origin?: boolean;
}

function readConfigFile(path: string): Partial<BridgeConfig> | undefined {
  let raw: string;
  try {
    raw = readFileSync(path, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw err;
  }
  const parsed = (parseYaml(raw) ?? {}) as RawConfigFile;
  const partial: Partial<BridgeConfig> = {};
  if (parsed.bind !== undefined) partial.bind = parsed.bind;
  if (parsed.port !== undefined) partial.port = parsed.port;
  if (parsed.spa_dir !== undefined) partial.spaDir = parsed.spa_dir;
  if (parsed.hosts !== undefined) partial.hosts = parsed.hosts;
  if (parsed.allowed_origins !== undefined) partial.allowedOrigins = parsed.allowed_origins;
  if (parsed.require_origin !== undefined) partial.requireOrigin = parsed.require_origin;
  return partial;
}

/**
 * Normalizes one origin string to a canonical `(scheme, host, port)` triple.
 *
 * Deliberately strict: an entry carrying a path, query, fragment, userinfo,
 * or a non-`http(s)` scheme is a configuration mistake, and the literal
 * `null` origin (sandboxed iframe, `file://`) is unparseable here on
 * purpose — it is a present-but-unmatchable origin, never an allowlistable
 * one. Throws with the offending value named.
 */
export function parseOrigin(value: string): OriginTriple {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`not a valid origin: "${value}"`);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`origin scheme must be http or https: "${value}"`);
  }
  if (url.username !== '' || url.password !== '') {
    throw new Error(`origin must not carry userinfo: "${value}"`);
  }
  if (url.search !== '' || url.hash !== '') {
    throw new Error(`origin must not carry a query or fragment: "${value}"`);
  }
  if (url.pathname !== '' && url.pathname !== '/') {
    throw new Error(`origin must not carry a path: "${value}"`);
  }
  if (url.hostname === '') {
    throw new Error(`origin must name a host: "${value}"`);
  }
  const scheme = url.protocol === 'http:' ? 'http' : 'https';
  return {
    scheme,
    host: url.hostname.toLowerCase(),
    port: url.port === '' ? (scheme === 'http' ? 80 : 443) : Number(url.port),
  };
}

/** The comparison key: two origins are equal iff their keys are equal. */
export function originKey(triple: OriginTriple): string {
  return `${triple.scheme}://${triple.host}:${triple.port}`;
}

/**
 * The origins a browser could legitimately use to reach this bridge, given
 * its own bind and port. A wildcard bind is never derived from — it names no
 * reachable origin — which is why it has to be paired with configuration.
 */
export function deriveOrigins(bind: string, port: number): string[] {
  const hosts = [...LOCAL_ORIGIN_HOSTS];
  if (!LOOPBACK_ADDRESSES.has(bind) && !WILDCARD_ADDRESSES.has(bind)) {
    hosts.push(bind.includes(':') ? `[${bind}]` : bind);
  }
  return hosts.flatMap((host) => [`http://${host}:${port}`, `https://${host}:${port}`]);
}

export function loadConfig(overrides: CliOverrides = {}): BridgeConfig {
  const fileConfig = readConfigFile(overrides.configPath ?? DEFAULT_CONFIG_PATH);

  const merged: BridgeConfig = {
    bind: overrides.bind ?? fileConfig?.bind ?? DEFAULT_CONFIG.bind,
    port: overrides.port ?? fileConfig?.port ?? DEFAULT_CONFIG.port,
    spaDir: overrides.spaDir ?? fileConfig?.spaDir ?? DEFAULT_CONFIG.spaDir,
    hosts: (fileConfig?.hosts ?? DEFAULT_CONFIG.hosts).map((host) => {
      if (host.files !== undefined && typeof host.files !== 'boolean') {
        throw new Error(`host "${host.name}": files must be true or false`);
      }
      return { ...host, socket: expandHome(host.socket) };
    }),
    // A non-empty CLI list replaces the file's, like every other override.
    allowedOrigins:
      overrides.allowedOrigins && overrides.allowedOrigins.length > 0
        ? overrides.allowedOrigins
        : (fileConfig?.allowedOrigins ?? DEFAULT_CONFIG.allowedOrigins),
    requireOrigin:
      overrides.requireOrigin ?? fileConfig?.requireOrigin ?? DEFAULT_CONFIG.requireOrigin,
    origins: DEFAULT_CONFIG.origins,
  };

  if (!LOOPBACK_ADDRESSES.has(merged.bind) && !overrides.allowNonLoopback) {
    throw new Error(
      `refusing to bind to non-loopback address "${merged.bind}" without --i-know-what-im-doing`
    );
  }

  const allowAny = overrides.allowAnyOrigin === true;
  const configuredTriples = merged.allowedOrigins.map((entry) => {
    try {
      return parseOrigin(entry);
    } catch (err) {
      throw new Error(`invalid entry in allowed_origins: ${(err as Error).message}`);
    }
  });

  if (WILDCARD_ADDRESSES.has(merged.bind) && merged.allowedOrigins.length === 0 && !allowAny) {
    throw new Error(
      `refusing to serve /ws on wildcard bind "${merged.bind}" with an empty origin ` +
        'allowlist: a browser origin cannot be derived from a wildcard bind. Set ' +
        '`allowed_origins:` in kanhrd.config.yaml, pass --allowed-origin <origin> ' +
        '(repeatable), or --allow-any-origin to disable the check.'
    );
  }

  const derived = deriveOrigins(merged.bind, merged.port);
  merged.origins = {
    derived,
    configured: [...merged.allowedOrigins],
    allowed: new Set([
      ...derived.map((entry) => originKey(parseOrigin(entry))),
      ...configuredTriples.map(originKey),
    ]),
    requireOrigin: merged.requireOrigin,
    allowAny,
  };

  return merged;
}
