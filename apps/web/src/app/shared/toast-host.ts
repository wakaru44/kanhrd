import { Component, inject } from "@angular/core";
import { LucideX } from "@lucide/angular";
import { ToastService } from "../state/toast.service";

/**
 * Top-right stacked toast notifications — mounted once in `app.html`. Reads
 * `ToastService.toasts` directly; dismissal is either automatic (timeout,
 * owned by the service) or manual (this component's close button, or
 * `KeyboardService`'s `Escape` calling `ToastService.dismissTop()`).
 */
@Component({
  selector: "app-toast-host",
  imports: [LucideX],
  templateUrl: "./toast-host.html",
  styleUrl: "./toast-host.scss",
})
export class ToastHost {
  protected readonly toastService = inject(ToastService);
  protected readonly toasts = this.toastService.toasts;

  protected dismiss(id: number): void {
    this.toastService.dismiss(id);
  }
}
