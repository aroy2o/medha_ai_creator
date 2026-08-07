import { describe, expect, it } from "vitest";
import { jaccardSimilarity, sharedTerms } from "./similarity";

describe("jaccardSimilarity", () => {
  it("is 0 for two empty sets", () => {
    expect(jaccardSimilarity(new Set(), new Set())).toBe(0);
  });

  it("is 1 for identical non-empty sets", () => {
    const a = new Set(["gpu", "latency", "inference"]);
    expect(jaccardSimilarity(a, new Set(a))).toBe(1);
  });

  it("is 0 for fully disjoint sets", () => {
    const a = new Set(["gpu", "latency"]);
    const b = new Set(["reddit", "pizza"]);
    expect(jaccardSimilarity(a, b)).toBe(0);
  });

  it("computes the standard intersection-over-union ratio", () => {
    const a = new Set(["a", "b", "c"]);
    const b = new Set(["b", "c", "d"]);
    // intersection {b,c} = 2, union {a,b,c,d} = 4
    expect(jaccardSimilarity(a, b)).toBeCloseTo(0.5);
  });

  it("is symmetric", () => {
    const a = new Set(["a", "b", "c", "d"]);
    const b = new Set(["c", "d", "e"]);
    expect(jaccardSimilarity(a, b)).toBeCloseTo(jaccardSimilarity(b, a));
  });
});

describe("sharedTerms", () => {
  it("returns the intersection contents", () => {
    const a = new Set(["gpu", "latency", "cost"]);
    const b = new Set(["latency", "cost", "reddit"]);
    expect(sharedTerms(a, b).sort()).toEqual(["cost", "latency"]);
  });
});
