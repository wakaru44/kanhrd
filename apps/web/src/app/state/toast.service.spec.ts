import { TestBed } from "@angular/core/testing";
import { provideZonelessChangeDetection } from "@angular/core";
import { PROGRESS_DELAY_MS, ToastService } from "./toast.service";

describe("ToastService", () => {
  let service: ToastService;

  beforeEach(() => {
    jasmine.clock().install();
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    service = TestBed.inject(ToastService);
  });

  afterEach(() => {
    jasmine.clock().uninstall();
  });

  it("push() enqueues a toast and dismiss() removes it", () => {
    const id = service.push({ level: "info", message: "hello" });
    expect(service.toasts().length).toBe(1);
    expect(service.toasts()[0]).toEqual(jasmine.objectContaining({ id, level: "info", message: "hello" }));

    service.dismiss(id);
    expect(service.toasts().length).toBe(0);
  });

  it("auto-dismisses after the default 5s timeout", () => {
    service.push({ level: "warn", message: "will expire" });
    expect(service.toasts().length).toBe(1);

    jasmine.clock().tick(4999);
    expect(service.toasts().length).toBe(1);

    jasmine.clock().tick(2);
    expect(service.toasts().length).toBe(0);
  });

  it("honors a custom timeoutMs", () => {
    service.push({ level: "info", message: "quick", timeoutMs: 1000 });
    jasmine.clock().tick(1001);
    expect(service.toasts().length).toBe(0);
  });

  it("persistent toasts never auto-dismiss", () => {
    service.push({ level: "warn", message: "sticky", persistent: true });
    jasmine.clock().tick(60_000);
    expect(service.toasts().length).toBe(1);
  });

  it("queues multiple toasts in push order", () => {
    service.push({ level: "info", message: "first" });
    service.push({ level: "error", message: "second" });
    expect(service.toasts().map((t) => t.message)).toEqual(["first", "second"]);
  });

  it("dismissTop() removes the most recently pushed toast", () => {
    service.push({ level: "info", message: "first", persistent: true });
    service.push({ level: "info", message: "second", persistent: true });
    service.dismissTop();
    expect(service.toasts().map((t) => t.message)).toEqual(["first"]);
  });

  it("dismissTop() is a no-op when nothing is showing", () => {
    expect(() => service.dismissTop()).not.toThrow();
    expect(service.toasts().length).toBe(0);
  });

  // --- deduplication -----------------------------------------------------
  //
  // Section 17.8: repeated failures must not build a wall of identical
  // notices the user has to dismiss one at a time.

  it("replaces an identical notice in place instead of stacking it", () => {
    const first = service.push({ level: "error", message: "couldn't split" });
    const second = service.push({ level: "error", message: "couldn't split" });

    expect(service.toasts().length).toBe(1);
    expect(second).toBe(first);
  });

  it("restarts the timer when an identical notice repeats", () => {
    service.push({ level: "error", message: "couldn't split" });
    jasmine.clock().tick(4000);
    service.push({ level: "error", message: "couldn't split" });

    jasmine.clock().tick(4000);
    expect(service.toasts().length).withContext("still showing, 4s into the new window").toBe(1);
    jasmine.clock().tick(1001);
    expect(service.toasts().length).toBe(0);
  });

  it("stacks notices that say different things", () => {
    service.push({ level: "error", message: "couldn't split" });
    service.push({ level: "error", message: "couldn't close" });
    expect(service.toasts().length).toBe(2);
  });

  it("treats the same text at a different level as a different notice", () => {
    service.push({ level: "warn", message: "lost the bridge. retrying." });
    service.push({ level: "error", message: "lost the bridge. retrying." });
    expect(service.toasts().length).toBe(2);
  });

  it("dedups by an explicit key even when the message changes", () => {
    // A per-host connection notice: the host is the identity, not the wording.
    service.push({ level: "warn", message: "lost sight of ada. retrying.", key: "host:ada", persistent: true });
    service.push({ level: "warn", message: "lost sight of ada. still retrying.", key: "host:ada", persistent: true });

    expect(service.toasts().length).toBe(1);
    expect(service.toasts()[0].message).toBe("lost sight of ada. still retrying.");
  });

  it("keeps one notice per host when several drop together", () => {
    for (const host of ["ada", "grace", "ada", "grace", "ada"]) {
      service.push({ level: "warn", message: `lost sight of ${host}. retrying.`, key: `host:${host}`, persistent: true });
    }
    expect(service.toasts().map((t) => t.key)).toEqual(["host:ada", "host:grace"]);
  });

  it("removes a notice by key, and shrugs at an unknown one", () => {
    service.push({ level: "warn", message: "lost sight of ada. retrying.", key: "host:ada", persistent: true });
    service.dismissByKey("host:ada");
    expect(service.toasts().length).toBe(0);

    expect(() => service.dismissByKey("host:nobody")).not.toThrow();
  });

  it("keeps a replaced notice in its original position in the stack", () => {
    service.push({ level: "info", message: "first", persistent: true });
    service.push({ level: "info", message: "second", persistent: true, key: "k" });
    service.push({ level: "info", message: "third", persistent: true });
    service.push({ level: "info", message: "second, updated", persistent: true, key: "k" });

    expect(service.toasts().map((t) => t.message)).toEqual(["first", "second, updated", "third"]);
  });

  // --- long-action progress ----------------------------------------------

  it("shows nothing for an action that finishes inside the delay", () => {
    const notice = service.progress("split:laptop:p1", "working…");
    jasmine.clock().tick(PROGRESS_DELAY_MS - 1);
    notice.resolve();

    jasmine.clock().tick(60_000);
    expect(service.toasts().length).toBe(0);
  });

  it("shows one persistent notice once the action outlives the delay", () => {
    service.progress("split:laptop:p1", "working…");
    jasmine.clock().tick(PROGRESS_DELAY_MS - 1);
    expect(service.toasts().length).toBe(0);

    jasmine.clock().tick(2);
    expect(service.toasts().map((t) => t.message)).toEqual(["working…"]);
    jasmine.clock().tick(60_000);
    expect(service.toasts().length).withContext("progress does not time out on its own").toBe(1);
  });

  it("removes the shown notice when the action completes", () => {
    const notice = service.progress("split:laptop:p1", "working…");
    jasmine.clock().tick(PROGRESS_DELAY_MS + 1);
    notice.resolve();
    expect(service.toasts().length).toBe(0);
  });

  it("turns the shown notice into the error, in place, on failure", () => {
    const notice = service.progress("split:laptop:p1", "working…");
    jasmine.clock().tick(PROGRESS_DELAY_MS + 1);
    notice.fail("couldn't split. herdr said: pane 3 is busy");

    expect(service.toasts().length).toBe(1);
    expect(service.toasts()[0].level).toBe("error");
    expect(service.toasts()[0].message).toBe("couldn't split. herdr said: pane 3 is busy");
    expect(service.toasts()[0].persistent).withContext("the error times out; the progress notice did not").toBeFalse();
  });

  it("reports a failure that arrives before the notice was ever shown", () => {
    const notice = service.progress("split:laptop:p1", "working…");
    jasmine.clock().tick(PROGRESS_DELAY_MS - 1);
    notice.fail("couldn't split. herdr said: pane 3 is busy");

    jasmine.clock().tick(PROGRESS_DELAY_MS);
    expect(service.toasts().map((t) => t.level)).toEqual(["error"]);
  });

  it("settles exactly once, whatever the caller does afterwards", () => {
    const notice = service.progress("split:laptop:p1", "working…");
    jasmine.clock().tick(PROGRESS_DELAY_MS + 1);
    notice.fail("couldn't split");
    notice.resolve();
    notice.fail("couldn't split, again");

    expect(service.toasts().map((t) => t.message)).toEqual(["couldn't split"]);
  });

  it("shares one notice across retries of the same action", () => {
    service.progress("split:laptop:p1", "working…").fail("couldn't split");
    service.progress("split:laptop:p1", "working…").fail("couldn't split, still");

    expect(service.toasts().length).toBe(1);
    expect(service.toasts()[0].message).toBe("couldn't split, still");
  });
});
