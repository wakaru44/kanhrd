import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { parse as parseYaml } from 'yaml';

export interface HostConfig {
  name: string;
  socket: string;
}

export interface BridgeConfig {
  bind: string;
  port: number;
  spaDir: string;
  hosts: HostConfig[];
}

/** Flags parsed from argv; each overrides the matching config-file value. */
export interface CliOverrides {
  configPath?: string;
  port?: number;
  bind?: string;
  spaDir?: string;
  allowNonLoopback?: boolean;
}

const DEFAULT_CONFIG_PATH = 'kanhrd.config.yaml';

const DEFAULT_CONFIG: BridgeConfig = {
  bind: '127.0.0.1',
  port: 5173,
  spaDir: '../../web/dist/web/browser',
  hosts: [{ name: 'local', socket: '~/.config/herdr/herdr.sock' }],
};

// ponytail: loopback allowlist is a fixed set, not a full CIDR/hostname
// resolver — good enough for "did the user type a public bind address by
// mistake"; widen if IPv6 zone ids or hostnames-that-resolve-to-loopback
// come up.
const LOOPBACK_ADDRESSES = new Set(['127.0.0.1', '::1', 'localhost']);

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
  return partial;
}

export function loadConfig(overrides: CliOverrides = {}): BridgeConfig {
  const fileConfig = readConfigFile(overrides.configPath ?? DEFAULT_CONFIG_PATH);

  const merged: BridgeConfig = {
    bind: overrides.bind ?? fileConfig?.bind ?? DEFAULT_CONFIG.bind,
    port: overrides.port ?? fileConfig?.port ?? DEFAULT_CONFIG.port,
    spaDir: overrides.spaDir ?? fileConfig?.spaDir ?? DEFAULT_CONFIG.spaDir,
    hosts: (fileConfig?.hosts ?? DEFAULT_CONFIG.hosts).map((host) => ({
      ...host,
      socket: expandHome(host.socket),
    })),
  };

  if (!LOOPBACK_ADDRESSES.has(merged.bind) && !overrides.allowNonLoopback) {
    throw new Error(
      `refusing to bind to non-loopback address "${merged.bind}" without --i-know-what-im-doing`
    );
  }

  return merged;
}
