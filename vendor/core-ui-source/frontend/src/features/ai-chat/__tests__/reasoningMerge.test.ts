/**
 * `mergeReasoning` — coalesces a turn's reasoning segments into ONE growing
 * string so the live thinking stream renders as a single smooth block (jvchat
 * parity) instead of one discrete block per backend reasoning tick.
 */
import { describe, it, expect } from "vitest";
import { mergeReasoning } from "../useAIChatRuntime";

describe("mergeReasoning", () => {
  it("joins two segments in order with a blank line", () => {
    const order = ["a", "b"];
    const segs = new Map<string, string>([
      ["a", "first thought"],
      ["b", "second thought"],
    ]);
    expect(mergeReasoning(order, segs)).toBe("first thought\n\nsecond thought");
  });

  it("accepts a plain record as well as a Map", () => {
    const order = ["a", "b"];
    const segs = { a: "one", b: "two" };
    expect(mergeReasoning(order, segs)).toBe("one\n\ntwo");
  });

  it("returns the single segment unchanged when there is only one", () => {
    expect(mergeReasoning(["a"], { a: "solo" })).toBe("solo");
  });

  it("respects the provided order, not insertion order of the map", () => {
    const segs = new Map<string, string>([
      ["b", "B"],
      ["a", "A"],
    ]);
    expect(mergeReasoning(["a", "b"], segs)).toBe("A\n\nB");
  });

  it("skips empty / missing segments", () => {
    const segs = new Map<string, string>([
      ["a", "kept"],
      ["b", ""],
    ]);
    expect(mergeReasoning(["a", "b", "c"], segs)).toBe("kept");
  });

  it("returns an empty string for no segments", () => {
    expect(mergeReasoning([], new Map())).toBe("");
    expect(mergeReasoning([], {})).toBe("");
  });
});
