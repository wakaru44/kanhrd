import type { Type } from '@angular/core';
import { App } from '../app';
import { Board } from '../board/board';
import { Card } from '../board/card';
import { Column } from '../board/column';
import { EmptyState } from '../board/empty-state';
import { FilterBar } from '../board/filter-bar';
import { StatusSwitcher } from '../board/status-switcher';
import { NotFound } from '../not-found/not-found';
import { CardSwitcher } from '../pane-detail/card-switcher';
import { PaneDetail } from '../pane-detail/pane-detail';
import { Rail } from '../rail/rail';
import { Settings } from '../settings/settings';
import { ConfirmModal } from './confirm-modal';
import { KeyboardHelpOverlay } from './keyboard-help-overlay';
import { RenameModal } from './rename-modal';
import { ToastHost } from './toast-host';

/**
 * The design-token and icon-set gates, asserted against what the Angular
 * compiler actually emitted rather than against the source text.
 *
 * `tools/lint-scss-tokens.sh` (pre-commit, `make lint`) is the file-level
 * gate and is the only thing that can see the three GLOBAL stylesheets
 * (`styles.scss`, `shared/tokens.scss`, `shared/typography.scss`). This
 * spec is the complementary runtime gate over COMPONENT styles and
 * templates: a component's compiled `styles` array and template function
 * are read off its `ɵcmp` definition, so a raw hex or an entity glyph
 * fails the test suite too, not only the commit hook.
 *
 * Component styles are the whole population here by construction: the
 * token files are `@use`d by `src/styles.scss` and never reach a
 * component's own style array, so there is no tokens.scss exemption to
 * carve out.
 */

/** Same literal shape the shell gate matches (tools/lint-scss-tokens.sh). */
const HEX = /#[0-9a-fA-F]{3,8}\b/g;

/**
 * The entity glyphs the spec names, plus the near neighbours a contributor
 * reaches for when an icon import feels like too much ceremony. Every one
 * of these has a `@lucide/angular` component in `shared/icons.ts`.
 *
 * Typographic characters are NOT in this set: `…` (loading copy), `—`
 * (copy punctuation) and `·` are text, not chrome.
 */
const ENTITY_GLYPHS = [
  '✎',
  '✏',
  '×',
  '✕',
  '✖',
  '⨯',
  '✓',
  '✔',
  '✗',
  '☰',
  '⚙',
  '☀',
  '☾',
  '☽',
  '🌙',
  '⟶',
  '→',
  '←',
  '↑',
  '↓',
  '▸',
  '▾',
  '▴',
  '◂',
  '›',
  '‹',
  '»',
  '«',
  '●',
  '○',
  '◦',
  '★',
  '☆',
  '⋯',
  '⌄',
  '⚠',
  'ℹ',
  '＋',
  '➕',
  '❌',
] as const;

interface CompiledComponent {
  readonly styles?: readonly string[];
  readonly template?: unknown;
  /** Attribute/class/text constants the template function indexes into. */
  readonly consts?: unknown;
}

const COMPONENTS: readonly Type<unknown>[] = [
  App,
  Board,
  Card,
  Column,
  EmptyState,
  FilterBar,
  StatusSwitcher,
  NotFound,
  CardSwitcher,
  PaneDetail,
  Rail,
  Settings,
  ConfirmModal,
  RenameModal,
  KeyboardHelpOverlay,
  ToastHost,
];

function compiled(component: Type<unknown>): CompiledComponent {
  const def = (component as unknown as { ɵcmp?: CompiledComponent }).ɵcmp;
  if (!def) {
    throw new Error(`${component.name} has no ɵcmp — is it an Angular component?`);
  }
  return def;
}

/**
 * Everything the compiler emitted for a template, as one searchable string:
 * the instruction function's source plus its `consts` table. Static text
 * nodes live in the function body, while class names, attribute values and
 * some text live in `consts` — a glyph can be in either, so both are
 * scanned. `\uXXXX` escapes are resolved so an escaped glyph cannot hide.
 */
function templateSource(component: Type<unknown>): string {
  const def = compiled(component);
  const consts = typeof def.consts === 'function' ? (def.consts as () => unknown)() : def.consts;
  const source = String(def.template ?? '') + JSON.stringify(consts ?? null);
  return source.replace(/\\u\{?([0-9a-fA-F]{1,6})\}?/g, (_match, code: string) =>
    String.fromCodePoint(Number.parseInt(code, 16))
  );
}

describe('style lint: components carry no raw values', () => {
  it('covers every component that ships a template or a stylesheet', () => {
    expect(COMPONENTS.length).toBe(16);
    for (const component of COMPONENTS) {
      expect(() => compiled(component))
        .withContext(component.name)
        .not.toThrow();
    }
  });

  it('declares no raw hex colour in any component stylesheet', () => {
    const offenders: string[] = [];
    for (const component of COMPONENTS) {
      for (const sheet of compiled(component).styles ?? []) {
        for (const match of sheet.match(HEX) ?? []) {
          offenders.push(`${component.name}: ${match}`);
        }
      }
    }
    expect(offenders)
      .withContext('raw hex belongs in shared/tokens.scss; components read var(--token)')
      .toEqual([]);
  });

  it('actually reads the compiled stylesheets (guards the assertion above)', () => {
    // If `ɵcmp.styles` were ever empty the hex test would pass vacuously.
    const total = COMPONENTS.reduce((sum, c) => sum + (compiled(c).styles?.length ?? 0), 0);
    expect(total).toBeGreaterThanOrEqual(COMPONENTS.length);
    const anySheet = (compiled(Card).styles ?? []).join('');
    expect(anySheet).toContain('--');
  });

  it('renders no HTML entity glyph as UI chrome in any template', () => {
    const offenders: string[] = [];
    for (const component of COMPONENTS) {
      const source = templateSource(component);
      for (const glyph of ENTITY_GLYPHS) {
        if (source.includes(glyph)) {
          offenders.push(`${component.name}: ${glyph}`);
        }
      }
    }
    expect(offenders)
      .withContext('use a lucide component from shared/icons.ts, not a literal glyph')
      .toEqual([]);
  });

  it('actually reads the compiled templates (guards the assertion above)', () => {
    // The glyph scan is only meaningful if the template text is visible here.
    expect(templateSource(ConfirmModal)).toContain('modal-title');
    expect(templateSource(Card)).toContain('status-dot');
  });

  /**
   * The board's chrome used to inline its own strings — "Create",
   * "New pane", "New tab", "New workspace", "Clear scope": Title Case,
   * herdr's vocabulary, and invisible to `copy.ts`. An interpolated
   * `{{ copy.* }}` leaves no literal behind, so their absence here is the
   * regression guard.
   */
  it('renders no inlined chrome literal in the board template', () => {
    const source = templateSource(Board);
    for (const literal of ['Create', 'New pane', 'New tab', 'New workspace', 'Clear scope']) {
      // Quoted, so the compiler's own instruction names (`conditionalCreate`)
      // cannot masquerade as an inlined "Create".
      for (const quoted of [`'${literal}'`, `"${literal}"`]) {
        expect(source).withContext(`${quoted} belongs in copy.ts`).not.toContain(quoted);
      }
    }
  });

  it('would catch a literal that a template really did inline', () => {
    // The guard above is only worth having if a quoted static string is
    // visible in the compiled output at all. `app-filter-bar` is a static
    // element name in the same template, quoted the same way.
    expect(templateSource(Board)).toContain("'app-filter-bar'");
  });

  it('catches a glyph that a template did render, so the scan is not vacuous', () => {
    const planted = 'a close control spelled ×';
    expect(ENTITY_GLYPHS.some((glyph) => planted.includes(glyph))).toBeTrue();
  });
});
