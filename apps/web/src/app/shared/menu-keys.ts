/**
 * The overflow-menu keyboard contract, in one place.
 *
 * `card.ts` wrote it first (`aria-haspopup="menu"`, arrow/Home/End
 * navigation, Escape dismissing and returning focus to the trigger); the
 * parked column header needs exactly the same behaviour, so it lifts this
 * rather than growing a second, subtly different implementation.
 *
 * Radio items count as menu items: a parked column's exit rules are
 * `role="menuitemradio"` and must be reachable by the same arrows as the
 * plain items above and below them.
 */
const MENU_ITEM_SELECTOR = '[role="menuitem"], [role="menuitemradio"]';

export function menuItems(root: HTMLElement): HTMLButtonElement[] {
  return Array.from(root.querySelectorAll<HTMLButtonElement>(MENU_ITEM_SELECTOR));
}

/**
 * Arrow / Home / End move within `menu`; Escape dismisses it through
 * `close`, which is what puts focus back on the trigger. Returns nothing:
 * every effect is on the DOM or on the caller's own close handler.
 */
export function handleMenuKeydown(
  event: KeyboardEvent,
  menu: HTMLElement | null,
  close: () => void
): void {
  if (!menu) {
    return;
  }
  if (event.key === 'Escape') {
    event.preventDefault();
    event.stopPropagation();
    close();
    return;
  }
  const items = menuItems(menu);
  if (items.length === 0) {
    return;
  }
  const current = items.indexOf(document.activeElement as HTMLButtonElement);
  let next: number | null = null;
  if (event.key === 'ArrowDown') {
    next = (current + 1) % items.length;
  } else if (event.key === 'ArrowUp') {
    next = (current <= 0 ? items.length : current) - 1;
  } else if (event.key === 'Home') {
    next = 0;
  } else if (event.key === 'End') {
    next = items.length - 1;
  }
  if (next !== null) {
    event.preventDefault();
    items[next].focus();
  }
}
