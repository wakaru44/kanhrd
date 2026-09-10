import { readFileSync } from "node:fs";
import { homedir, platform } from "node:os";
import { join } from "node:path";
import { parse as parseToml } from "smol-toml";

/**
 * Mirrors herdr's own `config_dir()` (`src/config/io.rs` in the herdr
 * repo): `$XDG_CONFIG_HOME/<app_dir_name>` if set, else a platform default.
 * herdr's `app_dir_name()` is `"herdr-dev"` in debug builds, `"herdr"` in
 * release builds — this bridge always resolves the real user's release
 * config, so `"herdr"` is hardcoded rather than mirroring `HERDR_ENV`.
 *
 * Windows resolution (`%APPDATA%\herdr`, falling back to
 * `%USERPROFILE%\AppData\Roaming\herdr`) is included for completeness with
 * herdr's own fallback chain even though this bridge's only documented
 * hosts today are local Unix-domain-socket hosts.
 */
export function herdrConfigDir(env: NodeJS.ProcessEnv = process.env): string {
  const appDirName = "herdr";
  if (env.XDG_CONFIG_HOME) {
    return join(env.XDG_CONFIG_HOME, appDirName);
  }
  if (platform() === "win32") {
    const appData = env.APPDATA ?? (env.USERPROFILE ? join(env.USERPROFILE, "AppData", "Roaming") : undefined);
    if (appData) {
      return join(appData, appDirName);
    }
  }
  return join(homedir(), ".config", appDirName);
}

export type HostKeybindsSource = "herdr-api" | "herdr-cli" | "config-file" | "default";

export interface HostKeybinds {
  prefix: string;
  source: HostKeybindsSource;
}

/** herdr's own compiled-in default (`KeysConfig::default()` in `src/config/model.rs`) — used whenever the file, section, or field can't be read. */
export const DEFAULT_HERDR_PREFIX_RAW = "ctrl+b";

/**
 * Normalizes herdr's raw, lowercase, `+`-joined prefix string (e.g.
 * `"ctrl+b"`, `"ctrl+space"`, `"f12"`, `"esc"`) into a display string
 * (`"Ctrl+B"`, `"Ctrl+Space"`, `"F12"`, `"Esc"`).
 *
 * ponytail: a simple capitalize-each-`+`-segment transform, not a full
 * replica of herdr's own key-combo parser/formatter — good enough for the
 * modifier names (`ctrl`/`alt`/`shift`/`super`/`cmd`) and single
 * alphabetic/function-key segments herdr's default config realistically
 * contains. Documented as a known limitation in the openspec proposal;
 * upgrade path is porting herdr's actual key-name table if a real mismatch
 * is reported.
 */
export function normalizePrefixDisplay(raw: string): string {
  return raw
    .split("+")
    .map((segment) => segment.trim())
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1).toLowerCase())
    .join("+");
}

interface RawHerdrConfig {
  keys?: { prefix?: unknown };
}

/**
 * Reads `<config_dir>/config.toml`, extracts `[keys].prefix`, and returns
 * the normalized display prefix plus how it was resolved. Never throws —
 * a missing file, missing `[keys]`/`prefix`, or unparseable TOML all fall
 * back to herdr's own default (source `"default"`), matching what a fresh
 * herdr install with no keybind customization would report.
 */
export function resolveHostKeybinds(configDir: string): HostKeybinds {
  let raw: string;
  try {
    raw = readFileSync(join(configDir, "config.toml"), "utf8");
  } catch {
    return { prefix: normalizePrefixDisplay(DEFAULT_HERDR_PREFIX_RAW), source: "default" };
  }

  let parsed: RawHerdrConfig;
  try {
    parsed = parseToml(raw) as RawHerdrConfig;
  } catch {
    return { prefix: normalizePrefixDisplay(DEFAULT_HERDR_PREFIX_RAW), source: "default" };
  }

  const prefix = parsed.keys?.prefix;
  if (typeof prefix !== "string" || !prefix.trim()) {
    return { prefix: normalizePrefixDisplay(DEFAULT_HERDR_PREFIX_RAW), source: "default" };
  }

  return { prefix: normalizePrefixDisplay(prefix), source: "config-file" };
}
