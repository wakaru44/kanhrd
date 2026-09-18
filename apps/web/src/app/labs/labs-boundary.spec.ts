/**
 * The dependency arrow points into labs only (openspec add-labs-surface).
 *
 * A lab may import any product code. Product code may never import from
 * `labs/`, except the route table's lazy `loadComponent` — the one edge
 * that keeps a lab reachable without putting it in the initial bundle.
 *
 * Karma runs in a browser, so the sources are served to it as test assets
 * (`angular.json`, test `assets`: `src/**\/*.ts` at `/__sources__/`). The
 * scan starts at `main.ts` and follows every relative import — static,
 * re-export, side-effect and dynamic — through the product graph, never
 * into `labs/`. What `main.ts` cannot reach cannot reach the bundle either.
 */

const SOURCES = '/__sources__/';

export type ImportKind = 'static' | 'dynamic';

export interface ImportEdge {
  readonly specifier: string;
  readonly kind: ImportKind;
}

/** Every module specifier a TypeScript source names, with how it is imported. */
export function extractImports(source: string): ImportEdge[] {
  const edges: ImportEdge[] = [];
  const staticFrom = /\b(?:import|export)\b[^'"`;]*?\bfrom\s*['"]([^'"]+)['"]/g;
  const sideEffect = /\bimport\s*['"]([^'"]+)['"]/g;
  const dynamic = /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  for (const m of source.matchAll(staticFrom)) edges.push({ specifier: m[1], kind: 'static' });
  for (const m of source.matchAll(sideEffect)) edges.push({ specifier: m[1], kind: 'static' });
  for (const m of source.matchAll(dynamic)) edges.push({ specifier: m[1], kind: 'dynamic' });
  return edges;
}

/** `dir/a.ts` + `../b` → `b`. Paths are relative to `src/`, POSIX. */
export function resolveRelative(fromFile: string, specifier: string): string {
  const parts = fromFile.split('/').slice(0, -1);
  for (const segment of specifier.split('/')) {
    if (segment === '..') parts.pop();
    else if (segment !== '.' && segment !== '') parts.push(segment);
  }
  return parts.join('/');
}

export function isLabPath(path: string): boolean {
  return path === 'app/labs' || path.startsWith('app/labs/');
}

/** The single sanctioned product → lab edge. */
export function isAllowedLabEdge(fromFile: string, edge: ImportEdge): boolean {
  return fromFile === 'app/app.routes.ts' && edge.kind === 'dynamic';
}

async function fetchSource(path: string): Promise<string | null> {
  const response = await fetch(SOURCES + path);
  return response.ok ? response.text() : null;
}

async function resolveModule(base: string): Promise<{ path: string; source: string } | null> {
  const candidates = base.endsWith('.ts') ? [base] : [`${base}.ts`, `${base}/index.ts`];
  for (const path of candidates) {
    const source = await fetchSource(path);
    if (source !== null) return { path, source };
  }
  return null;
}

interface Scan {
  readonly visited: ReadonlySet<string>;
  readonly violations: readonly string[];
  readonly allowedEdges: readonly string[];
  readonly unresolved: readonly string[];
}

async function scanProductGraph(entry: string): Promise<Scan> {
  const visited = new Set<string>();
  const violations: string[] = [];
  const allowedEdges: string[] = [];
  const unresolved: string[] = [];
  const queue = [entry];

  while (queue.length > 0) {
    const base = queue.shift()!;
    const module = await resolveModule(base);
    if (!module) {
      unresolved.push(base);
      continue;
    }
    if (visited.has(module.path)) continue;
    visited.add(module.path);

    for (const edge of extractImports(module.source)) {
      if (!edge.specifier.startsWith('.')) continue;
      const target = resolveRelative(module.path, edge.specifier);
      if (isLabPath(target)) {
        const line = `${module.path} -> ${edge.specifier} (${edge.kind})`;
        (isAllowedLabEdge(module.path, edge) ? allowedEdges : violations).push(line);
        continue;
      }
      queue.push(target);
    }
  }
  return { visited, violations, allowedEdges, unresolved };
}

describe('labs boundary: product code never imports from labs/', () => {
  let scan: Scan;

  beforeAll(async () => {
    scan = await scanProductGraph('main');
  });

  it('finds no product module importing from labs/', () => {
    expect(scan.violations)
      .withContext('product code may not import labs/ — only app.routes.ts loadComponent may')
      .toEqual([]);
  });

  it('actually walked the product graph (guards the assertion above)', () => {
    expect(scan.visited.size).toBeGreaterThan(40);
    expect(scan.visited).toContain('app/app.routes.ts');
    expect(scan.visited).toContain('app/pane-detail/pane-detail.ts');
    expect(scan.unresolved)
      .withContext('every relative import resolved to a served source')
      .toEqual([]);
  });

  it('saw the route table reach a lab lazily, so the exception is exercised', () => {
    expect(scan.allowedEdges.length).toBeGreaterThan(0);
    expect(scan.allowedEdges.every((line) => line.startsWith('app/app.routes.ts'))).toBeTrue();
  });

  it('never followed an edge into labs/', () => {
    expect([...scan.visited].some(isLabPath)).toBeFalse();
  });

  describe('would catch a planted violation', () => {
    it('flags a static import of a lab from a product file', () => {
      const planted = `import { FileExplorerMock1 } from '../labs/file-explorer/mock1/mock1';`;
      const [edge] = extractImports(planted);
      const from = 'app/board/board.ts';
      expect(isLabPath(resolveRelative(from, edge.specifier))).toBeTrue();
      expect(isAllowedLabEdge(from, edge)).toBeFalse();
    });

    it('flags a re-export and a side-effect import', () => {
      const planted = `export * from './labs/lab-frame';\nimport './labs/file-explorer/mock1/fixture';`;
      const edges = extractImports(planted);
      expect(edges.length).toBe(2);
      for (const edge of edges) {
        expect(isLabPath(resolveRelative('app/app.ts', edge.specifier))).toBeTrue();
        expect(isAllowedLabEdge('app/app.ts', edge)).toBeFalse();
      }
    });

    it('flags a static import of a lab even from the route table', () => {
      const [edge] = extractImports(`import { LabFrame } from './labs/lab-frame';`);
      expect(isAllowedLabEdge('app/app.routes.ts', edge)).toBeFalse();
    });

    it('flags a dynamic import of a lab from anywhere but the route table', () => {
      const [edge] = extractImports(`const m = await import('../labs/lab-frame');`);
      expect(edge.kind).toBe('dynamic');
      expect(isAllowedLabEdge('app/board/board.ts', edge)).toBeFalse();
    });

    it('does not mistake a sibling directory named like labs for labs/', () => {
      expect(isLabPath(resolveRelative('app/app.ts', './labsy/thing'))).toBeFalse();
    });
  });
});
