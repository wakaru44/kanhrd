/** How many trailing path segments the card form keeps. */
const TAIL_SEGMENTS = 2;

/**
 * The card form of a checkout path: its last two segments, prefixed `…/`
 * when earlier segments were dropped.
 *
 * Truncation is computed here rather than done in CSS on purpose — eliding
 * the HEAD of a path is not something `text-overflow` can do, and faking it
 * with `direction: rtl` reorders punctuation in a bidi-unsafe way. This is
 * deterministic and unit-testable instead.
 *
 * The path is never otherwise rewritten: no `$HOME` collapsing, no repo
 * inference, no case change. The full path stays reachable on the detail
 * route.
 */
export function pathTail(path: string): string {
  const segments = path.split('/').filter((segment) => segment !== '');
  if (segments.length === 0) return path;

  const tail = segments.slice(-TAIL_SEGMENTS);
  const dropped = segments.length > tail.length;
  // A path that never had a leading slash keeps not having one.
  const lead = dropped ? '…/' : path.startsWith('/') ? '/' : '';
  return `${lead}${tail.join('/')}`;
}
