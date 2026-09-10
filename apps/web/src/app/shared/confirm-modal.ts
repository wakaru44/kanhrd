import {
  AfterViewInit,
  Component,
  ElementRef,
  OnDestroy,
  input,
  output,
  viewChild,
} from '@angular/core';
import { COPY } from './copy';

/** One row of a cascading-close preview list: what kind of thing goes, what it is called, and (optionally) its cardinality. */
export interface ConfirmPreviewItem {
  readonly kind: string;
  readonly name: string;
  /** Cardinality readout, e.g. `2 cards`. Data, not copy — the caller formats it. */
  readonly detail?: string;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function focusable(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => el.offsetParent !== null || el === document.activeElement
  );
}

/**
 * Contain focus in `dialog`, mark everything behind it `inert`, and restore
 * focus to the invoking control on release — the dialog contract in
 * `docs/DESIGN-SYSTEM.md` § Modal and `docs/UX-GUIDELINES.md`
 * § Keyboard-first.
 *
 * Lives here rather than in a new shared module because the only two
 * dialogs in the app are this one and `KeyboardHelpOverlay`, which imports
 * it. A third caller is the moment to lift it out.
 *
 * Escape is deliberately NOT bound here: it is bound on the dialog element
 * in each template, so it only fires while focus is inside an open dialog.
 * A global unmodified Escape would break every TUI running in a pane.
 */
export function containDialogFocus(dialog: HTMLElement): () => void {
  const invoker = document.activeElement as HTMLElement | null;
  const inerted: HTMLElement[] = [];

  for (
    let node: HTMLElement | null = dialog;
    node && node !== document.body;
    node = node.parentElement
  ) {
    const parent = node.parentElement;
    if (!parent) {
      break;
    }
    for (const sibling of Array.from(parent.children)) {
      const el = sibling as HTMLElement;
      if (el !== node && !el.hasAttribute('inert')) {
        el.setAttribute('inert', '');
        inerted.push(el);
      }
    }
  }

  const onKeydown = (event: KeyboardEvent): void => {
    if (event.key !== 'Tab') {
      return;
    }
    const stops = focusable(dialog);
    if (stops.length === 0) {
      event.preventDefault();
      return;
    }
    const first = stops[0];
    const last = stops[stops.length - 1];
    const active = document.activeElement;
    if (event.shiftKey && (active === first || active === dialog)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  };

  dialog.addEventListener('keydown', onKeydown);
  (focusable(dialog)[0] ?? dialog).focus();

  return () => {
    dialog.removeEventListener('keydown', onKeydown);
    for (const el of inerted) {
      el.removeAttribute('inert');
    }
    invoker?.focus?.();
  };
}

/**
 * Reusable confirmation dialog. Not backed by `@angular/cdk/dialog` — the
 * caller renders it conditionally (`@if (show()) { <app-confirm-modal …/> }`)
 * and this component owns the torii framing, the focus trap and the
 * background `inert` for as long as it is in the DOM.
 *
 * Three shapes:
 * - Plain confirm: soft prompt (`title`) + honest body.
 * - Cascading close: the same, plus `previewItems` — one row per entity that
 *   disappears, never a prose summary.
 * - Refusal (`refusalReason` set): the op is blocked, so no confirm button is
 *   rendered at all and there is no way to accidentally proceed.
 *
 * Care copy softens the prompt, never the fact: a `title` from the care
 * vocabulary is always paired with a body that says the session ends and
 * cannot be recovered.
 */
@Component({
  selector: 'app-confirm-modal',
  imports: [],
  templateUrl: './confirm-modal.html',
  styleUrl: './confirm-modal.scss',
})
export class ConfirmModal implements AfterViewInit, OnDestroy {
  protected readonly copy = COPY;

  readonly title = input.required<string>();
  readonly body = input<string>('');
  /** Care verb for the destructive action. Every call site passes one; the fallback is the gentlest verb in the vocabulary. */
  readonly confirmLabel = input<string>(COPY.confirm.closePaneAction);
  readonly cancelLabel = input<string>(COPY.confirm.cancel);
  /** Entities that disappear on confirm. Empty for a single-entity close, which renders no list. */
  readonly previewItems = input<readonly ConfirmPreviewItem[]>([]);
  /** `--danger-fill` on the confirm button. Reserved for irrecoverable data loss; closing a card/tab/workspace is accent-filled with honest copy. */
  readonly danger = input<boolean>(false);
  /** When set, this is a refusal notice — see class doc. */
  readonly refusalReason = input<string | null>(null);

  readonly confirmed = output<void>();
  readonly cancelled = output<void>();

  private readonly dialog = viewChild.required<ElementRef<HTMLElement>>('dialog');
  private release: (() => void) | null = null;

  ngAfterViewInit(): void {
    this.release = containDialogFocus(this.dialog().nativeElement);
  }

  ngOnDestroy(): void {
    this.release?.();
    this.release = null;
  }

  protected onConfirm(): void {
    this.confirmed.emit();
  }

  protected onCancel(): void {
    this.cancelled.emit();
  }
}
