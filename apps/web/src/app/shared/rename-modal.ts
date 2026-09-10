import {
  AfterViewInit,
  Component,
  ElementRef,
  OnDestroy,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { COPY } from './copy';
import { containDialogFocus } from './confirm-modal';

/**
 * Single-input naming dialog. Sibling of `ConfirmModal` (whose focus trap it
 * reuses) rather than a variant of it: a confirm asks a yes/no question about
 * something that already happened, this collects a value.
 *
 * The name it collects has exactly one home — herdr's own pane label — so
 * there is no draft, no autosave and no local storage here: submitting is
 * the only thing that writes, and `clear` is a real unset, not an empty
 * string. A value that is empty after trimming IS the clear, so the two
 * paths can never disagree.
 */
@Component({
  selector: 'app-rename-modal',
  imports: [],
  templateUrl: './rename-modal.html',
  styleUrl: './rename-modal.scss',
})
export class RenameModal implements AfterViewInit, OnDestroy {
  protected readonly copy = COPY;

  /** Seeds the input — the current name, or `""` when the thing has none. */
  readonly initialValue = input<string>('');
  readonly title = input<string>(COPY.card.renameModalTitle);
  readonly fieldLabel = input<string>(COPY.card.renameFieldLabel);
  /**
   * Why the last attempt was refused, shown under the field. The caller
   * owns the wording (it is the same text as the failure toast, herdr's
   * reason and all); this component only has to keep it visible next to
   * the value that produced it.
   */
  readonly error = input<string | null>(null);

  /** `null` means "clear the name"; a string is the new name, already trimmed. */
  readonly saved = output<string | null>();
  readonly cancelled = output<void>();

  private readonly dialog = viewChild.required<ElementRef<HTMLElement>>('dialog');
  private readonly field = viewChild.required<ElementRef<HTMLInputElement>>('field');
  private release: (() => void) | null = null;

  /** Mirrors the input so the clear action can appear only when there is something to clear. */
  protected readonly value = signal('');

  ngAfterViewInit(): void {
    const field = this.field().nativeElement;
    field.value = this.initialValue();
    this.value.set(this.initialValue());
    this.release = containDialogFocus(this.dialog().nativeElement);
    field.select();
  }

  ngOnDestroy(): void {
    this.release?.();
    this.release = null;
  }

  protected onInput(event: Event): void {
    this.value.set((event.target as HTMLInputElement).value);
  }

  /** Empty after trimming is a clear, not a rename to `""`. */
  protected onSave(): void {
    const trimmed = this.value().trim();
    this.saved.emit(trimmed === '' ? null : trimmed);
  }

  protected onClear(): void {
    this.saved.emit(null);
  }

  protected onCancel(): void {
    this.cancelled.emit();
  }
}
