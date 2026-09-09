import { Component, input, output } from "@angular/core";

/**
 * Reusable destructive-op confirmation modal. Not backed by
 * `@angular/cdk/dialog` — this is a plain component the caller renders
 * conditionally (`@if (show()) { <app-confirm-modal .../> }`) inside its own
 * template, styled as a fixed-position overlay. That keeps this a "simple
 * modal component of our own" per the tier-3 brief instead of pulling in a
 * dialog-service abstraction for one use case.
 *
 * Two modes:
 * - Normal: `title`/`body`/`confirmLabel` render with a Cancel + Confirm
 *   button pair; `confirmed`/`cancelled` fire on click.
 * - Refusal (`refusalReason` set): the op is blocked client-side (e.g.
 *   "can't close the last open workspace" — CONTRACT-TIER3.md section 6).
 *   No confirm button is rendered at all, only an explanation and a
 *   dismiss action, so there is no way to accidentally proceed.
 */
@Component({
  selector: "app-confirm-modal",
  imports: [],
  templateUrl: "./confirm-modal.html",
  styleUrl: "./confirm-modal.scss",
})
export class ConfirmModal {
  readonly title = input.required<string>();
  readonly body = input<string>("");
  readonly confirmLabel = input<string>("Confirm");
  readonly cancelLabel = input<string>("Cancel");
  /** Styles the confirm button as destructive (red) when true. */
  readonly danger = input<boolean>(false);
  /** When set, this is a refusal notice — see class doc. */
  readonly refusalReason = input<string | null>(null);

  readonly confirmed = output<void>();
  readonly cancelled = output<void>();

  protected onConfirm(): void {
    this.confirmed.emit();
  }

  protected onCancel(): void {
    this.cancelled.emit();
  }
}
