import { describe, expect, it } from "vitest";
import {
  scoreRelevance,
  scoreSubstance,
  scoreTimeliness,
  scoreCredibility,
  scoreCandidate,
  APPROVAL_THRESHOLD,
  BASE_DOMAIN_VOCABULARY,
} from "./scoring";
import type { DiscoveredCandidate } from "@/lib/discovery/types";

describe("scoreRelevance", () => {
  it("is 0 for text with no domain-vocabulary matches", () => {
    expect(scoreRelevance("A recipe for sourdough bread with a crispy crust.", BASE_DOMAIN_VOCABULARY)).toBe(0);
  });

  it("scales up with more distinct domain matches, capped at 10", () => {
    const oneHit = scoreRelevance("This is about GPU costs.", BASE_DOMAIN_VOCABULARY);
    const fourHits = scoreRelevance(
      "This covers GPU cost, inference latency, an outage postmortem, and monitoring gaps.",
      BASE_DOMAIN_VOCABULARY,
    );
    expect(oneHit).toBeGreaterThan(0);
    expect(fourHits).toBeGreaterThan(oneHit);
    expect(fourHits).toBeLessThanOrEqual(10);
  });
});

describe("scoreSubstance", () => {
  it("scores hype-heavy text below the neutral baseline", () => {
    const score = scoreSubstance(
      "This revolutionary, game-changing model will unleash a paradigm shift and change everything!",
    );
    expect(score).toBeLessThan(5);
  });

  it("scores technically substantive text above the neutral baseline", () => {
    const score = scoreSubstance(
      "The paper's benchmark shows a 12% latency regression versus the baseline, with ablation results in the appendix.",
    );
    expect(score).toBeGreaterThan(5);
  });

  it("stays within 0-10 bounds", () => {
    const veryHypey = scoreSubstance(
      "revolutionary game-changing unleash supercharge insane unbelievable magic 10x 100x disrupt paradigm shift",
    );
    expect(veryHypey).toBeGreaterThanOrEqual(0);
  });
});

describe("scoreTimeliness", () => {
  it("scores a same-day item at the maximum", () => {
    expect(scoreTimeliness(new Date().toISOString(), "Hacker News")).toBe(10);
  });

  it("scores a month-old item low", () => {
    const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    expect(scoreTimeliness(monthAgo, "Hacker News")).toBe(1);
  });

  it("treats an unknown date from GitHub Trending as inherently timely", () => {
    expect(scoreTimeliness(null, "GitHub Trending")).toBeGreaterThan(scoreTimeliness(null, "Hacker News"));
  });
});

describe("scoreCredibility", () => {
  it("ranks arXiv above Reddit", () => {
    expect(scoreCredibility("arXiv")).toBeGreaterThan(scoreCredibility("Reddit r/MachineLearning"));
  });
});

function candidate(overrides: Partial<DiscoveredCandidate> = {}): DiscoveredCandidate {
  return {
    title: "Latency regression traced to a bad readiness probe",
    summary:
      "A postmortem detailing how a Kubernetes readiness probe misconfiguration caused a " +
      "20% inference latency regression under load, with benchmark data before and after the fix.",
    url: "https://example.com/postmortem",
    source: "Hacker News",
    publishedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("scoreCandidate", () => {
  it("hard-rejects a topic with zero domain relevance regardless of other scores", () => {
    const verdict = scoreCandidate({
      candidate: candidate({
        title: "Best sourdough starter recipes",
        summary: "A roundup of community-favorite sourdough starter recipes and baking tips.",
      }),
      pastPosts: [],
      domainVocabulary: [],
    });
    expect(verdict.hardRejectReason).toMatch(/domain/i);
  });

  it("hard-rejects a near-duplicate of an existing post via the memory gate", () => {
    const verdict = scoreCandidate({
      candidate: candidate({
        title: "DeepSeek-V4 Flash benchmark results",
        summary: "DeepSeek-V4 Flash shows a 30% latency improvement over V3 in new benchmarks.",
      }),
      pastPosts: [
        {
          id: "post-1",
          text: "DeepSeek-V4 Flash shipped with a 30% latency improvement over V3 according to new benchmarks.",
          topicTags: ["deepseek-v4", "benchmarks"],
        },
      ],
      domainVocabulary: [],
    });
    expect(verdict.hardRejectReason).toMatch(/similar/i);
  });

  it("does not hard-reject a genuinely relevant, novel, technical candidate", () => {
    const verdict = scoreCandidate({
      candidate: candidate(),
      pastPosts: [],
      domainVocabulary: [],
    });
    expect(verdict.hardRejectReason).toBeNull();
    expect(verdict.weightedTotal).toBeGreaterThan(0);
  });

  it("produces a weighted total on a 0-10 scale", () => {
    const verdict = scoreCandidate({ candidate: candidate(), pastPosts: [], domainVocabulary: [] });
    expect(verdict.weightedTotal).toBeGreaterThanOrEqual(0);
    expect(verdict.weightedTotal).toBeLessThanOrEqual(10);
  });
});

describe("APPROVAL_THRESHOLD", () => {
  it("is documented as a 0-10 scale value", () => {
    expect(APPROVAL_THRESHOLD).toBeGreaterThan(0);
    expect(APPROVAL_THRESHOLD).toBeLessThanOrEqual(10);
  });
});
