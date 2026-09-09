import { TestBed } from "@angular/core/testing";
import { provideZonelessChangeDetection } from "@angular/core";
import { ToastService } from "./toast.service";

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
});
