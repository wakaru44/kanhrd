import { Component, computed, effect, inject, input, signal, untracked } from "@angular/core";
import type { HostSummary } from "@kanhrd/schema";
import { ClockTick } from "../util/clock";

const ALL_DISCONNECTED_GRACE_MS = 5000;

/**
 * Board empty state: replaces the old "No herdr hosts configured" one-liner
 * with an actual next step. Shown when there are no configured hosts at
 * all, or every configured host has been unreachable for more than
 * `ALL_DISCONNECTED_GRACE_MS` — the grace period avoids flashing this on
 * every normal cold load, where hosts briefly report `connected: false`
 * before the bridge finishes its first handshake.
 */
@Component({
  selector: "app-empty-state",
  imports: [],
  templateUrl: "./empty-state.html",
  styleUrl: "./empty-state.scss",
})
export class EmptyState {
  private readonly clock = inject(ClockTick);

  readonly hosts = input.required<readonly HostSummary[]>();

  protected readonly configSnippet = `hosts:
  - name: local
    socket: ~/.config/herdr/herdr.sock
`;
  protected readonly startCommand = "node apps/bridge/dist/main.js   # or: make run";

  protected readonly noHostsConfigured = computed(() => this.hosts().length === 0);

  private readonly allDisconnectedSince = signal<number | null>(null);

  constructor() {
    effect(() => {
      const hosts = this.hosts();
      untracked(() => {
        const allDown = hosts.length > 0 && hosts.every((h) => !h.connected);
        if (!allDown) {
          this.allDisconnectedSince.set(null);
        } else if (this.allDisconnectedSince() === null) {
          this.allDisconnectedSince.set(Date.now());
        }
      });
    });
  }

  /** Public (not `protected`): `Board`'s template reads this via a `#ref` template variable to decide whether to also render the board grid. */
  readonly show = computed(() => {
    if (this.noHostsConfigured()) {
      return true;
    }
    const since = this.allDisconnectedSince();
    if (since === null) {
      return false;
    }
    return this.clock.now() - since > ALL_DISCONNECTED_GRACE_MS;
  });
}
