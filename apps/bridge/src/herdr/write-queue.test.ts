import { describe, expect, it } from "vitest";
import { PaneWriteQueue } from "./write-queue.js";

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("PaneWriteQueue", () => {
  it("runs 20 concurrent writes to the same pane in enqueue order despite random delays", async () => {
    const queue = new PaneWriteQueue();
    const order: number[] = [];

    const writes = Array.from({ length: 20 }, (_, i) =>
      queue.enqueue("local", "w6:p1", async () => {
        await delay(5 + Math.random() * 15); // 5-20ms, matches herdr's real socket-latency jitter
        order.push(i);
      }),
    );

    await Promise.all(writes);

    expect(order).toEqual(Array.from({ length: 20 }, (_, i) => i));
  });

  it("does not serialize writes to different panes against each other", async () => {
    const queue = new PaneWriteQueue();
    const order: string[] = [];

    await Promise.all([
      queue.enqueue("local", "p1", async () => {
        await delay(20);
        order.push("p1-slow");
      }),
      queue.enqueue("local", "p2", async () => {
        order.push("p2-fast");
      }),
    ]);

    // p2's write isn't blocked behind p1's slower one — different pane_id, independent queue.
    expect(order).toEqual(["p2-fast", "p1-slow"]);
  });

  it("keeps queueing subsequent writes even if an earlier one rejects", async () => {
    const queue = new PaneWriteQueue();
    const order: string[] = [];

    const first = queue.enqueue("local", "p1", async () => {
      throw new Error("boom");
    });
    const second = queue.enqueue("local", "p1", async () => {
      order.push("second");
    });

    await expect(first).rejects.toThrow("boom");
    await second;
    expect(order).toEqual(["second"]);
  });
});
