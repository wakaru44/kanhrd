import { homedir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { expandHome, loadConfig } from "./config.js";

describe("expandHome", () => {
  it("expands a leading ~/ to the home directory", () => {
    expect(expandHome("~/.config/herdr/herdr.sock")).toBe(
      join(homedir(), ".config/herdr/herdr.sock"),
    );
  });

  it("expands a bare ~ to the home directory", () => {
    expect(expandHome("~")).toBe(homedir());
  });

  it("leaves absolute paths untouched", () => {
    expect(expandHome("/run/user/1000/herdr.sock")).toBe("/run/user/1000/herdr.sock");
  });
});

describe("loadConfig", () => {
  it("falls back to built-in defaults when no config file is present", () => {
    const config = loadConfig({ configPath: "/nonexistent/kanhrd.config.yaml" });

    expect(config.bind).toBe("127.0.0.1");
    expect(config.port).toBe(5173);
    expect(config.spaDir).toBe("../../web/dist/web/browser");
    expect(config.hosts).toEqual([
      { name: "local", socket: expandHome("~/.config/herdr/herdr.sock") },
    ]);
  });

  it("applies CLI overrides on top of defaults", () => {
    const config = loadConfig({
      configPath: "/nonexistent/kanhrd.config.yaml",
      port: 9999,
      spaDir: "/tmp/spa",
    });

    expect(config.port).toBe(9999);
    expect(config.spaDir).toBe("/tmp/spa");
    expect(config.bind).toBe("127.0.0.1");
  });

  it("refuses a non-loopback bind without --i-know-what-im-doing", () => {
    expect(() =>
      loadConfig({ configPath: "/nonexistent/kanhrd.config.yaml", bind: "0.0.0.0" }),
    ).toThrow(/non-loopback/);
  });

  it("allows a non-loopback bind when --i-know-what-im-doing is set", () => {
    const config = loadConfig({
      configPath: "/nonexistent/kanhrd.config.yaml",
      bind: "0.0.0.0",
      allowNonLoopback: true,
    });
    expect(config.bind).toBe("0.0.0.0");
  });
});
