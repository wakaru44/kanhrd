import { Component, ElementRef, computed, inject, input, viewChild } from '@angular/core';
import { LucideMoon, LucideSun } from './icons';
import { COPY } from './copy';
import { ThemeService, type Theme } from '../state/theme.service';

let nextId = 0;

/** The two board themes, in the order they are offered. `light` is washi, the reference palette, so it leads. */
const THEMES: readonly { readonly value: Theme; readonly label: string }[] = [
  { value: 'light', label: COPY.theme.washi },
  { value: 'dark', label: COPY.theme.sumi },
];

/**
 * The board's washi/sumi choice, as one control with two homes: the header
 * theme panel and the `/settings` appearance row. Two copies of a control
 * drift; one component cannot.
 *
 * It is a radio group, not a toggle button — two options with exactly one
 * selected is what a radio group is, and it is the only shape that reads the
 * same in both places (a toggle button labelled "switch to sumi" says what
 * clicking does, which is the wrong question when the panel is showing you
 * both options side by side).
 *
 * Keyboard contract is the APG radio-group one: the group is a single tab
 * stop landing on the checked option, and arrows — both axes, so the control
 * works whichever way a surface lays it out — move the selection.
 */
@Component({
  selector: 'app-theme-choice',
  imports: [LucideSun, LucideMoon],
  templateUrl: './theme-choice.html',
  styleUrl: './theme-choice.scss',
})
export class ThemeChoice {
  private readonly themeService = inject(ThemeService);

  /**
   * The row label. It is an input rather than a constant because the two
   * surfaces name the same control differently: Settings calls it `theme`
   * inside an appearance section, the panel calls it `board` opposite a
   * `terminal` row.
   */
  readonly label = input.required<string>();

  /** Rendered once here so the group's accessible name is wired in one place rather than at every call site. */
  protected readonly labelId = `theme-choice-label-${nextId++}`;
  protected readonly themes = THEMES;
  protected readonly theme = this.themeService.theme;

  private readonly groupEl = viewChild<ElementRef<HTMLElement>>('group');

  protected readonly checkedIndex = computed(() =>
    THEMES.findIndex((option) => option.value === this.theme())
  );

  protected select(theme: Theme): void {
    this.themeService.set(theme);
  }

  /**
   * Arrows move the selection and the focus together, the way a radio group
   * does; Home/End jump to the ends. Both axes are bound: a surface is free
   * to stack the two options without the keyboard changing meaning.
   */
  protected onKeydown(event: KeyboardEvent): void {
    const last = THEMES.length - 1;
    const current = this.checkedIndex();
    let next: number | null = null;
    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        next = current >= last ? 0 : current + 1;
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        next = current <= 0 ? last : current - 1;
        break;
      case 'Home':
        next = 0;
        break;
      case 'End':
        next = last;
        break;
      default:
        return;
    }
    event.preventDefault();
    this.select(THEMES[next].value);
    // Selection moved, so the group's single tab stop moved with it; the
    // focus has to follow or the user is left on an unchecked option.
    this.groupEl()
      ?.nativeElement.querySelectorAll<HTMLButtonElement>('[role="radio"]')
      [next]?.focus();
  }
}
