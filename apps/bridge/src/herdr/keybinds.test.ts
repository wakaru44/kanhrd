import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { herdrConfigDir, normalizePrefixDisplay, resolveHostKeybinds } from "./keybinds.js";

/**
 * `resolveHostKeybinds` reads herdr's own `config.toml` directly (herdr has
 * no JSON API or CLI surface for keybinds — see this module's doc). These
 * tests exercise the TOML-parsing/normalization logic against a throwaway
 * temp directory, no live herdr socket involved.
 */
describe("resolveHostKeybinds", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "kanhrd-bridge-keybinds-test-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("reads and normalizes a custom prefix from config.toml", () => {
    writeFileSync(join(dir, "config.toml"), '[keys]\nprefix = "ctrl+b"\n');
    expect(resolveHostKeybinds(dir)).toEqual({ prefix: "Ctrl+B", source: "config-file" });
  });

  it("normalizes a multi-segment prefix like ctrl+space", () => {
    writeFileSync(join(dir, "config.toml"), '[keys]\nprefix = "ctrl+space"\n');
    expect(resolveHostKeybinds(dir)).toEqual({ prefix: "Ctrl+Space", source: "config-file" });
  });

  it("normalizes a bare function-key prefix like f12", () => {
    writeFileSync(join(dir, "config.toml"), '[keys]\nprefix = "f12"\n');
    expect(resolveHostKeybinds(dir)).toEqual({ prefix: "F12", source: "config-file" });
  });

  it("falls back to herdr's default when config.toml doesn't exist", () => {
    expect(resolveHostKeybinds(join(dir, "does-not-exist"))).toEqual({ prefix: "Ctrl+B", source: "default" });
  });

  it("falls back to the default when config.toml has no [keys] section", () => {
    writeFileSync(join(dir, "config.toml"), 'bind = "127.0.0.1"\n');
    expect(resolveHostKeybinds(dir)).toEqual({ prefix: "Ctrl+B", source: "default" });
  });

  it("falls back to the default when [keys] has no prefix field", () => {
    writeFileSync(join(dir, "config.toml"), "[keys]\n");
    expect(resolveHostKeybinds(dir)).toEqual({ prefix: "Ctrl+B", source: "default" });
  });

  it("falls back to the default on malformed TOML", () => {
    writeFileSync(join(dir, "config.toml"), "this is not [ valid toml");
    expect(resolveHostKeybinds(dir)).toEqual({ prefix: "Ctrl+B", source: "default" });
  });
});

describe("normalizePrefixDisplay", () => {
  it("title-cases each +-separated segment", () => {
    expect(normalizePrefixDisplay("ctrl+b")).toBe("Ctrl+B");
    expect(normalizePrefixDisplay("ctrl+shift+p")).toBe("Ctrl+Shift+P");
    expect(normalizePrefixDisplay("esc")).toBe("Esc");
  });
});

describe("herdrConfigDir", () => {
  it("prefers XDG_CONFIG_HOME when set", () => {
    expect(herdrConfigDir({ XDG_CONFIG_HOME: "/xdg" })).toBe(join("/xdg", "herdr"));
  });

  it("falls back to ~/.config/herdr on macOS/Linux when XDG_CONFIG_HOME is unset", () => {
    const resolved = herdrConfigDir({});
    expect(resolved.endsWith(join(".config", "herdr"))).toBe(true);
  });
});
