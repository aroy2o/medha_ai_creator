import { describe, expect, it } from "vitest";
import { categorizeRejectionReason } from "./editorialLogDisplay";

describe("categorizeRejectionReason", () => {
  it("recognizes a memory-dedup rejection", () => {
    expect(categorizeRejectionReason('Too similar to an existing post ("X") — 20% keyword overlap.').tone).toBe(
      "dedup",
    );
  });

  it("recognizes an off-domain rejection", () => {
    expect(categorizeRejectionReason("No detected connection to Aria's domain.").tone).toBe("off-domain");
  });

  it("recognizes a generation failure", () => {
    expect(
      categorizeRejectionReason("Cleared the editorial bar at 7/10 but generation failed this cycle (timeout).")
        .tone,
    ).toBe("generation-failed");
  });

  it("recognizes a below-bar rejection", () => {
    expect(categorizeRejectionReason("Scored 4.2/10 — below the 6/10 publish bar.").tone).toBe("below-bar");
  });

  it("recognizes an outranked rejection", () => {
    expect(categorizeRejectionReason('Cleared the editorial bar at 7.1/10 but ranked below "Y" (9/10).').tone).toBe(
      "outranked",
    );
  });

  it("falls back to a generic label for unrecognized text", () => {
    expect(categorizeRejectionReason("something unexpected").tone).toBe("other");
  });
});
