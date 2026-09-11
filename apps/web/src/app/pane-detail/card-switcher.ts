import {
  Component,
  ElementRef,
  computed,
  effect,
  input,
  output,
  viewChildren,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import type { Pane } from '@kanhrd/schema';
import { COPY, fill } from '../shared/copy';
import { LucideGalleryHorizontal } from '../shared/icons';
import { paneTitle } from '../util/pane-title';

/** Reduced motion gets an instant jump; everything else glides. */
function scrollBehavior(): ScrollBehavior {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
}

/**
 * The card switcher on the pane-detail top bar: the cards sharing this
 * tab, the current one included, as a strip of links to their own detail
 * routes (`docs/UX-GUIDELINES.md` § URL is state — an entry navigates, it
 * never swaps the terminal's contents behind a stable URL).
 *
 * Presentational, modelled on `board/status-switcher.ts`: siblings and the
 * current pane id come in, and the only thing that goes out is `escaped`,
 * because returning focus to the terminal is the terminal owner's job, not
 * the strip's. Selection is not owned here either — the route is the
 * selection.
 *
 * It renders at every width, phone included (maintainer decision D1,
 * 2026-09-10): it is a navigator between routes, showing one terminal at a
 * time, not the multi-pane or split view `docs/UX-GUIDELINES.md` rules
 * out. The caller renders it only when the tab holds more than one card.
 *
 * Nothing global is registered. Once the strip has focus the terminal does
 * not, so the arrows, `Home`/`End`, `Enter`/`Space` and `Escape` below are
 * ordinary focused-widget keys and cost the pane nothing.
 */
@Component({
  selector: 'app-card-switcher',
  imports: [RouterLink, LucideGalleryHorizontal],
  templateUrl: './card-switcher.html',
  styleUrl: './card-switcher.scss',
})
export class CardSwitcher {
  /** Every card in this tab, in store order, the current one included. */
  readonly siblings = input.required<readonly Pane[]>();
  /** Pane id of the card the route is on. */
  readonly currentId = input.required<string>();

  /** `Escape` on the strip: the caller puts focus back in the terminal. */
  readonly escaped = output<void>();

  protected readonly switcherLabel = COPY.nav.cardSwitcher;

  private readonly entries = viewChildren<ElementRef<HTMLAnchorElement>>('entry');

  /** `-1` when the route's pane is not (yet) in the list the caller passed. */
  protected readonly currentIndex = computed(() =>
    this.siblings().findIndex((pane) => pane.id === this.currentId())
  );

  /** Which entry holds `tabindex="0"` — the roving one. Never `-1`, or the strip would be unreachable by Tab. */
  protected readonly rovingIndex = computed(() => Math.max(this.currentIndex(), 0));

  constructor() {
    effect(() => {
      const entry = this.entries()[this.rovingIndex()]?.nativeElement;
      entry?.scrollIntoView({ behavior: scrollBehavior(), inline: 'nearest', block: 'nearest' });
    });
  }

  /** The display name, from the one precedence helper every card-naming surface shares. */
  protected name(pane: Pane): string {
    return paneTitle(pane);
  }

  /** `{name} — {status}`: the accessible name carries the status word, so the dot's colour is never the only carrier. */
  protected itemLabel(pane: Pane): string {
    const key = pane.agent_status;
    return fill(COPY.nav.cardSwitcherItem, {
      name: paneTitle(pane),
      status:
        key in COPY.status ? COPY.status[key as keyof typeof COPY.status] : COPY.status.unknown,
    });
  }

  /** Moves focus to the current entry — what `prefix + i` / `Ctrl+Alt+I` land on. */
  focusCurrent(): void {
    this.entries()[this.rovingIndex()]?.nativeElement.focus();
  }

  /**
   * Arrows / `Home` / `End` move focus ONLY: a keyboard user must not load
   * four panes on the way to the fifth. `Enter` is the anchor's own
   * default and is left alone; `Space` is not, so it is forwarded to the
   * same click. `Escape` is scoped to this strip and closes no overlay
   * elsewhere, which is why it stops propagation.
   */
  protected onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      this.escaped.emit();
      return;
    }

    const entries = this.entries();
    if (entries.length === 0) {
      return;
    }
    const current = entries.findIndex((ref) => ref.nativeElement === document.activeElement);

    if (event.key === ' ' || event.key === 'Spacebar') {
      event.preventDefault();
      entries[current < 0 ? this.rovingIndex() : current]?.nativeElement.click();
      return;
    }

    let next: number | null = null;
    if (event.key === 'ArrowRight') {
      next = (current + 1) % entries.length;
    } else if (event.key === 'ArrowLeft') {
      next = (current <= 0 ? entries.length : current) - 1;
    } else if (event.key === 'Home') {
      next = 0;
    } else if (event.key === 'End') {
      next = entries.length - 1;
    }
    if (next !== null) {
      event.preventDefault();
      entries[next].nativeElement.focus();
    }
  }
}
