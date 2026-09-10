import { TestBed } from "@angular/core/testing";
import { provideZonelessChangeDetection, signal } from "@angular/core";
import type { HostSummary } from "@kanhrd/schema";
import { COPY, fill } from "../shared/copy";
import { PanesStore } from "./panes.store";
import { PenNoticeService, penNoticeKey } from "./pen-notices.service";
import { ToastService } from "./toast.service";

async function settle(): Promise<void> {
  for (let i = 0; i < 5; i++) {
    await Promise.resolve();
  }
  await new Promise((resolve) => setTimeout(resolve, 0));
  for (let i = 0; i < 5; i++) {
    await Promise.resolve();
  }
}

function pen(name: string, connected: boolean): HostSummary {
  return { name, connected };
}

describe("PenNoticeService", () => {
  let hosts: ReturnType<typeof signal<HostSummary[]>>;
  let toasts: ToastService;

  /** Applies a new pen roster and lets the service's effect run. */
  async function observe(next: HostSummary[]): Promise<void> {
    hosts.set(next);
    await settle();
  }

  function messages(): string[] {
    return toasts.toasts().map((t) => t.message);
  }

  beforeEach(async () => {
    hosts = signal<HostSummary[]>([]);
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        { provide: PanesStore, useValue: { hostsSignal: hosts } },
      ],
    });
    toasts = TestBed.inject(ToastService);
    TestBed.inject(PenNoticeService);
    await settle();
  });

  it("says nothing about a pen that was already unreachable on first sight", async () => {
    await observe([pen("ada", false)]);
    // The board's stale note reports this one; kanhrd never had sight of it to lose.
    expect(messages()).toEqual([]);
  });

  it("says nothing while a pen stays connected", async () => {
    await observe([pen("ada", true)]);
    await observe([pen("ada", true)]);
    expect(messages()).toEqual([]);
  });

  it("names the pen when a connected pen goes quiet", async () => {
    await observe([pen("ada", true)]);
    await observe([pen("ada", false)]);

    expect(messages()).toEqual([fill(COPY.toast.penDisconnected, { pen: "ada" })]);
    expect(toasts.toasts()[0].persistent).withContext("persists until it comes back").toBeTrue();
    expect(toasts.toasts()[0].key).toBe(penNoticeKey("ada"));
  });

  it("keeps one notice per pen while a pen flaps", async () => {
    await observe([pen("ada", true)]);
    for (let i = 0; i < 5; i++) {
      await observe([pen("ada", false)]);
    }
    expect(toasts.toasts().length).toBe(1);
  });

  it("gives each pen its own notice when several drop together", async () => {
    await observe([pen("ada", true), pen("grace", true), pen("linus", true)]);
    await observe([pen("ada", false), pen("grace", false), pen("linus", true)]);

    expect(toasts.toasts().map((t) => t.key)).toEqual([penNoticeKey("ada"), penNoticeKey("grace")]);
    expect(messages()).toEqual([
      fill(COPY.toast.penDisconnected, { pen: "ada" }),
      fill(COPY.toast.penDisconnected, { pen: "grace" }),
    ]);
  });

  it("removes the pen's notice on reconnect and says it is back", async () => {
    await observe([pen("ada", true)]);
    await observe([pen("ada", false)]);
    await observe([pen("ada", true)]);

    expect(toasts.toasts().find((t) => t.key === penNoticeKey("ada"))).toBeUndefined();
    expect(messages()).toEqual([COPY.toast.penReconnected]);
  });

  it("only announces a return for a pen it announced losing", async () => {
    await observe([pen("ada", false)]);
    await observe([pen("ada", true)]);
    expect(messages()).toEqual([]);
  });

  it("drops the notice for a pen that leaves the configuration", async () => {
    await observe([pen("ada", true), pen("grace", true)]);
    await observe([pen("ada", false), pen("grace", true)]);
    expect(toasts.toasts().length).toBe(1);

    await observe([pen("grace", true)]);
    expect(toasts.toasts().length).toBe(0);
  });

  it("treats a pen that returns to the configuration as newly seen", async () => {
    await observe([pen("ada", true)]);
    await observe([]);
    await observe([pen("ada", false)]);

    // Not "lost sight of": this is a first sighting of a pen that is down.
    expect(messages()).toEqual([]);
  });
});
