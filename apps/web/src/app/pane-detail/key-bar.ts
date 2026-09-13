import {
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import {
  type KeyBarCell,
  type KeyBarModifier,
  type KeyBarModifiers,
  type ModifierState,
} from './key-bar-cells';
import { formatKeyBarSample, readKeyBarProbe } from './key-bar-probe';

/** Termux's fallback long-press threshold (ExtraKeysView). */
export const KEY_BAR_LONG_PRESS_MS = 400;

/**
 * How far the soft keyboard (or anything else) covers the bottom of the
 * layout viewport: the gap between the layout viewport's bottom and the
 * visual viewport's. Pure, so it is tested with plain numbers. Under
 * `interactive-widget=resizes-content` (Chrome Android) the layout viewport
 * shrinks with the visual one and this is 0, which is correct; on iOS Safari
 * it is the keyboard's height.
 */
export function occludedBottom(
  layoutHeight: number,
  visual: { height: number; offsetTop: number } | null
): number {
  if (!visual) return 0;
  return Math.max(0, Math.round(layoutHeight - (visual.height + visual.offsetTop)));
}

/**
 * The pane-detail key bar: an always-present strip that expands into a row
 * of keys a soft keyboard does not have. See
 * openspec/changes/add-terminal-key-bar/design.md.
 *
 * - Fixed to the bottom of the VISUAL viewport. `position: fixed` resolves
 *   against the layout viewport, which does not shrink for the soft keyboard
 *   on iOS, so the bar is translated up by `occludedBottom`, recomputed on
 *   visualViewport `resize` AND `scroll` (iOS slides the layout viewport
 *   without resizing it) plus a few defensive moments.
 * - Never takes focus: every control cancels `pointerdown`, whose default
 *   action is the focus move that would blur xterm and dismiss the keyboard.
 * - Cells act on `pointerup`, not `pointerdown`: the row scrolls
 *   horizontally at phone width, and a pan that starts on a key must not
 *   send it. A pan fires `pointercancel`, which drops the press.
 * - Keyboard activation (a `click` with `detail === 0`) does the same as a
 *   tap, so the bar stays operable without a pointer.
 * - Emits `reserve`, the height the terminal must give up (bar plus keyboard),
 *   so the prompt is never hidden behind either.
 */
@Component({
  selector: 'app-key-bar',
  templateUrl: './key-bar.html',
  styleUrl: './key-bar.scss',
  host: {
    '[style.transform]': "'translateY(' + -occluded() + 'px)'",
    '[style.left.px]': 'left()',
    '[style.width.px]': 'width()',
    '[class.keyboard-open]': 'occluded() > 0',
  },
})
export class KeyBar {
  readonly cells = input.required<readonly KeyBarCell[]>();
  readonly modifiers = input.required<KeyBarModifiers>();
  readonly expanded = input.required<boolean>();

  /** A keys cell was activated: its sequence of herdr key names. */
  readonly keys = output<readonly string[]>();
  /** The strip was activated. */
  readonly toggled = output<void>();
  /** Pixels the view must keep clear at its bottom: the bar's height plus the keyboard's. */
  readonly reserve = output<number>();

  protected readonly occluded = signal(0);
  /** TEMPORARY (task 6.4): the `?keybar-debug` readout, or null when not asked for. */
  protected readonly probe = signal<string | null>(null);
  protected readonly probeTop = signal(0);
  private readonly probeOn = readKeyBarProbe(location.search).debug;
  private maxOccluded = 0;
  protected readonly left = signal<number | null>(null);
  protected readonly width = signal<number | null>(null);

  /** Latched modifiers, for the strip's status while collapsed or not. */
  protected readonly latched = computed(() =>
    this.cells().filter(
      (cell): cell is Extract<KeyBarCell, { kind: 'modifier' }> =>
        cell.kind === 'modifier' && this.modifiers().active().includes(cell.modifier)
    )
  );

  /** The strip at rest reads as the keys it holds — keycaps, not a sentence. */
  protected readonly readout = computed(() =>
    this.cells()
      .map((cell) => cell.label)
      .join(' ')
  );

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private pressTimer: ReturnType<typeof setTimeout> | null = null;
  private pressedId: string | null = null;
  private longPressed = false;
  private destroyed = false;
  private settleTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      const place = () => this.place();
      const vv = window.visualViewport;
      vv?.addEventListener('resize', place);
      vv?.addEventListener('scroll', place);
      window.addEventListener('resize', place);
      // `offsetTop` has been reported to stick after the keyboard closes on iOS;
      // re-read once the dismissal animation has settled.
      const settle = () => {
        if (this.settleTimer !== null) clearTimeout(this.settleTimer);
        this.settleTimer = setTimeout(place, 350);
      };
      document.addEventListener('focusout', settle);
      document.addEventListener('focusin', settle);
      const observer = new ResizeObserver(place);
      observer.observe(this.host.nativeElement);
      const anchor = this.host.nativeElement.parentElement;
      if (anchor) observer.observe(anchor);
      place();
      destroyRef.onDestroy(() => {
        this.destroyed = true;
        if (this.settleTimer !== null) clearTimeout(this.settleTimer);
        vv?.removeEventListener('resize', place);
        vv?.removeEventListener('scroll', place);
        window.removeEventListener('resize', place);
        document.removeEventListener('focusout', settle);
        document.removeEventListener('focusin', settle);
        observer.disconnect();
        this.clearPress();
      });
    });
  }

  protected stateOf(cell: KeyBarCell): ModifierState | null {
    return cell.kind === 'modifier' ? this.modifiers().stateOf(cell.modifier) : null;
  }

  protected stateOfModifier(modifier: KeyBarModifier): ModifierState {
    return this.modifiers().stateOf(modifier);
  }

  /** Accessible name for a keycap that is a glyph: the herdr key name(s) it sends. */
  protected nameOf(cell: KeyBarCell): string | null {
    return cell.kind === 'keys' ? cell.keys.join(' ') : null;
  }

  // --- pointer ------------------------------------------------------------

  protected onPointerDown(event: PointerEvent, cell: KeyBarCell | null): void {
    event.preventDefault();
    this.clearPress();
    this.pressedId = cell?.id ?? STRIP_ID;
    this.longPressed = false;
    if (cell?.kind === 'modifier') {
      this.pressTimer = setTimeout(() => {
        this.pressTimer = null;
        this.longPressed = true;
        this.modifiers().lock(cell.modifier);
      }, KEY_BAR_LONG_PRESS_MS);
    }
  }

  protected onPointerUp(event: PointerEvent, cell: KeyBarCell | null): void {
    const id = cell?.id ?? STRIP_ID;
    if (this.pressedId !== id) return;
    const wasLong = this.longPressed;
    this.clearPress();
    if (!wasLong) this.activate(cell);
  }

  /** A pan, a lost pointer: the press never happened. */
  protected onPointerCancel(): void {
    this.clearPress();
  }

  /** Keyboard activation only; a pointer's own `click` is ignored, `pointerup` already acted. */
  protected onClick(event: MouseEvent, cell: KeyBarCell | null): void {
    if (event.detail === 0) this.activate(cell);
  }

  private activate(cell: KeyBarCell | null): void {
    if (cell === null) {
      this.toggled.emit();
    } else if (cell.kind === 'modifier') {
      this.modifiers().tap(cell.modifier);
    } else {
      this.keys.emit(cell.keys);
    }
  }

  private clearPress(): void {
    if (this.pressTimer !== null) clearTimeout(this.pressTimer);
    this.pressTimer = null;
    this.pressedId = null;
    this.longPressed = false;
  }

  // --- placement ------------------------------------------------------------

  private place(): void {
    if (this.destroyed) return;
    const vv = window.visualViewport;
    const occluded = occludedBottom(
      window.innerHeight,
      vv ? { height: vv.height, offsetTop: vv.offsetTop } : null
    );
    this.occluded.set(occluded);
    const anchor = this.host.nativeElement.parentElement?.getBoundingClientRect();
    if (anchor) {
      this.left.set(anchor.left);
      this.width.set(anchor.width);
    }
    this.reserve.emit(this.host.nativeElement.getBoundingClientRect().height + occluded);
    if (this.probeOn) this.sample(occluded);
  }

  /** TEMPORARY (task 6.4): records the numbers the occlusion math used, for a device screenshot. */
  private sample(occluded: number): void {
    const vv = window.visualViewport;
    const bar = this.host.nativeElement.getBoundingClientRect();
    const row = this.host.nativeElement.querySelector('.row')?.getBoundingClientRect() ?? null;
    const focused = document.activeElement;
    const textarea = document.querySelector('.xterm-helper-textarea');
    this.maxOccluded = Math.max(this.maxOccluded, occluded);
    // The bar is transformed, so the fixed readout's containing block is the bar itself:
    // offset it by the bar's own top to pin it to the visual viewport's top edge.
    this.probeTop.set((vv?.offsetTop ?? 0) - bar.top);
    this.probe.set(
      formatKeyBarSample(
        {
          innerHeight: window.innerHeight,
          vvHeight: vv?.height ?? null,
          vvOffsetTop: vv?.offsetTop ?? null,
          vvScale: vv?.scale ?? null,
          occluded,
          barTop: bar.top,
          barBottom: bar.bottom,
          rowTop: row?.top ?? null,
          focusedTag: focused ? focused.tagName.toLowerCase() : 'none',
          focusedBottom:
            focused && focused !== document.body ? focused.getBoundingClientRect().bottom : null,
          autocomplete: textarea?.getAttribute('autocomplete') ?? '(absent)',
        },
        this.maxOccluded
      )
    );
  }
}

const STRIP_ID = '__strip__';
