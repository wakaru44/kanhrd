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

/**
 * Consecutive unchanged frames that count as "the keyboard has stopped
 * moving". A stability test, not a duration: it is ~130 ms at 60 Hz and ~65 ms
 * at 120 Hz, and either is far longer than one frame of a moving animation.
 */
export const SETTLE_STABLE_FRAMES = 8;

/** Upper bound on one settle pass, so it can never spin: well above any keyboard animation. */
export const SETTLE_CEILING_MS = 2000;

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
  /** Ticks in CSS px from the bar's bottom edge: positive above it, negative below it (round 3). */
  protected readonly rulerTicks = [
    160, 144, 128, 112, 96, 80, 64, 48, 32, 16, 0, -16, -32, -48, -64, -80, -96,
  ];
  private probeUnits: Record<string, HTMLElement> = {};
  private readonly probeSwitches = readKeyBarProbe(location.search);
  private readonly probeEvents: string[] = [];
  private probeMarker: HTMLElement | null = null;
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
  private settleFrame: number | null = null;

  constructor() {
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      const on = (event: string) => () => this.place(event);
      const vvResize = on('vv.resize');
      const vvScroll = on('vv.scroll');
      const winResize = on('window.resize');
      const observed = on('observer');
      const vv = window.visualViewport;
      vv?.addEventListener('resize', vvResize);
      vv?.addEventListener('scroll', vvScroll);
      window.addEventListener('resize', winResize);
      // A settle pass after focus moves either way — the keyboard opening or
      // closing. The visualViewport events are edge-driven and give no final-state
      // guarantee: Safari's round-2 timeline flapped 320 → 0 → 320 → 0 → 320
      // mid-animation, and if the last event lands on a wrong value nothing
      // follows to correct it. Cheap insurance, not a measured fix (design.md).
      // TEMPORARY `?keybar-nosettle` disables it for device captures.
      const settle = () => this.settle();
      if (!this.probeSwitches.noSettle) {
        document.addEventListener('focusout', settle);
        document.addEventListener('focusin', settle);
      }
      const observer = new ResizeObserver(observed);
      observer.observe(this.host.nativeElement);
      const anchor = this.host.nativeElement.parentElement;
      if (anchor) observer.observe(anchor);
      this.place('init');
      if (this.probeSwitches.debug) this.mountProbeMarker();
      destroyRef.onDestroy(() => {
        this.destroyed = true;
        if (this.settleFrame !== null) cancelAnimationFrame(this.settleFrame);
        vv?.removeEventListener('resize', vvResize);
        vv?.removeEventListener('scroll', vvScroll);
        window.removeEventListener('resize', winResize);
        this.probeMarker?.remove();
        Object.values(this.probeUnits).forEach((el) => el.remove());
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

  /**
   * Samples the occlusion once per frame until it has held still for
   * `SETTLE_STABLE_FRAMES` frames after changing, then places the bar there.
   *
   * No fixed delay tuned to a keyboard animation Apple does not document: a
   * slower device or a longer animation simply takes more frames, and a re-read
   * can never land mid-animation because it waits for the value to stop moving.
   * The bar is re-placed on every change it sees, so it tracks the animation
   * even if no visualViewport event fires. If nothing changes (a hardware
   * keyboard, Android, desktop), it stops at `SETTLE_CEILING_MS` and places
   * once — the same value, a no-op.
   */
  private settle(): void {
    if (this.settleFrame !== null) cancelAnimationFrame(this.settleFrame);
    const started = performance.now();
    let last = this.measureOccluded();
    let changed = false;
    let stableFrames = 0;
    const tick = () => {
      this.settleFrame = null;
      if (this.destroyed) return;
      const now = this.measureOccluded();
      if (now !== last) {
        last = now;
        changed = true;
        stableFrames = 0;
        this.place('settle.move');
      } else {
        stableFrames++;
      }
      const settled = changed && stableFrames >= SETTLE_STABLE_FRAMES;
      if (settled || performance.now() - started >= SETTLE_CEILING_MS) {
        this.place('settle');
        return;
      }
      this.settleFrame = requestAnimationFrame(tick);
    };
    this.settleFrame = requestAnimationFrame(tick);
  }

  private measureOccluded(): number {
    const vv = window.visualViewport;
    return occludedBottom(
      window.innerHeight,
      vv ? { height: vv.height, offsetTop: vv.offsetTop } : null
    );
  }

  private place(event: string): void {
    if (this.destroyed) return;
    const occluded = this.measureOccluded();
    this.occluded.set(occluded);
    const anchor = this.host.nativeElement.parentElement?.getBoundingClientRect();
    if (anchor) {
      this.left.set(anchor.left);
      this.width.set(anchor.width);
    }
    this.reserve.emit(this.host.nativeElement.getBoundingClientRect().height + occluded);
    if (this.probeSwitches.debug) {
      // Read after the transform has rendered: a rect read here would describe the
      // previous placement, which is what made round 1's readout lag.
      requestAnimationFrame(() => requestAnimationFrame(() => this.sample(event, occluded)));
    }
  }

  /** TEMPORARY (task 6.4): records the numbers the occlusion math used, for a device screenshot. */
  /**
   * TEMPORARY (task 6.4): an untransformed, zero-height element fixed at the layout
   * viewport's bottom. Its rect answers which coordinate space iOS reports rects in
   * (bottom = innerHeight means layout viewport), and its padding measures
   * `env(safe-area-inset-bottom)`.
   */
  private mountProbeMarker(): void {
    const marker = document.createElement('div');
    marker.setAttribute('aria-hidden', 'true');
    marker.style.cssText =
      'position:fixed;left:0;bottom:0;width:1px;height:0;padding-bottom:env(safe-area-inset-bottom);pointer-events:none;';
    document.body.appendChild(marker);
    this.probeMarker = marker;
    // What each viewport unit resolves to. On iOS `100vh` is the LARGE viewport
    // (toolbars retracted), taller than innerHeight while toolbars show — and the
    // app shell is `height: 100vh`.
    for (const unit of ['100vh', '100dvh', '100svh', '100lvh']) {
      const el = document.createElement('div');
      el.setAttribute('aria-hidden', 'true');
      el.style.cssText = `position:absolute;left:-9999px;top:0;width:1px;height:${unit};visibility:hidden;`;
      document.body.appendChild(el);
      this.probeUnits[unit] = el;
    }
  }

  private sample(event: string, occluded: number): void {
    if (this.destroyed) return;
    const vv = window.visualViewport;
    const bar = this.host.nativeElement.getBoundingClientRect();
    const row = this.host.nativeElement.querySelector('.row')?.getBoundingClientRect() ?? null;
    const focused = document.activeElement;
    const textarea = document.querySelector('.xterm-helper-textarea');
    this.maxOccluded = Math.max(this.maxOccluded, occluded);
    this.probeEvents.unshift(
      `${event} occ ${occluded} vv.h ${Math.round(vv?.height ?? -1)} off ${Math.round(vv?.offsetTop ?? -1)} bar.b ${Math.round(bar.bottom)}`
    );
    this.probeEvents.length = Math.min(this.probeEvents.length, 8);
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
          transform: this.host.nativeElement.style.transform || '(none)',
          markerBottom: this.probeMarker?.getBoundingClientRect().bottom ?? null,
          safeAreaBottom: this.probeMarker ? this.probeMarker.getBoundingClientRect().height : null,
          clientHeight: document.documentElement.clientHeight,
          outerHeight: window.outerHeight,
          screenHeight: screen.height,
          virtualKeyboard: 'virtualKeyboard' in navigator,
          settle: !this.probeSwitches.noSettle,
          events: this.probeEvents,
          shellBottom: document.querySelector('app-root')?.getBoundingClientRect().bottom ?? null,
          paneBottom:
            document.querySelector('.pane-detail')?.getBoundingClientRect().bottom ?? null,
          terminalBottom:
            document.querySelector('.terminal-container')?.getBoundingClientRect().bottom ?? null,
          units: Object.fromEntries(
            Object.entries(this.probeUnits).map(([unit, el]) => [unit, el.offsetHeight])
          ),
        },
        this.maxOccluded
      )
    );
  }
}

const STRIP_ID = '__strip__';
