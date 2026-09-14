import { mkdtempSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { deriveOrigins, expandHome, loadConfig, originKey, parseOrigin } from './config.js';

/** A config file on disk, since `loadConfig` reads YAML rather than taking
 * a parsed object — needed to exercise file-vs-CLI precedence. */
const fixturePath = join(mkdtempSync(join(tmpdir(), 'kanhrd-config-')), 'kanhrd.config.yaml');
writeFileSync(
  fixturePath,
  ['allowed_origins:', '  - https://old.example', 'require_origin: true', ''].join('\n')
);

describe('expandHome', () => {
  it('expands a leading ~/ to the home directory', () => {
    expect(expandHome('~/.config/herdr/herdr.sock')).toBe(
      join(homedir(), '.config/herdr/herdr.sock')
    );
  });

  it('expands a bare ~ to the home directory', () => {
    expect(expandHome('~')).toBe(homedir());
  });

  it('leaves absolute paths untouched', () => {
    expect(expandHome('/run/user/1000/herdr.sock')).toBe('/run/user/1000/herdr.sock');
  });
});

describe('loadConfig', () => {
  it('keeps a host files flag and refuses a non-boolean one', () => {
    const dir = mkdtempSync(join(tmpdir(), 'kanhrd-config-files-'));
    const good = join(dir, 'good.yaml');
    writeFileSync(good, 'hosts:\n  - name: alpaca01\n    socket: /tmp/a.sock\n    files: false\n');
    expect(loadConfig({ configPath: good }).hosts).toEqual([
      { name: 'alpaca01', socket: '/tmp/a.sock', files: false },
    ]);
    const bad = join(dir, 'bad.yaml');
    writeFileSync(bad, 'hosts:\n  - name: alpaca01\n    socket: /tmp/a.sock\n    files: "no"\n');
    expect(() => loadConfig({ configPath: bad })).toThrow(/files must be true or false/);
  });

  it('falls back to built-in defaults when no config file is present', () => {
    const config = loadConfig({ configPath: '/nonexistent/kanhrd.config.yaml' });

    expect(config.bind).toBe('127.0.0.1');
    expect(config.port).toBe(5173);
    expect(config.spaDir).toBe('../../web/dist/web/browser');
    expect(config.hosts).toEqual([
      { name: 'local', socket: expandHome('~/.config/herdr/herdr.sock') },
    ]);
  });

  it('applies CLI overrides on top of defaults', () => {
    const config = loadConfig({
      configPath: '/nonexistent/kanhrd.config.yaml',
      port: 9999,
      spaDir: '/tmp/spa',
    });

    expect(config.port).toBe(9999);
    expect(config.spaDir).toBe('/tmp/spa');
    expect(config.bind).toBe('127.0.0.1');
  });

  it('refuses a non-loopback bind without --i-know-what-im-doing', () => {
    expect(() =>
      loadConfig({ configPath: '/nonexistent/kanhrd.config.yaml', bind: '0.0.0.0' })
    ).toThrow(/non-loopback/);
  });

  it('allows a non-loopback bind when --i-know-what-im-doing is set', () => {
    // A literal address, not the wildcard: a wildcard bind additionally
    // needs an origin it cannot derive (see the allowlist suite below).
    const config = loadConfig({
      configPath: '/nonexistent/kanhrd.config.yaml',
      bind: '100.64.1.2',
      allowNonLoopback: true,
    });
    expect(config.bind).toBe('100.64.1.2');
    expect(config.origins.allowed.has('http://100.64.1.2:5173')).toBe(true);
  });
});

describe('parseOrigin', () => {
  it('normalizes scheme and host case', () => {
    expect(parseOrigin('HTTP://LocalHost:5173')).toEqual({
      scheme: 'http',
      host: 'localhost',
      port: 5173,
    });
  });

  it('fills in the default port per scheme', () => {
    expect(originKey(parseOrigin('http://x.example'))).toBe(
      originKey(parseOrigin('http://x.example:80'))
    );
    expect(originKey(parseOrigin('https://x.example'))).toBe(
      originKey(parseOrigin('https://x.example:443'))
    );
  });

  it('keeps an IPv6 literal bracketed', () => {
    expect(parseOrigin('http://[::1]:5173').host).toBe('[::1]');
  });

  it('distinguishes scheme, host and port', () => {
    const allowed = originKey(parseOrigin('http://localhost:5173'));
    expect(originKey(parseOrigin('https://localhost:5173'))).not.toBe(allowed);
    expect(originKey(parseOrigin('http://localhost:5174'))).not.toBe(allowed);
    expect(originKey(parseOrigin('http://localhost.attacker.example:5173'))).not.toBe(allowed);
  });

  it('does not treat a suffix-confusable host as a match', () => {
    const allowed = originKey(parseOrigin('https://example.com'));
    expect(originKey(parseOrigin('https://example.com.attacker.net'))).not.toBe(allowed);
    expect(originKey(parseOrigin('https://evil-example.com'))).not.toBe(allowed);
  });

  it('rejects entries that are not bare http(s) origins', () => {
    expect(() => parseOrigin('https://kanhrd.example.com/board')).toThrow(/path/);
    expect(() => parseOrigin('https://kanhrd.example.com?a=1')).toThrow(/query|fragment/);
    expect(() => parseOrigin('https://user:pw@kanhrd.example.com')).toThrow(/userinfo/);
    expect(() => parseOrigin('ws://kanhrd.example.com')).toThrow(/http or https/);
    expect(() => parseOrigin('null')).toThrow(/not a valid origin/);
    expect(() => parseOrigin('')).toThrow(/not a valid origin/);
  });
});

describe('deriveOrigins', () => {
  it('derives the three local hosts on both schemes for a loopback bind', () => {
    expect(deriveOrigins('127.0.0.1', 5173)).toEqual([
      'http://127.0.0.1:5173',
      'https://127.0.0.1:5173',
      'http://localhost:5173',
      'https://localhost:5173',
      'http://[::1]:5173',
      'https://[::1]:5173',
    ]);
  });

  it('never derives from a wildcard bind', () => {
    expect(deriveOrigins('0.0.0.0', 5173)).toEqual(deriveOrigins('127.0.0.1', 5173));
    expect(deriveOrigins('::', 5173)).toEqual(deriveOrigins('127.0.0.1', 5173));
  });

  it('derives from a literal non-loopback bind, bracketing IPv6', () => {
    expect(deriveOrigins('100.64.1.2', 5173)).toContain('http://100.64.1.2:5173');
    expect(deriveOrigins('fd7a::1', 5173)).toContain('http://[fd7a::1]:5173');
  });

  it('follows the configured port', () => {
    expect(deriveOrigins('127.0.0.1', 8080)).toContain('http://127.0.0.1:8080');
    expect(deriveOrigins('127.0.0.1', 8080)).not.toContain('http://127.0.0.1:5173');
  });
});

describe('loadConfig origin allowlist', () => {
  const base = { configPath: '/nonexistent/kanhrd.config.yaml' } as const;

  it('derives a working allowlist with no configuration at all', () => {
    const { origins } = loadConfig({ ...base });
    expect(origins.allowed.has('http://127.0.0.1:5173')).toBe(true);
    expect(origins.allowed.has('http://localhost:5173')).toBe(true);
    expect(origins.allowed.has('http://[::1]:5173')).toBe(true);
    expect(origins.configured).toEqual([]);
    expect(origins.requireOrigin).toBe(false);
    expect(origins.allowAny).toBe(false);
  });

  it('adds configured origins on top of the derived ones', () => {
    const { origins } = loadConfig({
      ...base,
      allowedOrigins: ['https://kanhrd.example.com'],
    });
    expect(origins.allowed.has('https://kanhrd.example.com:443')).toBe(true);
    expect(origins.allowed.has('http://127.0.0.1:5173')).toBe(true);
  });

  it('refuses to start on a wildcard bind with an empty allowlist', () => {
    expect(() => loadConfig({ ...base, bind: '0.0.0.0', allowNonLoopback: true })).toThrow(
      /allowed_origins.*--allowed-origin.*--allow-any-origin/s
    );
    expect(() => loadConfig({ ...base, bind: '::', allowNonLoopback: true })).toThrow(/wildcard/);
  });

  it('starts on a wildcard bind once an origin is configured', () => {
    const config = loadConfig({
      ...base,
      bind: '0.0.0.0',
      allowNonLoopback: true,
      allowedOrigins: ['http://127.0.0.1:5173'],
    });
    expect(config.origins.allowed.has('http://127.0.0.1:5173')).toBe(true);
  });

  it('lets --allow-any-origin past the wildcard guard, loudly', () => {
    const config = loadConfig({
      ...base,
      bind: '0.0.0.0',
      allowNonLoopback: true,
      allowAnyOrigin: true,
    });
    expect(config.origins.allowAny).toBe(true);
  });

  it('fails at startup on a malformed allowlist entry, naming it', () => {
    expect(() =>
      loadConfig({ ...base, allowedOrigins: ['https://kanhrd.example.com/board'] })
    ).toThrow(/allowed_origins.*kanhrd\.example\.com\/board/s);
  });

  it('lets a CLI list replace the config file list', () => {
    const config = loadConfig({
      configPath: fixturePath,
      allowedOrigins: ['https://new.example'],
    });
    expect(config.origins.allowed.has('https://new.example:443')).toBe(true);
    expect(config.origins.allowed.has('https://old.example:443')).toBe(false);
  });

  it('reads allowed_origins and require_origin from the config file', () => {
    const config = loadConfig({ configPath: fixturePath });
    expect(config.origins.allowed.has('https://old.example:443')).toBe(true);
    expect(config.origins.requireOrigin).toBe(true);
  });
});
