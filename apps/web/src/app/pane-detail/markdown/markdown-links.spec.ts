import { classifyLink, dirOf, resolveRepoPath } from './markdown-links';

/** Built, not escaped — a `\u0000` in a source makes it a binary file to git. */
const NUL = String.fromCharCode(0);

/**
 * The link allowlist, as pure functions.
 *
 * These are the rules that decide whether text an agent wrote becomes a
 * navigable destination, so they are proven here as arithmetic before they
 * are proven again through the rendered view. A refusal is `null`: the
 * caller renders the text and shows what it refused.
 */
describe('pane-detail/markdown-links', () => {
  describe('classifyLink', () => {
    it('allows http and https, as external', () => {
      expect(classifyLink('https://example.com/a', 'docs')).toEqual({
        to: 'external',
        href: 'https://example.com/a',
      });
      expect(classifyLink('HTTP://example.com', 'docs')).toEqual({
        to: 'external',
        href: 'HTTP://example.com',
      });
    });

    it('allows mailto, as mail', () => {
      expect(classifyLink('mailto:ops@example.com', '')).toEqual({
        to: 'mail',
        href: 'mailto:ops@example.com',
      });
    });

    it('refuses javascript, data, vbscript and file', () => {
      for (const raw of [
        'javascript:alert(1)',
        'JaVaScRiPt:alert(1)',
        'data:text/html;base64,PHNjcmlwdD4=',
        'vbscript:msgbox(1)',
        'file:///etc/passwd',
        'chrome://settings',
      ]) {
        expect(classifyLink(raw, 'docs')).withContext(raw).toBeNull();
      }
    });

    it('refuses a scheme hidden behind whitespace or control characters', () => {
      // Every browser navigates these as `javascript:`, so the allowlist has
      // to read them the same way.
      expect(classifyLink('java\nscript:alert(1)', '')).toBeNull();
      expect(classifyLink('  javascript:alert(1)', '')).toBeNull();
      expect(classifyLink('java\tscript:alert(1)', '')).toBeNull();
      expect(classifyLink(`${NUL}javascript:alert(1)`, '')).toBeNull();
    });

    it('refuses a protocol-relative destination, which is not a path', () => {
      expect(classifyLink('//evil.example/x', 'docs')).toBeNull();
    });

    it('refuses an in-document anchor, because no heading ids are emitted', () => {
      expect(classifyLink('#voice', 'docs')).toBeNull();
    });

    it('refuses an empty destination', () => {
      expect(classifyLink('', 'docs')).toBeNull();
      expect(classifyLink('   ', 'docs')).toBeNull();
    });

    it('reads a destination with no scheme as a path in the checkout', () => {
      expect(classifyLink('DESIGN-SYSTEM.md', 'docs')).toEqual({
        to: 'path',
        path: 'docs/DESIGN-SYSTEM.md',
      });
      expect(classifyLink('../README.md', 'docs/adr')).toEqual({
        to: 'path',
        path: 'docs/README.md',
      });
    });

    it('refuses a path that climbs out of the checkout', () => {
      expect(classifyLink('../../etc/passwd', '')).toBeNull();
      expect(classifyLink('../../../x', 'docs')).toBeNull();
    });
  });

  describe('resolveRepoPath', () => {
    it('treats a leading slash as the checkout root, as forges do', () => {
      expect(resolveRepoPath('docs/adr', '/apps/web/src/main.ts')).toBe('apps/web/src/main.ts');
    });

    it('drops a query and a fragment: the panel opens files', () => {
      expect(resolveRepoPath('docs', 'BRAND.md#voice')).toBe('docs/BRAND.md');
      expect(resolveRepoPath('docs', 'BRAND.md?plain=1')).toBe('docs/BRAND.md');
    });

    it('resolves . and .. and collapses empty segments', () => {
      expect(resolveRepoPath('a/b', './c//d')).toBe('a/b/c/d');
      expect(resolveRepoPath('a/b', '../c')).toBe('a/c');
    });

    it('decodes percent-encoding, and survives a destination that is not valid', () => {
      expect(resolveRepoPath('docs', 'my%20file.md')).toBe('docs/my file.md');
      expect(resolveRepoPath('docs', '100%.md')).toBe('docs/100%.md');
    });

    it('refuses a NUL byte in a path', () => {
      expect(resolveRepoPath('docs', 'a%00b.md')).toBeNull();
    });

    it('answers nothing for a destination that resolves to nothing', () => {
      expect(resolveRepoPath('', '#x')).toBeNull();
      expect(resolveRepoPath('', '.')).toBeNull();
    });
  });

  describe('dirOf', () => {
    it('is the empty string at the checkout root', () => {
      expect(dirOf('README.md')).toBe('');
      expect(dirOf(null)).toBe('');
    });

    it('is everything before the last slash', () => {
      expect(dirOf('docs/adr/0001-x.md')).toBe('docs/adr');
    });
  });
});
