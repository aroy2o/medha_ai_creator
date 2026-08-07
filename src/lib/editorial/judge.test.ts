import { describe, expect, it } from "vitest";
import { judgeCandidates } from "./judge";
import type { DiscoveredCandidate } from "@/lib/discovery/types";

function makeCandidate(overrides: Partial<DiscoveredCandidate>): DiscoveredCandidate {
  return {
    title: "untitled",
    summary: "",
    url: "https://example.com",
    source: "Hacker News",
    publishedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("judgeCandidates", () => {
  it("returns a null winner and no considered list when given no candidates", () => {
    const result = judgeCandidates({ candidates: [], pastPosts: [], domainVocabulary: [] });
    expect(result.winner).toBeNull();
    expect(result.considered).toEqual([]);
  });

  it("returns a null winner when every candidate is off-domain (all hard-rejected)", () => {
    const result = judgeCandidates({
      candidates: [
        makeCandidate({ title: "Sourdough bread recipes", summary: "Baking tips for beginners." }),
        makeCandidate({ title: "Best hiking trails in Colorado", summary: "A travel guide." }),
      ],
      pastPosts: [],
      domainVocabulary: [],
    });
    expect(result.winner).toBeNull();
    expect(result.considered).toHaveLength(2);
    expect(result.considered.every((c) => c.category === "hard_reject")).toBe(true);
  });

  it("picks the highest-scoring candidate as winner and logs the rest as outranked", () => {
    const strong = makeCandidate({
      title: "Postmortem: GPU autoscaling flap caused a 20-minute inference outage",
      summary:
        "A detailed postmortem with benchmark data showing latency regression, root cause analysis " +
        "of a Kubernetes readiness probe misconfiguration, and the fix that restored throughput.",
      source: "arXiv",
    });
    const weaker = makeCandidate({
      title: "Inference cost discussion",
      summary: "A brief note mentioning GPU cost and latency in passing.",
      source: "Reddit r/MachineLearning",
    });

    const result = judgeCandidates({
      candidates: [strong, weaker],
      pastPosts: [],
      domainVocabulary: [],
    });

    expect(result.winner?.candidate.title).toBe(strong.title);
    // the weaker candidate should appear in considered, either as
    // below_bar or outranked depending on exactly where it scores —
    // either way it must not silently vanish.
    expect(result.considered.some((c) => c.verdict.candidate.title === weaker.title)).toBe(true);
  });

  it("caps the logged rejection list even with many candidates", () => {
    const candidates = Array.from({ length: 20 }, (_, i) =>
      makeCandidate({
        title: `Inference latency benchmark report #${i}`,
        summary: `Benchmark data showing latency and throughput regression #${i}, with root cause analysis.`,
      }),
    );
    const result = judgeCandidates({ candidates, pastPosts: [], domainVocabulary: [] });
    expect(result.considered.length).toBeLessThanOrEqual(8);
  });

  it("gives every logged rejection a non-empty, human-readable reason", () => {
    const result = judgeCandidates({
      candidates: [
        makeCandidate({ title: "Sourdough bread recipes", summary: "Baking tips." }),
        makeCandidate({
          title: "GPU inference cost breakdown",
          summary: "A short note on GPU inference cost.",
        }),
      ],
      pastPosts: [],
      domainVocabulary: [],
    });
    for (const item of result.considered) {
      expect(item.reason.length).toBeGreaterThan(10);
    }
  });
});
