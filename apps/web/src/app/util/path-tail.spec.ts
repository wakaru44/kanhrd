import { pathTail } from "./path-tail";

describe("pathTail", () => {
  it("keeps the last two segments of a deep checkout, marked as truncated", () => {
    expect(pathTail("/home/op/workspace/src/github.com/wakaru44/kanhrd")).toBe("…/wakaru44/kanhrd");
  });

  it("renders a shallow path whole, with no ellipsis prefix", () => {
    expect(pathTail("/srv")).toBe("/srv");
    expect(pathTail("/home/op")).toBe("/home/op");
  });

  it("keeps a relative path relative", () => {
    expect(pathTail("op/kanhrd")).toBe("op/kanhrd");
    expect(pathTail("a/b/c")).toBe("…/b/c");
  });

  it("tolerates trailing and doubled separators without emitting empty segments", () => {
    expect(pathTail("/home/op/kanhrd/")).toBe("…/op/kanhrd");
    expect(pathTail("/home//op//kanhrd")).toBe("…/op/kanhrd");
  });

  it("does not rewrite the path in any other way — no $HOME collapsing, no case change", () => {
    expect(pathTail("/Users/Op/Src/KANHRD")).toBe("…/Src/KANHRD");
  });

  it("returns the input unchanged when there is nothing to take a tail of", () => {
    expect(pathTail("")).toBe("");
    expect(pathTail("/")).toBe("/");
  });
});
