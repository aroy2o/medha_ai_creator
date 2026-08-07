import { describe, expect, it } from "vitest";
import { extractKeywords } from "./keywords";

describe("extractKeywords", () => {
  it("returns nothing for empty input", () => {
    expect(extractKeywords("")).toEqual([]);
  });

  it("extracts multi-word capitalized entities intact", () => {
    const keywords = extractKeywords("A new paper on Global Workspace Theory in transformers.");
    expect(keywords).toContain("global workspace theory");
  });

  it("extracts hyphenated/versioned model names as single tokens", () => {
    const keywords = extractKeywords("DeepSeek-V4 beats GPT-4 on the new benchmark.");
    expect(keywords).toContain("deepseek-v4");
    expect(keywords).toContain("gpt-4");
  });

  it("filters common stopwords out of the unigram pass", () => {
    const keywords = extractKeywords("this is the way that models are being deployed");
    expect(keywords).not.toContain("this");
    expect(keywords).not.toContain("the");
    expect(keywords).not.toContain("that");
    expect(keywords).not.toContain("are");
  });

  it("keeps substantive unigrams", () => {
    const keywords = extractKeywords("Latency regressed after the rollout of the new inference engine.");
    expect(keywords).toContain("latency");
    expect(keywords).toContain("regressed");
    expect(keywords).toContain("inference");
  });

  it("drops sentence-initial capitalized common words without digits/hyphens", () => {
    const keywords = extractKeywords("The model failed silently in production.");
    // "The" alone shouldn't survive as a spurious 3-word-max entity token
    expect(keywords).not.toContain("the");
  });

  it("is deterministic and deduplicates", () => {
    const first = extractKeywords("Kubernetes outages caused by Kubernetes misconfiguration.");
    const second = extractKeywords("Kubernetes outages caused by Kubernetes misconfiguration.");
    expect(first).toEqual(second);
    expect(first.filter((k) => k === "kubernetes")).toHaveLength(1);
  });
});
