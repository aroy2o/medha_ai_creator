import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { isMockMode, sanitizeTags, buildAlternativesSummary, buildScoreBreakdown, generatePost } from "./generation";
import type { JudgedCandidate } from "./editorial/judge";
import type { DiscoveredCandidate } from "./discovery/types";
import type { EditorialCriteriaScores } from "./editorial/scoring";

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
      scores: { relevance: 5, substance: 5, timeliness: 5, novelty: 5, credibility: 5, corroboration: 6 },
      weightedTotal: score,
      noveltyScore: 0,
      mostSimilarPostId: null,
      mostSimilarPostLabel: null,
      sharedTerms: [],
      corroboratingSources: [],
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

describe("buildScoreBreakdown", () => {
  const scores: EditorialCriteriaScores = {
    relevance: 9,
    substance: 7.5,
    timeliness: 10,
    novelty: 8,
    credibility: 9,
    corroboration: 8,
  };

  it("states the weighted total and every criterion score", () => {
    const breakdown = buildScoreBreakdown(scores, 8.4);
    expect(breakdown).toContain("8.4/10");
    expect(breakdown).toContain("relevance 9/10");
    expect(breakdown).toContain("substance 7.5/10");
    expect(breakdown).toContain("timeliness 10/10");
    expect(breakdown).toContain("novelty 8/10");
    expect(breakdown).toContain("credibility 9/10");
    expect(breakdown).toContain("corroboration 8/10");
  });
});

function makeGenerationInput(overrides: Partial<Parameters<typeof generatePost>[0]> = {}) {
  return {
    persona: { name: "Medha", styleGuide: "grounded and precise", editorialStandards: "evidence-based" },
    winningCandidate: {
      title: "New inference engine cuts p99 latency by 18%",
      summary: "A production report on a new inference engine that reduced p99 latency under load.",
      url: "https://example.com/post",
      source: "Hacker News" as const,
      publishedAt: new Date().toISOString(),
    },
    weightedTotal: 7.5,
    scores: { relevance: 8, substance: 7, timeliness: 9, novelty: 7, credibility: 7, corroboration: 6 },
    alternatives: [],
    relatedPastPost: null,
    corroboratingSources: [],
    heldOverSince: null,
    ...overrides,
  };
}

describe("generatePost (mock mode)", () => {
  const original = { ...process.env };
  beforeEach(() => {
    process.env.MOCK_MODE = "true";
  });
  afterEach(() => {
    process.env = { ...original };
  });

  it("returns realistic, non-empty placeholder content without calling any network API", async () => {
    const result = await generatePost(makeGenerationInput());

    expect(result.text.length).toBeGreaterThan(20);
    expect(result.rationale).toMatch(/MOCK_MODE/);
    expect(result.topicTags.length).toBeGreaterThan(0);
    expect(result.stance).toBeTruthy();
    // no dangling truncation artifact from a hard-truncated summary
    expect(result.text).not.toMatch(/\.\s+[a-z]/);
  });

  it("includes the score breakdown in the rationale", () => {
    return generatePost(makeGenerationInput({ weightedTotal: 8.1 })).then((result) => {
      expect(result.rationale).toContain("8.1/10");
    });
  });

  it("mentions related prior coverage in the mock post when given a callback candidate", async () => {
    const result = await generatePost(
      makeGenerationInput({
        relatedPastPost: { label: "GPU cost optimization", sharedTerms: ["gpu", "cost"] },
      }),
    );
    expect(result.text).toContain("GPU cost optimization");
    expect(result.rationale).toContain("GPU cost optimization");
  });

  it("notes independent corroboration in the rationale when other sources covered the same story", async () => {
    const result = await generatePost(
      makeGenerationInput({ corroboratingSources: ["arXiv", "Simon Willison"] }),
    );
    expect(result.rationale).toContain("arXiv");
    expect(result.rationale).toContain("Simon Willison");
  });

  it("omits the corroboration note (though the score breakdown still reports the dimension) when there is none", async () => {
    const result = await generatePost(makeGenerationInput({ corroboratingSources: [] }));
    expect(result.rationale).not.toContain("Independently corroborated");
  });

  it("notes when a topic was previously held over for a stronger story", async () => {
    const result = await generatePost(makeGenerationInput({ heldOverSince: new Date("2026-08-05") }));
    expect(result.rationale).toMatch(/passed over/i);
  });

  it("says nothing about being held over when it wasn't", async () => {
    const result = await generatePost(makeGenerationInput({ heldOverSince: null }));
    expect(result.rationale).not.toMatch(/passed over/i);
  });
});
