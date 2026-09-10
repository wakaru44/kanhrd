import { TestBed } from "@angular/core/testing";
import { provideZonelessChangeDetection } from "@angular/core";
import { BoardReturnService, returnFocusTarget } from "./board-return.service";

describe("returnFocusTarget (pure)", () => {
  const column = ["laptop:a", "laptop:b", "laptop:c"];

  it("returns the opened card when it is still in its column", () => {
    expect(returnFocusTarget("laptop:b", 1, column)).toBe("laptop:b");
  });

  it("returns the card now standing where it stood when it is gone", () => {
    expect(returnFocusTarget("laptop:b", 1, ["laptop:a", "laptop:c", "laptop:d"])).toBe("laptop:c");
  });

  it("clamps to the last card when the column shrank past the remembered index", () => {
    expect(returnFocusTarget("laptop:c", 2, ["laptop:a"])).toBe("laptop:a");
  });

  it("finds the card even when it moved within its column", () => {
    expect(returnFocusTarget("laptop:c", 0, column)).toBe("laptop:c");
  });

  it("has no target for a column that emptied out", () => {
    expect(returnFocusTarget("laptop:b", 1, [])).toBeNull();
  });

  it("falls back by index when the board was left without opening a card", () => {
    expect(returnFocusTarget(null, 0, column)).toBe("laptop:a");
  });

  it("tolerates a negative or absurd index", () => {
    expect(returnFocusTarget("gone", -3, column)).toBe("laptop:a");
    expect(returnFocusTarget("gone", 99, column)).toBe("laptop:c");
  });
});

describe("BoardReturnService", () => {
  let service: BoardReturnService;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    service = TestBed.inject(BoardReturnService);
  });

  const geometry = {
    url: "/workspace/w1/tab/t1",
    scrollLeft: 780,
    scrollTops: { working: 240 },
  };

  it("sends a pane's back control to / until a board has been remembered", () => {
    expect(service.boardUrl()).toBe("/");
  });

  it("remembers the scoped URL the card was opened from", () => {
    service.rememberCard("laptop:p1", "working", 3);
    service.rememberBoard(geometry);
    expect(service.boardUrl()).toBe("/workspace/w1/tab/t1");
  });

  it("folds the clicked card into the geometry half", () => {
    service.rememberCard("laptop:p1", "working", 3);
    service.rememberBoard(geometry);

    expect(service.take()).toEqual({
      url: "/workspace/w1/tab/t1",
      scrollLeft: 780,
      scrollTops: { working: 240 },
      paneKey: "laptop:p1",
      status: "working",
      index: 3,
    });
  });

  it("records a departure that opened no card", () => {
    service.rememberBoard(geometry);
    const record = service.take();

    expect(record?.paneKey).toBeNull();
    expect(record?.status).toBeNull();
    expect(record?.scrollLeft).toBe(780);
  });

  it("does not let a later departure inherit an earlier visit's card", () => {
    service.rememberCard("laptop:p1", "working", 3);
    service.rememberBoard(geometry);
    service.take();

    // Second visit, left through the rail rather than a card.
    service.rememberBoard({ ...geometry, url: "/" });
    expect(service.take()?.paneKey).toBeNull();
  });

  it("is good for exactly one return", () => {
    service.rememberBoard(geometry);
    expect(service.take()).not.toBeNull();
    expect(service.take()).toBeNull();
    expect(service.boardUrl()).toBe("/");
  });

  it("keeps only the most recent board position", () => {
    service.rememberBoard(geometry);
    service.rememberBoard({ ...geometry, url: "/", scrollLeft: 0 });
    expect(service.take()?.url).toBe("/");
  });

  it("clear() forgets both halves", () => {
    service.rememberCard("laptop:p1", "working", 3);
    service.rememberBoard(geometry);
    service.clear();

    expect(service.take()).toBeNull();
    service.rememberBoard(geometry);
    expect(service.take()?.paneKey).toBeNull();
  });
});
