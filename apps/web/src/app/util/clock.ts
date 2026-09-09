import { Injectable, signal } from "@angular/core";

/** Shared 1s tick so every stats badge re-renders its elapsed-time text off one timer instead of one `setInterval` per card. */
@Injectable({ providedIn: "root" })
export class ClockTick {
  readonly now = signal(Date.now());

  constructor() {
    setInterval(() => this.now.set(Date.now()), 1000);
  }
}

/** Pure, unit-testable duration formatter: `0s`/`42s`/`3m`/`2h`. */
export function formatElapsed(ms: number): string {
  if (ms < 1000) {
    return "0s";
  }
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) {
    return `${seconds}s`;
  }
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `${minutes}m`;
  }
  const hours = Math.floor(minutes / 60);
  return `${hours}h`;
}
