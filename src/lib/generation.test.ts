import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { isMockMode, sanitizeTags, buildAlternativesSummary, generatePost } from "./generation";
import type { JudgedCandidate } from "./editorial/judge";
import type { DiscoveredCandidate } from "./discovery/types";

describe("isMockMode", () => {
  const original = { ...process.env };
  afterEach(() => {
    process.env = { ...original };
  });

  it("is true when GROQ_API_KEY is unset", () => {
    delete process.env.GROQ_API_KEY;
    delete process.env.MOCK_MODE;
    expect(isMockMode()).toBe(true);
  });

  it("is true when MOCK_MODE=true even with a key present", () => {
    process.env.GROQ_API_KEY = "test-key";
    process.env.MOCK_MODE = "true";
    expect(isMockMode()).toBe(true);
  });

  it("is false when a key is present and MOCK_MODE is not true", () => {
    process.env.GROQ_API_KEY = "test-key";
    process.env.MOCK_MODE = "false";
    expect(isMockMode()).toBe(false);
  });
});

describe("sanitizeTags", () => {
  it("lowercases, trims, and dedupes valid tags", () => {
    expect(sanitizeTags(["  GPU ", "gpu", "Latency"], "fallback text")).toEqual(["gpu", "latency"]);
  });

  it("caps at 6 tags", () => {
    const many = Array.from({ length: 10 }, (_, i) => `tag${i}`);
    expect(sanitizeTags(many, "fallback")).toHaveLength(6);
  });

  it("falls back to extracted keywords when the model returns nothing usable", () => {
    const tags = sanitizeTags(null, "GPU inference latency regressed after the rollout.");
    expect(tags.length).toBeGreaterThan(0);
  });

  it("falls back when given a non-array", () => {
    const tags = sanitizeTags("not an array", "Kubernetes autoscaling outage postmortem.");
    expect(tags.length).toBeGreaterThan(0);
  });
});

function makeJudged(title: string, score: number, category: JudgedCandidate["category"]): JudgedCandidate {
  const candidate: DiscoveredCandidate = {
    title,
    summary: "summary",
    url: "https://example.com",
    source: "Hacker News",
    publishedAt: null,
  };
  return {
    verdict: {
      candidate,
      scores: { relevance: 5, substance: 5, timeliness: 5, novelty: 5, credibility: 5 },
      weightedTotal: score,
      noveltyScore: 0,
      mostSimilarPostId: null,
      mostSimilarPostLabel: null,
      sharedTerms: [],
      hardRejectReason: category === "hard_reject" ? "off-domain" : null,
    },
    category,
    reason: "test reason",
  };
}

describe("buildAlternativesSummary", () => {
  it("says nothing else cleared discovery when the list is empty", () => {
    expect(buildAlternativesSummary([])).toMatch(/no other candidates/i);
  });

  it("mentions outranked candidates by name and score", () => {
    const summary = buildAlternativesSummary([makeJudged("Topic B", 7.2, "outranked")]);
    expect(summary).toContain("Topic B");
    expect(summary).toContain("7.2");
  });

  it("mentions a count of outright-rejected candidates separately from outranked ones", () => {
    const summary = buildAlternativesSummary([
      makeJudged("Topic B", 7.2, "outranked"),
      makeJudged("Topic C", 3.1, "below_bar"),
      makeJudged("Topic D", 0, "hard_reject"),
    ]);
    expect(summary).toContain("Topic B");
    expect(summary).toMatch(/2 more candidate/);
  });
});

describe("generatePost (mock mode)", () => {
  const original = { ...process.env };
  beforeEach(() => {
    process.env.MOCK_MODE = "true";
  });
  afterEach(() => {
    process.env = { ...original };
  });

  it("returns realistic, non-empty placeholder content without calling any network API", async () => {
    const result = await generatePost({
      persona: { name: "Medha", styleGuide: "grounded and precise", editorialStandards: "evidence-based" },
      winningCandidate: {
        title: "New inference engine cuts p99 latency by 18%",
        summary: "A production report on a new inference engine that reduced p99 latency under load.",
        url: "https://example.com/post",
        source: "Hacker News",
        publishedAt: new Date().toISOString(),
      },
      weightedTotal: 7.5,
      alternatives: [],
    });

    expect(result.text.length).toBeGreaterThan(20);
    expect(result.rationale).toMatch(/MOCK_MODE/);
    expect(result.topicTags.length).toBeGreaterThan(0);
    // no dangling truncation artifact from a hard-truncated summary
    expect(result.text).not.toMatch(/\.\s+[a-z]/);
  });
});
