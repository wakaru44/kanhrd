import { isLucideIconComponent } from '@lucide/angular';
import { KANHRD_ICONS } from './icons';
import * as icons from './icons';

describe('shared/icons', () => {
  it('exports exactly the eighteen icons the design system pins', () => {
    expect(KANHRD_ICONS.length).toBe(18);
    expect(new Set(KANHRD_ICONS).size).toBe(18);
  });

  it('resolves every export to a real @lucide/angular icon component', () => {
    for (const icon of KANHRD_ICONS) {
      expect(isLucideIconComponent(icon))
        .withContext(`${icon.name} is not a lucide icon component`)
        .toBe(true);
      expect(icon.icon.node.length).withContext(`${icon.name} has no svg nodes`).toBeGreaterThan(0);
    }
  });

  it('re-exports each icon under a name that exists in the installed package', () => {
    const named = Object.entries(icons).filter(([key]) => key.startsWith('Lucide'));
    expect(named.length).toBe(18);
    for (const [key, value] of named) {
      expect(isLucideIconComponent(value)).withContext(`${key} does not resolve`).toBe(true);
    }
  });

  it('uses the current names, not the deprecated or aliased ones', () => {
    // `MoreHorizontal` is the alias of `Ellipsis`; `TriangleAlert` supersedes
    // `AlertTriangle`. Both must be the same glyph as their canonical name.
    expect(icons.LucideMoreHorizontal.icon.name).toBe('ellipsis');
    expect(icons.LucideTriangleAlert.icon.name).toBe('triangle-alert');
  });
});
