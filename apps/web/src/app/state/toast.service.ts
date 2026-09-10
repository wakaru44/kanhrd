import { Injectable, signal } from '@angular/core';

export type ToastLevel = 'info' | 'warn' | 'error';

export interface Toast {
  readonly id: number;
  /**
   * Dedup identity. Two pushes with the same key are the SAME notice: the
   * second replaces the first in place rather than stacking beside it.
   * Defaults to `${level}:${message}`, so a repeated failure can never
   * become a toast storm without anyone opting in.
   */
  readonly key: string;
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
  /** Dedup identity — see `Toast.key`. Give one when the message varies but the notice does not (a host name in a disconnect notice). */
  key?: string;
}

/** One long action's notice. Every path out of the action resolves it exactly once. */
export interface ProgressNotice {
  /** The action finished: cancel a not-yet-shown notice, remove a shown one. */
  resolve(): void;
  /** The action failed: the same notice becomes the error, in place. */
  fail(message: string): void;
}

const DEFAULT_TIMEOUT_MS = 5000;

/**
 * How long an action may run before it earns a notice. Under this, the
 * result lands first and a flash of "working…" would be noise
 * (docs/UX-GUIDELINES.md, "Motion and feedback remain quiet under load").
 */
export const PROGRESS_DELAY_MS = 300;

/**
 * Signals-based toast queue backing `ToastHost` (one stack, mounted once in
 * `app.html`: bottom-right on desktop, top on mobile).
 *
 * Three ways a notice leaves: its own timeout, an explicit `dismiss(id)` /
 * `dismissByKey(key)`, or being replaced by a later push with the same key.
 *
 * Deduplication is the default, not an opt-in. Every toast has a `key` —
 * `${level}:${message}` unless the caller names one — and a push onto an
 * existing key updates that notice in place and restarts its timer. This is
 * what keeps repeated failures (a bridge retry loop, five hosts dropping at
 * once) from stacking into a wall the user has to dismiss one at a time.
 */
@Injectable({ providedIn: 'root' })
export class ToastService {
  private nextId = 0;
  private readonly timers = new Map<number, ReturnType<typeof setTimeout>>();

  readonly toasts = signal<readonly Toast[]>([]);

  /**
   * Show a notice, or update the one already showing under the same key.
   * Returns the notice's id either way, so a caller that pushed a
   * persistent notice can still dismiss it by id later.
   */
  push(options: PushToastOptions): number {
    const persistent = options.persistent ?? false;
    const key = options.key ?? `${options.level}:${options.message}`;
    const existing = this.toasts().find((toast) => toast.key === key);

    const toast: Toast = {
      id: existing?.id ?? this.nextId++,
      key,
      level: options.level,
      message: options.message,
      persistent,
    };

    this.toasts.update((list) =>
      existing ? list.map((item) => (item.key === key ? toast : item)) : [...list, toast]
    );

    // A replacement restarts the clock: the notice is as fresh as its
    // newest occurrence, whatever the previous one had left to run.
    this.clearTimer(toast.id);
    if (!persistent) {
      this.timers.set(
        toast.id,
        setTimeout(() => this.dismiss(toast.id), options.timeoutMs ?? DEFAULT_TIMEOUT_MS)
      );
    }
    return toast.id;
  }

  dismiss(id: number): void {
    this.clearTimer(id);
    this.toasts.update((list) => list.filter((t) => t.id !== id));
  }

  /** Removes the notice under `key`, if one is showing. A no-op otherwise. */
  dismissByKey(key: string): void {
    const toast = this.toasts().find((item) => item.key === key);
    if (toast) {
      this.dismiss(toast.id);
    }
  }

  /** Dismisses the most recently pushed toast still showing — used by `KeyboardService`'s `Escape` handling. */
  dismissTop(): void {
    const list = this.toasts();
    const top = list[list.length - 1];
    if (top) {
      this.dismiss(top.id);
    }
  }

  /**
   * One updatable notice for a long action, under a caller-owned `key`.
   *
   * Nothing is shown for the first `PROGRESS_DELAY_MS`: an action that
   * resolves inside that window leaves no trace. Past it, a persistent
   * notice appears and stays until `resolve()` removes it or `fail()`
   * turns it — in place, under the same key — into the error. Repeated
   * attempts share the key, so retrying never stacks a second notice.
   */
  progress(key: string, message: string): ProgressNotice {
    let settled = false;
    let shown = false;
    const timer = setTimeout(() => {
      if (!settled) {
        shown = true;
        this.push({ level: 'info', message, persistent: true, key });
      }
    }, PROGRESS_DELAY_MS);

    const settle = (): boolean => {
      if (settled) {
        return false;
      }
      settled = true;
      clearTimeout(timer);
      return true;
    };

    return {
      resolve: () => {
        if (settle() && shown) {
          this.dismissByKey(key);
        }
      },
      fail: (failure: string) => {
        if (settle()) {
          this.push({ level: 'error', message: failure, key });
        }
      },
    };
  }

  private clearTimer(id: number): void {
    const timer = this.timers.get(id);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(id);
    }
  }
}
