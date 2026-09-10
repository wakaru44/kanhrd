import { TestBed } from "@angular/core/testing";
import { provideZonelessChangeDetection, signal } from "@angular/core";
import type { HostSummary } from "@kanhrd/schema";
import { COPY, fill } from "../shared/copy";
import { PanesStore } from "./panes.store";
import { HostNoticeService, hostNoticeKey } from "./host-notices.service";
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

function host(name: string, connected: boolean): HostSummary {
  return { name, connected };
}

describe("HostNoticeService", () => {
  let hosts: ReturnType<typeof signal<HostSummary[]>>;
  let toasts: ToastService;

  /** Applies a new host roster and lets the service's effect run. */
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
    TestBed.inject(HostNoticeService);
    await settle();
  });

  it("says nothing about a host that was already unreachable on first sight", async () => {
    await observe([host("ada", false)]);
    // The board's stale note reports this one; kanhrd never had sight of it to lose.
    expect(messages()).toEqual([]);
  });

  it("says nothing while a host stays connected", async () => {
    await observe([host("ada", true)]);
    await observe([host("ada", true)]);
    expect(messages()).toEqual([]);
  });

  it("names the host when a connected host goes quiet", async () => {
    await observe([host("ada", true)]);
    await observe([host("ada", false)]);

    expect(messages()).toEqual([fill(COPY.toast.hostDisconnected, { host: "ada" })]);
    expect(toasts.toasts()[0].persistent).withContext("persists until it comes back").toBeTrue();
    expect(toasts.toasts()[0].key).toBe(hostNoticeKey("ada"));
  });

  it("keeps one notice per host while a host flaps", async () => {
    await observe([host("ada", true)]);
    for (let i = 0; i < 5; i++) {
      await observe([host("ada", false)]);
    }
    expect(toasts.toasts().length).toBe(1);
  });

  it("gives each host its own notice when several drop together", async () => {
    await observe([host("ada", true), host("grace", true), host("linus", true)]);
    await observe([host("ada", false), host("grace", false), host("linus", true)]);

    expect(toasts.toasts().map((t) => t.key)).toEqual([hostNoticeKey("ada"), hostNoticeKey("grace")]);
    expect(messages()).toEqual([
      fill(COPY.toast.hostDisconnected, { host: "ada" }),
      fill(COPY.toast.hostDisconnected, { host: "grace" }),
    ]);
  });

  it("removes the host's notice on reconnect and says it is back", async () => {
    await observe([host("ada", true)]);
    await observe([host("ada", false)]);
    await observe([host("ada", true)]);

    expect(toasts.toasts().find((t) => t.key === hostNoticeKey("ada"))).toBeUndefined();
    expect(messages()).toEqual([COPY.toast.hostReconnected]);
  });

  it("only announces a return for a host it announced losing", async () => {
    await observe([host("ada", false)]);
    await observe([host("ada", true)]);
    expect(messages()).toEqual([]);
  });

  it("drops the notice for a host that leaves the configuration", async () => {
    await observe([host("ada", true), host("grace", true)]);
    await observe([host("ada", false), host("grace", true)]);
    expect(toasts.toasts().length).toBe(1);

    await observe([host("grace", true)]);
    expect(toasts.toasts().length).toBe(0);
  });

  it("treats a host that returns to the configuration as newly seen", async () => {
    await observe([host("ada", true)]);
    await observe([]);
    await observe([host("ada", false)]);

    // Not "lost sight of": this is a first sighting of a host that is down.
    expect(messages()).toEqual([]);
  });
});
