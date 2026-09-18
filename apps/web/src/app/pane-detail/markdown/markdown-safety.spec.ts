/**
 * The property the rendered view must never lose.
 *
 * The easy way to render markdown is `remark-rehype` to an HTML string and
 * `[innerHTML]` with a sanitizer over it. That trades a property we HAVE —
 * there is no markup path at all — for one we would have to defend forever,
 * on files an agent wrote minutes ago in a checkout nobody reviewed.
 *
 * This scans the shipped sources for the ways back to that path. Karma
 * serves `src/**` as test assets (`angular.json`, test `assets`), the same
 * mechanism `labs/labs-boundary.spec.ts` uses.
 */

const SOURCES = '/__sources__/';

/** Every API that would put file content into the DOM as markup. */
const FORBIDDEN = [
  'innerHTML',
  'outerHTML',
  'insertAdjacentHTML',
  'bypassSecurityTrustHtml',
  'bypassSecurityTrustUrl',
  'bypassSecurityTrustResourceUrl',
  'bypassSecurityTrustScript',
  'bypassSecurityTrustStyle',
  'DomSanitizer',
  'remark-rehype',
  'rehype',
];

/** The rendered view: the pipeline, the model, the renderer, the template. */
const GUARDED = [
  'app/pane-detail/markdown/markdown-pipeline.ts',
  'app/pane-detail/markdown/markdown-normalize.ts',
  'app/pane-detail/markdown/markdown-model.ts',
  'app/pane-detail/markdown/markdown-links.ts',
  'app/pane-detail/markdown/markdown-renderers.ts',
  'app/pane-detail/markdown/markdown-view.ts',
  'app/pane-detail/markdown/markdown-view.html',
  'app/pane-detail/file-view.ts',
  'app/pane-detail/file-view.html',
];

async function fetchSource(path: string): Promise<string | null> {
  const response = await fetch(SOURCES + path);
  return response.ok ? response.text() : null;
}

/**
 * Comments out. These files EXPLAIN what they refuse to do, and naming the
 * refused API in prose is not doing it. A `//` inside a string literal takes
 * the rest of that line with it, which can only lose a match on a line that
 * holds a URL — none of the names below ever appear in one.
 */
export function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/\/\/.*$/gm, ' ');
}

describe('the rendered markdown view has no markup path', () => {
  let sources: Map<string, string>;

  beforeAll(async () => {
    sources = new Map();
    for (const path of GUARDED) {
      const source = await fetchSource(path);
      if (source !== null) {
        sources.set(path, stripComments(source));
      }
    }
  });

  it('served every guarded source (guards the assertion below)', () => {
    expect([...sources.keys()].sort()).toEqual([...GUARDED].sort());
  });

  it('names none of the APIs that would insert markup from a file', () => {
    const found: string[] = [];
    for (const [path, source] of sources) {
      for (const api of FORBIDDEN) {
        if (source.includes(api)) {
          found.push(`${path}: ${api}`);
        }
      }
    }
    expect(found)
      .withContext('the rendered view parses to data and walks it with templates')
      .toEqual([]);
  });

  it('would catch a planted one (guards the matcher)', () => {
    const planted = stripComments(`<div [innerHTML]="rendered()"></div>`);
    expect(FORBIDDEN.some((api) => planted.includes(api))).toBeTrue();
  });

  it('does not count a name that only appears in a comment', () => {
    const prose = stripComments(
      '/** never innerHTML */\n// no bypassSecurityTrustHtml here\nconst a = 1;'
    );
    expect(FORBIDDEN.some((api) => prose.includes(api))).toBeFalse();
  });

  it('kept real code while stripping comments (guards the stripper)', () => {
    expect(stripComments('const a = 1; // innerHTML')).toContain('const a = 1;');
  });
});
