import type { Pane } from "@kanhrd/schema";

/** How many pane-id characters stand in for a pane with no name at all. */
const ID_PREFIX_LENGTH = 8;

/**
 * The one title-precedence rule for a pane, shared by every surface that
 * names a card: the board card, and (lane L-TERMINAL-TOP-BAR) the detail
 * route's switcher entries. Kept here rather than in a component so the two
 * can never disagree about what a card is called.
 *
 * `label ?? display_agent ?? agent ?? title ?? pane id prefix`, where
 * `display_agent ?? agent` is already collapsed into `Pane.agent.name` by
 * the bridge's projection.
 *
 * - `label` leads because it is the only value the operator authored
 *   themselves (herdr's `pane.rename`).
 * - `title` sits BELOW agent identity deliberately: it is herdr's
 *   display-only metadata slot, written through `pane.report_metadata` with
 *   an optional TTL of up to 24h, and a card title that can silently expire
 *   must not outrank a stable agent identity.
 * - The id prefix is a last resort and is the only branch a caller should
 *   render in `--font-mono`; {@link paneTitleIsIdPrefix} says when that is.
 */
export function paneTitle(pane: Pane): string {
  return pane.label ?? pane.agent?.name ?? pane.title ?? pane.id.slice(0, ID_PREFIX_LENGTH);
}

/** True when {@link paneTitle} fell all the way through to the pane id. */
export function paneTitleIsIdPrefix(pane: Pane): boolean {
  return pane.label === undefined && pane.agent === undefined && pane.title === undefined;
}

/**
 * The agent identity to show BESIDE the title, or `null` when it would just
 * repeat it. Non-null only when an operator-authored `label` took the title
 * and an agent name would otherwise have been lost.
 */
export function paneSecondaryIdentity(pane: Pane): string | null {
  if (pane.label === undefined) return null;
  return pane.agent?.name ?? null;
}
