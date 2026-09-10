import { Component, computed, effect, inject, input, output, signal, untracked } from "@angular/core";
import type { HostSummary } from "@kanhrd/schema";
import { COPY } from "../shared/copy";
import { LucideCopy } from "../shared/icons";
import { ClockTick } from "../util/clock";

const ALL_DISCONNECTED_GRACE_MS = 5000;

/** Where `docs/OPERATING.md` lives for a user who is not reading the checkout. */
const OPERATING_GUIDE_URL = "https://github.com/wakaru44/kanhrd/blob/main/docs/OPERATING.md";

export type EmptyStateVariant = "pens" | "noMatches";

/**
 * Page-level board empty states — a next step, never a message
 * (docs/UX-GUIDELINES.md, "Empty states as tutorials").
 *
 * - `pens` (default): no pen configured, or every configured pen has been
 *   unreachable for more than `ALL_DISCONNECTED_GRACE_MS`. The grace period
 *   avoids flashing setup instructions on a normal cold load, where pens
 *   briefly report `connected: false` before the first handshake.
 * - `noMatches`: the filters (or every status column being hidden) match
 *   nothing. Always shown when asked for — the caller already knows.
 *
 * An *empty status column* is deliberately not handled here: it is header
 * plus a mono `0`, no prose (see `column.html`).
 */
@Component({
  selector: "app-empty-state",
  imports: [LucideCopy],
  templateUrl: "./empty-state.html",
  styleUrl: "./empty-state.scss",
})
export class EmptyState {
  private readonly clock = inject(ClockTick);

  readonly hosts = input<readonly HostSummary[]>([]);
  readonly variant = input<EmptyStateVariant>("pens");

  readonly clearFilters = output<void>();

  protected readonly copy = COPY;
  protected readonly operatingGuideUrl = OPERATING_GUIDE_URL;

  protected readonly configSnippet = `hosts:
  - name: local
    socket: ~/.config/herdr/herdr.sock
`;
  protected readonly startCommand = "pnpm --filter @kanhrd/bridge dev";

  protected readonly copied = signal(false);

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

  /** Public (not `protected`): `Board`'s template reads this via a `#ref` template variable to decide whether to also render the board. */
  readonly show = computed(() => {
    if (this.variant() === "noMatches") {
      return true;
    }
    if (this.noHostsConfigured()) {
      return true;
    }
    const since = this.allDisconnectedSince();
    if (since === null) {
      return false;
    }
    return this.clock.now() - since > ALL_DISCONNECTED_GRACE_MS;
  });

  protected async copySnippet(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.configSnippet);
      this.copied.set(true);
    } catch {
      // Clipboard denied (insecure context, or the user said no). The
      // snippet is on screen and selectable either way; nothing is claimed
      // that did not happen.
      this.copied.set(false);
    }
  }
}
