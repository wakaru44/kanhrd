import { Injectable, signal } from "@angular/core";

export type ToastLevel = "info" | "warn" | "error";

export interface Toast {
  readonly id: number;
  readonly level: ToastLevel;
  readonly message: string;
  readonly persistent: boolean;
}

export interface PushToastOptions {
  level: ToastLevel;
  message: string;
  /** Auto-dismiss after this many ms. Defaults to 5000ms. Ignored when `persistent` is true. */
  timeoutMs?: number;
  /** Stays until explicitly dismissed (e.g. "connection lost", dismissed on reconnect) instead of timing out. */
  persistent?: boolean;
}

const DEFAULT_TIMEOUT_MS = 5000;

/**
 * Signals-based toast queue backing `ToastHost` (top-right stacked
 * notifications, mounted once in `app.html`). `push()` returns the toast's
 * id so a caller can `dismiss()` it explicitly later — e.g. the WS client's
 * "connection lost" toast is persistent and gets dismissed by id on
 * reconnect rather than timing out on its own.
 */
@Injectable({ providedIn: "root" })
export class ToastService {
  private nextId = 0;
  private readonly timers = new Map<number, ReturnType<typeof setTimeout>>();

  readonly toasts = signal<readonly Toast[]>([]);

  push(options: PushToastOptions): number {
    const id = this.nextId++;
    const persistent = options.persistent ?? false;
    const toast: Toast = { id, level: options.level, message: options.message, persistent };
    this.toasts.update((list) => [...list, toast]);
    if (!persistent) {
      const timer = setTimeout(() => this.dismiss(id), options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
      this.timers.set(id, timer);
    }
    return id;
  }

  dismiss(id: number): void {
    const timer = this.timers.get(id);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(id);
    }
    this.toasts.update((list) => list.filter((t) => t.id !== id));
  }

  /** Dismisses the most recently pushed toast still showing — used by `KeyboardService`'s `Escape` handling. */
  dismissTop(): void {
    const list = this.toasts();
    const top = list[list.length - 1];
    if (top) {
      this.dismiss(top.id);
    }
  }
}
