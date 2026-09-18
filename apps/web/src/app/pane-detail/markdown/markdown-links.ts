import type { MdLink } from './markdown-model';

/**
 * A literal NUL, built rather than escaped: prettier rewrites a `\u0000`
 * escape into the byte itself, which makes the source a binary file to git.
 */
const NUL = String.fromCharCode(0);

/**
 * Whitespace and C0/DEL controls, removed before a destination is judged.
 * `java\nscript:alert(1)` is a `javascript:` URL to every browser that
 * navigates it, so it has to be a `javascript:` URL to the allowlist too.
 *
 * Written as a code-point filter for the same reason `NUL` is: a character
 * class covering this range cannot be spelled without an escape prettier
 * would turn into the control character.
 */
function stripInert(raw: string): string {
  let out = '';
  for (const char of raw) {
    const code = char.codePointAt(0) ?? 0;
    if (code > 0x20 && code !== 0x7f) {
      out += char;
    }
  }
  return out;
}

/** A leading `scheme:`, per RFC 3986. */
const SCHEME = /^([a-z][a-z0-9+.-]*):/i;

/** The only schemes that become an anchor. Everything else is text. */
const ALLOWED = new Set(['http', 'https', 'mailto']);

/**
 * Resolve a checkout-relative destination against the directory of the file
 * being rendered, GitHub's way: a leading `/` is the checkout root, anything
 * else is relative to `dir`. Returns `null` when the result is not a path in
 * this checkout — a climb past the root, a protocol-relative `//host`, or
 * nothing at all.
 *
 * `?query` and `#fragment` are dropped: the panel opens files, and neither
 * means anything to it.
 */
export function resolveRepoPath(dir: string, raw: string): string | null {
  if (raw.startsWith('//')) {
    return null;
  }
  const cut = raw.replace(/[?#].*$/, '');
  if (cut === '') {
    return null;
  }
  let text = cut;
  try {
    text = decodeURIComponent(cut);
  } catch {
    // A destination that is not valid percent-encoding is used verbatim;
    // the bridge is the authority on whether it names a file.
  }
  if (text.includes(NUL)) {
    return null;
  }
  const base = text.startsWith('/') ? [] : dir.split('/').filter((part) => part !== '');
  const parts = [...base];
  for (const segment of text.split('/')) {
    if (segment === '' || segment === '.') {
      continue;
    }
    if (segment === '..') {
      if (parts.length === 0) {
        return null; // out of the checkout
      }
      parts.pop();
      continue;
    }
    parts.push(segment);
  }
  return parts.length === 0 ? null : parts.join('/');
}

/**
 * What a markdown destination is allowed to be. `null` means nothing: the
 * caller renders the link's text as inert text with the destination beside
 * it, because a link that silently does nothing is worse than one that says
 * it was refused.
 */
export function classifyLink(raw: string, dir: string): MdLink | null {
  const probe = stripInert(raw);
  if (probe === '') {
    return null;
  }
  const scheme = SCHEME.exec(probe);
  if (scheme) {
    const name = scheme[1].toLowerCase();
    if (!ALLOWED.has(name)) {
      return null;
    }
    return name === 'mailto' ? { to: 'mail', href: probe } : { to: 'external', href: probe };
  }
  // An in-document anchor has nowhere to go: the rendered view emits no
  // heading ids, so it is refused rather than rendered as a dead anchor.
  if (probe.startsWith('#')) {
    return null;
  }
  const path = resolveRepoPath(dir, probe);
  return path === null ? null : { to: 'path', path };
}

/** The directory part of a checkout path — `''` for a file at the root. */
export function dirOf(path: string | null): string {
  if (!path) {
    return '';
  }
  const cut = path.lastIndexOf('/');
  return cut === -1 ? '' : path.slice(0, cut);
}
