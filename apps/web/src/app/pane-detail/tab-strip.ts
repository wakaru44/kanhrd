import { Component, ElementRef, computed, effect, input, viewChildren } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { Pane, TabSummary } from '@kanhrd/schema';
import { COPY, fill } from '../shared/copy';

/** One tab, plus the pane selecting it opens and how many cards it holds. */
export interface TabEntry {
  readonly tab: TabSummary;
  /** The pane a click lands on — the tab's first card in store order. */
  readonly pane: Pane;
  readonly count: number;
  readonly current: boolean;
}

/**
 * Resolve the strip's entries: every tab of `workspaceId` on `host`, each
 * paired with the pane selecting it opens.
 *
 * Pure, and exported, because it is the answer to "which tab is next" that
 * `prefix + n` / `prefix + p` share with this strip — the same
 * one-implementation rule `nextSiblingCard` already lives under. A tab with
 * no pane in the store is dropped rather than rendered as a dead entry: the
 * strip navigates by URL, and there is no URL to a tab without a pane.
 */
export function tabEntries(
  tabs: Iterable<TabSummary>,
  panes: Iterable<Pane>,
  host: string,
  workspaceId: string,
  currentTabId: string
): readonly TabEntry[] {
  const byTab = new Map<string, Pane[]>();
  for (const pane of panes) {
    if (pane.host !== host) {
      continue;
    }
    const list = byTab.get(pane.tab.id);
    if (list) {
      list.push(pane);
    } else {
      byTab.set(pane.tab.id, [pane]);
    }
  }
  const entries: TabEntry[] = [];
  for (const tab of tabs) {
    if (tab.host !== host || tab.workspace.id !== workspaceId) {
      continue;
    }
    const cards = byTab.get(tab.id);
    if (!cards || cards.length === 0) {
      continue;
    }
    entries.push({
      tab,
      pane: cards[0],
      count: cards.length,
      current: tab.id === currentTabId,
    });
  }
  return entries;
}

/** The entry `direction` steps to from the current one, wrapping. `null` in a workspace of one tab. */
export function stepTab(entries: readonly TabEntry[], direction: 1 | -1): TabEntry | null {
  if (entries.length < 2) {
    return null;
  }
  const index = entries.findIndex((entry) => entry.current);
  if (index < 0) {
    return null;
  }
  const next = (((index + direction) % entries.length) + entries.length) % entries.length;
  return entries[next];
}

/**
 * The tab level of the pane-detail bar — herdr's own level, in herdr's own
 * word, sitting where herdr's TUI puts it: a row of the workspace's tabs
 * above the panes of the selected one.
 *
 * Before this existed the bar drew one level in the other's slot: the card
 * switcher (panes of THIS tab) sat alone under the title, so a terminal had
 * no route to another tab at all, and `prefix + n` moved the board's scope
 * behind your back instead.
 *
 * Presentational, and modelled on `card-switcher.ts` deliberately — the two
 * strips are the same widget at two levels, so they share the keyboard
 * contract (roving tabindex, arrows, Home/End) rather than growing two
 * subtly different ones. Selection is not owned here either: each entry is
 * a link, and the route is the selection.
 */
@Component({
  selector: 'app-tab-strip',
  imports: [RouterLink],
  templateUrl: './tab-strip.html',
  styleUrl: './tab-strip.scss',
})
export class TabStrip {
  /** Every tab of this workspace that has a pane to open, in store order. */
  readonly entries = input.required<readonly TabEntry[]>();

  protected readonly stripLabel = COPY.nav.tabStrip;

  private readonly items = viewChildren<ElementRef<HTMLAnchorElement>>('entry');

  protected readonly currentIndex = computed(() =>
    this.entries().findIndex((entry) => entry.current)
  );

  /** Never `-1`: the strip must stay reachable by Tab even mid-navigation. */
  protected readonly rovingIndex = computed(() => Math.max(this.currentIndex(), 0));

  constructor() {
    effect(() => {
      const item = this.items()[this.rovingIndex()]?.nativeElement;
      item?.scrollIntoView({
        behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
          ? 'auto'
          : 'smooth',
        inline: 'nearest',
        block: 'nearest',
      });
    });
  }

  /** `{name} — {count} cards`: the count is in the accessible name, not only in the eye. */
  protected itemLabel(entry: TabEntry): string {
    return fill(COPY.nav.tabStripItem, { name: entry.tab.name, count: String(entry.count) });
  }

  /**
   * Arrows / `Home` / `End` move focus ONLY — a keyboard user must not load
   * three tabs on the way to the fourth. `Enter` is the anchor's own
   * default; `Space` is forwarded to the same click.
   */
  protected onKeydown(event: KeyboardEvent): void {
    const items = this.items();
    if (items.length === 0) {
      return;
    }
    const current = items.findIndex((ref) => ref.nativeElement === document.activeElement);

    if (event.key === ' ' || event.key === 'Spacebar') {
      event.preventDefault();
      items[current < 0 ? this.rovingIndex() : current]?.nativeElement.click();
      return;
    }

    let next: number | null = null;
    if (event.key === 'ArrowRight') {
      next = (current + 1) % items.length;
    } else if (event.key === 'ArrowLeft') {
      next = (current <= 0 ? items.length : current) - 1;
    } else if (event.key === 'Home') {
      next = 0;
    } else if (event.key === 'End') {
      next = items.length - 1;
    }
    if (next !== null) {
      event.preventDefault();
      items[next].nativeElement.focus();
    }
  }
}
