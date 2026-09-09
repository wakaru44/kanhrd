import { hostColor } from "./host-color";

describe("hostColor", () => {
  it("returns the same color for the same host name every call", () => {
    expect(hostColor("laptop")).toBe(hostColor("laptop"));
  });

  it("returns a color for different-looking hosts (not necessarily distinct)", () => {
    expect(hostColor("laptop")).toMatch(/^#[0-9a-f]{6}$/i);
    expect(hostColor("desktop")).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it("handles an empty string without throwing", () => {
    expect(() => hostColor("")).not.toThrow();
  });
});
