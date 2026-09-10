import { Component, DestroyRef, inject, signal } from "@angular/core";
import { LucideInfo, LucideTriangleAlert, LucideX } from "./icons";
import { ToastService, type ToastLevel } from "../state/toast.service";

/**
 * Strings this host needs that `shared/copy.ts` does not carry yet. This lane
 * may not edit `copy.ts`; lift this into it as `toast.dismiss` and delete the
 * block.
 */
const PENDING_COPY = {
  dismiss: "dismiss",
} as const;

/** Mirrors `--breakpoint-mobile` (900px) in `shared/tokens.scss`. Placement is decided here rather than in a media query so it is assertable in a unit test. */
const MOBILE_BREAKPOINT = "(max-width: 900px)";

/**
 * The one toast stack, mounted once in `app.html`: bottom-right on desktop,
 * top on mobile so the nav drawer and the thumb zone stay clear. The mobile
 * stack is offset by the header height so it renders *below* the header
 * rather than over its controls, and the stack itself is click-through
 * (`pointer-events: none`, restored per toast) so a notice can never make an
 * open dialog's buttons unhittable.
 *
 * Dismissal is automatic (timeout, owned by `ToastService`), manual (the
 * close button here), or by id — persistent connection notices are removed
 * by their pen id on reconnect rather than stacking up.
 */
@Component({
  selector: "app-toast-host",
  imports: [LucideX, LucideInfo, LucideTriangleAlert],
  templateUrl: "./toast-host.html",
  styleUrl: "./toast-host.scss",
})
export class ToastHost {
  protected readonly toastService = inject(ToastService);
  protected readonly toasts = this.toastService.toasts;
  protected readonly pending = PENDING_COPY;

  /** True below `--breakpoint-mobile`, where the stack moves to the top. */
  protected readonly compact = signal(false);

  constructor() {
    const query = window.matchMedia(MOBILE_BREAKPOINT);
    this.compact.set(query.matches);
    const onChange = (event: MediaQueryListEvent): void => this.compact.set(event.matches);
    query.addEventListener("change", onChange);
    inject(DestroyRef).onDestroy(() => query.removeEventListener("change", onChange));
  }

  protected isError(level: ToastLevel): boolean {
    return level !== "info";
  }

  protected dismiss(id: number): void {
    this.toastService.dismiss(id);
  }
}
