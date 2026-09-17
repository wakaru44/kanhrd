import { Component, input, output } from '@angular/core';
import { COPY } from '../shared/copy';
import type { SplitAxis } from './file-panel-split';

/**
 * The rule between the terminal and the file panel, and the whole of its
 * chrome. It renders a hairline with a touch-sized hit area on either side,
 * and it reports gestures — it does NOT own the ratio: the arithmetic needs
 * the split container's box, which is `PaneDetail`'s, and one home for the
 * ratio is what keeps the remembered value and the rendered one the same.
 *
 * `separator` with `aria-valuenow` rather than a slider: it divides two
 * regions, and the keyboard moves it in the steps `file-panel-split.ts`
 * defines (docs/UX-GUIDELINES.md, "Keyboard-first").
 */
@Component({
  selector: 'app-split-handle',
  templateUrl: './split-handle.html',
  styleUrl: './split-handle.scss',
})
export class SplitHandle {
  readonly axis = input.required<SplitAxis>();
  /** The terminal's share, as a whole percentage, for assistive technology. */
  readonly percent = input.required<string>();

  readonly pressed = output<PointerEvent>();
  readonly moved = output<PointerEvent>();
  readonly released = output<void>();
  /** `+1` grows the terminal's share, `-1` shrinks it. */
  readonly stepped = output<1 | -1>();

  protected readonly copy = COPY;

  protected onDown(event: PointerEvent): void {
    event.preventDefault();
    (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
    this.pressed.emit(event);
  }

  protected onKey(event: KeyboardEvent): void {
    const back = this.axis() === 'hbox' ? 'ArrowLeft' : 'ArrowUp';
    const forward = this.axis() === 'hbox' ? 'ArrowRight' : 'ArrowDown';
    if (event.key !== back && event.key !== forward) {
      return;
    }
    event.preventDefault();
    this.stepped.emit(event.key === forward ? 1 : -1);
  }
}
