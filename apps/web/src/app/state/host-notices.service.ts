import { Injectable, effect, inject } from '@angular/core';
import { COPY, fill } from '../shared/copy';
import { PanesStore } from './panes.store';
import { ToastService } from './toast.service';

/** One notice per host, keyed by the host's own name — see `ToastService.push`'s `key`. */
export function hostNoticeKey(host: string): string {
  return `host:${host}`;
}

/**
 * Per-host connection notices (`docs/BRAND.md`'s `toast.hostDisconnected` /
 * `hostReconnected`).
 *
 * `WsClient` owns the notice for the BRIDGE being unreachable; this owns the
 * notice for a host the bridge can still talk to us about but can no longer
 * reach itself. They are different outages and read differently: one host
 * going quiet must not look like losing the whole flock.
 *
 * Two rules, both from the spec's "Failure paths surface in the UI":
 *
 * 1. **A notice is a transition, not a state.** Only connected -> not
 *    connected announces. A host that was already unreachable when the app
 *    loaded is reported by the board's stale note, not by "lost sight of" —
 *    kanhrd never had sight of it to lose.
 * 2. **One notice per host, persistent until it comes back.** The key is the
 *    host, so a flapping host updates its own notice instead of stacking, and
 *    five hosts dropping at once produce five notices, not fifty.
 */
@Injectable({ providedIn: 'root' })
export class HostNoticeService {
  private readonly store = inject(PanesStore);
  private readonly toast = inject(ToastService);

  /** Last observed `connected` per host. Absent means never observed. */
  private readonly lastSeen = new Map<string, boolean>();
  /** Hosts with a notice currently showing, so reconnect only announces a real outage. */
  private readonly announced = new Set<string>();

  constructor() {
    effect(() => {
      const hosts = this.store.hostsSignal();
      const present = new Set(hosts.map((host) => host.name));

      for (const host of hosts) {
        const previous = this.lastSeen.get(host.name);
        this.lastSeen.set(host.name, host.connected);

        if (previous === true && !host.connected) {
          this.announced.add(host.name);
          this.toast.push({
            level: 'warn',
            message: fill(COPY.toast.hostDisconnected, { host: host.name }),
            persistent: true,
            key: hostNoticeKey(host.name),
          });
        } else if (host.connected && this.announced.delete(host.name)) {
          this.toast.dismissByKey(hostNoticeKey(host.name));
          this.toast.push({ level: 'info', message: COPY.toast.hostReconnected });
        }
      }

      // A host that left the config entirely has no outage to report.
      for (const name of [...this.lastSeen.keys()]) {
        if (!present.has(name)) {
          this.lastSeen.delete(name);
          if (this.announced.delete(name)) {
            this.toast.dismissByKey(hostNoticeKey(name));
          }
        }
      }
    });
  }
}
